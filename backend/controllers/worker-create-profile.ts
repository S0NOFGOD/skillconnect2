import type { RequestHandler } from 'express';
import multer from 'multer';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import prisma from '../lib/prisma.js';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const MAX_OPTIMIZED_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return callback(new Error('INVALID_PROFILE_PHOTO'));
    }
    callback(null, true);
  },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const normalizeName = (name: string) =>
  name.trim().split(/\s+/).map(part =>
    part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()
  ).join(' ');

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('234') ? `0${digits.slice(3)}` : digits;
};

const optimizePhoto = async (buffer: Buffer) => {
  for (const quality of [85, 75, 65, 55, 45, 35]) {
    const optimized = await sharp(buffer)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    if (optimized.length <= MAX_OPTIMIZED_SIZE) return optimized;
  }

  throw new Error('PHOTO_OPTIMIZATION_FAILED');
};

const uploadPhoto = (buffer: Buffer) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'skillconnect/workers/profile-photos', resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error || new Error('UPLOAD_FAILED'));
        resolve(result);
      }
    ).end(buffer);
  });

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const createWorkerProfile: RequestHandler = (req, res, next) => {
  upload.single('profilePhoto')(req, res, async error => {
    if (error) {
      const code = error instanceof multer.MulterError
        ? error.code === 'LIMIT_FILE_SIZE' ? 'PROFILE_PHOTO_TOO_LARGE' : 'INVALID_PROFILE_PHOTO'
        : error.message === 'INVALID_PROFILE_PHOTO' ? 'INVALID_PROFILE_PHOTO' : 'UPLOAD_ERROR';

      res.status(400).json({
        success: false,
        code,
        message: code === 'PROFILE_PHOTO_TOO_LARGE'
          ? 'Profile photo must not exceed 10MB.'
          : 'Please upload a valid JPG, PNG or WebP photo.',
      });
      return;
    }

    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const fullName = String(req.body.fullName || '').trim();
      const rawPhone = String(req.body.phone || '').trim();
      const rawLatitude = req.body.latitude;
      const rawLongitude = req.body.longitude;
      const photo = req.file;

      if (!email) {
        res.status(400).json({ success: false, code: 'EMAIL_REQUIRED', message: 'Email is required.' });
        return;
      }

      if (!photo) {
        res.status(400).json({ success: false, code: 'PROFILE_PHOTO_REQUIRED', message: 'Profile photo is required.' });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ success: false, code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
        return;
      }

      if (!/^[\p{L}]+(?:['’-][\p{L}]+)?\s+[\p{L}]+(?:['’-][\p{L}]+)?$/u.test(fullName)) {
        res.status(400).json({ success: false, code: 'INVALID_FULL_NAME', message: 'Enter exactly two names.' });
        return;
      }

      const phone = normalizePhone(rawPhone);

      if (!/^0[789]\d{9}$/.test(phone)) {
        res.status(400).json({ success: false, code: 'INVALID_PHONE', message: 'Enter a valid Nigerian phone number.' });
        return;
      }

      if (rawLatitude === undefined || rawLatitude === '' || rawLongitude === undefined || rawLongitude === '') {
        res.status(400).json({ success: false, code: 'INVALID_LOCATION', message: 'Location coordinates are required.' });
        return;
      }

      const latitude = Number(rawLatitude);
      const longitude = Number(rawLongitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        res.status(400).json({ success: false, code: 'INVALID_LOCATION', message: 'Enter valid location coordinates.' });
        return;
      }

      const worker = await prisma.worker.findUnique({ where: { email } });

      if (!worker) {
        res.status(404).json({ success: false, code: 'WORKER_NOT_FOUND', message: 'Worker account was not found.' });
        return;
      }

      if (!worker.emailVerified) {
        res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before creating your profile.' });
        return;
      }

      const existingPhone = await prisma.worker.findFirst({ where: { phone } });

      if (existingPhone) {
        res.status(409).json({ success: false, code: 'PHONE_ALREADY_EXISTS', message: 'This phone number is already registered.' });
        return;
      }

      const optimizedPhoto = await optimizePhoto(photo.buffer);
      const uploadedPhoto = await uploadPhoto(optimizedPhoto);

      const accessSecret = process.env.ACCESS_TOKEN_SECRET;
      const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

      if (!accessSecret || !refreshSecret) {
        res.status(500).json({ success: false, code: 'SERVER_CONFIGURATION_ERROR', message: 'Server configuration error.' });
        return;
      }

      const accessExpiry = process.env.ACCESS_TOKEN_EXPIRE || '15m';
      const refreshExpiry = process.env.REFRESH_TOKEN_EXPIRE || '7d';

      const accessToken = jwt.sign(
        { userId: worker.id, userType: 'worker' },
        accessSecret,
        { expiresIn: accessExpiry as jwt.SignOptions['expiresIn'] }
      );

      const refreshToken = jwt.sign(
        { userId: worker.id, userType: 'worker' },
        refreshSecret,
        { expiresIn: refreshExpiry as jwt.SignOptions['expiresIn'] }
      );

      await prisma.worker.update({
        where: { id: worker.id },
        data: {
          profilePhoto: uploadedPhoto.public_id,
          fullName: normalizeName(fullName),
          phone,
          latitude,
          longitude,
          profileCompleted: true,
          refreshTokenHash: hashToken(refreshToken),
        },
      });

      const production = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' : 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        code: 'PROFILE_COMPLETED',
        message: 'Your worker profile has been created successfully.',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PHOTO_OPTIMIZATION_FAILED') {
        res.status(400).json({
          success: false,
          code: 'PHOTO_OPTIMIZATION_FAILED',
          message: 'Unable to optimize this photo. Please choose another image.',
        });
        return;
      }

      next(error);
    }
  });
};