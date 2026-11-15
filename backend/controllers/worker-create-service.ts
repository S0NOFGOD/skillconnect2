import type { RequestHandler } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { authenticateWorker } from './worker-authentication.js';
import prisma from '../lib/prisma.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_OPTIMIZED_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 3
    }
});

const sendError = (res: Parameters<RequestHandler>[1], status: number, message: string) =>
    res.status(status).json({ success: false, message });

const optimizeImage = async (buffer: Buffer): Promise<Buffer> => {
    let width = 1600;
    let quality = 80;

    for (let attempt = 0; attempt < 12; attempt++) {
        const optimized = await sharp(buffer)
            .rotate()
            .resize({
                width,
                height: width,
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

        if (optimized.length <= MAX_OPTIMIZED_SIZE)
            return optimized;

        quality = Math.max(35, quality - 10);
        width = Math.max(400, width - 200);
    }

    throw new Error('Unable to optimize image below 5 MB.');
};

const uploadToCloudinary = (buffer: Buffer, workerId: string): Promise<string> =>
    new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({
            folder: `skillconnect/workers/${workerId}/services`,
            resource_type: 'image',
            format: 'jpg'
        }, (error, result) => {
            if (error || !result)
                return reject(error || new Error('Image upload failed.'));

            resolve(result.public_id);
        }).end(buffer);
    });

const deleteUploadedImages = async (publicIds: string[]) => {
    await Promise.allSettled(
        publicIds.map(publicId =>
            cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
        )
    );
};

const handleCreateWorkerService: RequestHandler = async (req, res) => {
    const uploadedIds: string[] = [];

    try {
        const workerId = res.locals.workerId as string;
        const skill = typeof req.body.skill === 'string' ? req.body.skill.trim() : '';
        const experience = typeof req.body.experience === 'string'
            ? req.body.experience.trim()
            : '';
        const description = typeof req.body.description === 'string'
            ? req.body.description.trim()
            : '';

        const files = req.files as Express.Multer.File[] | undefined;

        if (!skill)
            return sendError(res, 400, 'Please select a skill.');

        if (!experience)
            return sendError(res, 400, 'Please select your experience.');

        if (!description)
            return sendError(res, 400, 'Please enter a service description.');

        if (description.split(/\s+/).filter(Boolean).length > 150)
            return sendError(res, 400, 'Your description must not exceed 150 words.');

        if (!files || files.length !== 3)
            return sendError(res, 400, 'Please upload all three portfolio images.');

        const invalidTypes = files
            .map((file, index) => !ALLOWED_TYPES.includes(file.mimetype) ? index + 1 : 0)
            .filter(Boolean);

        if (invalidTypes.length)
            return sendError(
                res,
                400,
                `Image format error: please change portfolio ${invalidTypes.join(', ')}. JPG, PNG or WebP only.`
            );

        const worker = await prisma.worker.findUnique({
            where: { id: workerId },
            select: {
                id: true,
                profileVerificationExpires: true,
                services: {
                    select: { skill: true }
                }
            }
        });

        if (!worker)
            return sendError(res, 404, 'Worker account not found.');

        if (worker.services.length >= 1) {
            const verificationExpires = worker.profileVerificationExpires;

            if (!verificationExpires || verificationExpires <= new Date())
                return sendError(
                    res,
                    403,
                    'Your profile verification has expired. Please verify your profile before creating another service.'
                );

            const duplicateSkill = worker.services.some(
                service => service.skill.trim().toLowerCase() === skill.toLowerCase()
            );

            if (duplicateSkill)
                return sendError(
                    res,
                    409,
                    'You have already created a service for this skill.'
                );
        }

        const optimizedImages: Buffer[] = [];
        const imageErrors: number[] = [];

        for (let index = 0; index < files.length; index++) {
            try {
                optimizedImages.push(await optimizeImage(files[index].buffer));
            } catch {
                imageErrors.push(index + 1);
            }
        }

        if (imageErrors.length)
            return sendError(
                res,
                400,
                `Image decode error: please change portfolio ${imageErrors.join(', ')} and try again.`
            );

        if (
            !process.env.CLOUDINARY_CLOUD_NAME ||
            !process.env.CLOUDINARY_API_KEY ||
            !process.env.CLOUDINARY_API_SECRET
        )
            return sendError(res, 500, 'Image upload is not configured.');

        for (const image of optimizedImages)
            uploadedIds.push(await uploadToCloudinary(image, workerId));

        const service = await prisma.service.create({
            data: {
                workerId,
                skill,
                experience,
                description,
                portfolio: uploadedIds,
                date: new Date(),
                adminApproval: 'Under Review',
                adminResponse: 'It may take up to 24 hours for admin update'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Your service has been added successfully.',
            serviceId: service.id
        });
    } catch (error) {
        console.error('Worker create service error:', error);

        await deleteUploadedImages(uploadedIds);

        sendError(res, 500, 'Unable to create your service. Please try again.');
    }
};

export const createWorkerService: RequestHandler = (req, res, next) => {
    authenticateWorker(req, res, (authError?: unknown) => {
        if (authError) return next(authError);

        upload.array('portfolioPhotos', 3)(req, res, (uploadError?: unknown) => {
            if (uploadError) {
                if (uploadError instanceof multer.MulterError) {
                    const message = uploadError.code === 'LIMIT_FILE_SIZE'
                        ? 'Each portfolio image must not exceed 10 MB.'
                        : 'Please upload exactly three portfolio images.';

                    return sendError(res, 400, message);
                }

                return sendError(res, 400, 'Unable to process your portfolio images.');
            }

            handleCreateWorkerService(req, res, next);
        });
    });
};