import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../lib/prisma.js';
import { authenticateWorker } from './worker-authentication.js';

const OTP_EXPIRY = 10 * 60 * 1000;
const COOLDOWN = 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 4;
const EARTH_RADIUS = 6371;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const sendError = (res: any, status: number, message: string) =>
    res.status(status).json({ success: false, message });

const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');

    if (!/^0[789][01]\d{8}$/.test(cleaned))
        throw new Error('Please provide a valid Nigerian phone number.');

    return `+234${cleaned.slice(1)}`;
};

const formatProfilePhoto = (photo: string | null) => {
    if (!photo) return null;
    if (/^https?:\/\//i.test(photo)) return photo;

    return cloudinary.url(photo, { secure: true });
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const radians = (value: number) => value * Math.PI / 180;
    const latitudeDifference = radians(lat2 - lat1);
    const longitudeDifference = radians(lon2 - lon1);

    const calculation =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(longitudeDifference / 2) ** 2;

    return EARTH_RADIUS * 2 * Math.atan2(
        Math.sqrt(calculation),
        Math.sqrt(1 - calculation)
    );
};

/* 1. GET WORKER DASHBOARD */

export const getWorkerDashboard: RequestHandler[] = [
    authenticateWorker,
    async (_req, res) => {
        try {
            const worker = await prisma.worker.findUnique({
                where: { id: res.locals.workerId },
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    latitude: true,
                    longitude: true,
                    profilePhoto: true,
                    profileVerificationExpires: true,
                    _count: { select: { services: true } }
                }
            });

            if (!worker)
                return sendError(res, 404, 'Worker account not found.');

            let totalClients = 0;

            if (
                worker.latitude !== null &&
                worker.longitude !== null &&
                Number.isFinite(worker.latitude) &&
                Number.isFinite(worker.longitude)
            ) {
                const latitudeRange = 10 / 111;
                const longitudeRange = 10 / (111 * Math.max(
                    Math.abs(Math.cos(worker.latitude * Math.PI / 180)),
                    0.01
                ));

                const clients = await prisma.client.findMany({
                    where: {
                        latitude: {
                            gte: worker.latitude - latitudeRange,
                            lte: worker.latitude + latitudeRange
                        },
                        longitude: {
                            gte: worker.longitude - longitudeRange,
                            lte: worker.longitude + longitudeRange
                        }
                    },
                    select: { latitude: true, longitude: true }
                });

                totalClients = clients.filter(client =>
                    client.latitude !== null &&
                    client.longitude !== null &&
                    getDistance(
                        worker.latitude!,
                        worker.longitude!,
                        client.latitude,
                        client.longitude
                    ) <= 10
                ).length;
            }

            res.json({
                success: true,
                worker: {
                    fullName: worker.fullName,
                    phone: worker.phone,
                    latitude: worker.latitude,
                    longitude: worker.longitude,
                    profilePhoto: formatProfilePhoto(worker.profilePhoto),
                    profileVerificationExpires: worker.profileVerificationExpires,
                    totalSkills: worker._count.services,
                    totalClients
                }
            });
        } catch (error) {
            console.error('Worker dashboard error:', error);
            sendError(res, 500, 'Unable to load your dashboard. Please try again.');
        }
    }
];

/* 2. SEND WORKER PHONE OTP */

export const sendWorkerPhoneOTP: RequestHandler[] = [
    authenticateWorker,
    async (_req, res) => {
        try {
            const worker = await prisma.worker.findUnique({
                where: { id: res.locals.workerId },
                select: {
                    id: true,
                    phone: true,
                    phoneOtpResendCount: true,
                    phoneOtpCooldownUntil: true
                }
            });

            if (!worker)
                return sendError(res, 404, 'Worker account not found.');

            if (!worker.phone)
                return sendError(res, 400, 'Please add a phone number to your profile first.');

            let count = worker.phoneOtpResendCount;
            let cooldownUntil = worker.phoneOtpCooldownUntil;
            const now = new Date();

            if (cooldownUntil && cooldownUntil > now)
                return res.status(429).json({
                    success: false,
                    message: 'You have reached the phone verification code limit. Please try again after the cooldown.',
                    cooldownUntil,
                    coolDownUntil: cooldownUntil
                });

            if (cooldownUntil && cooldownUntil <= now) {
                count = 0;
                cooldownUntil = null;
            }

            if (count >= MAX_OTP_ATTEMPTS) {
                const newCooldown = new Date(Date.now() + COOLDOWN);

                await prisma.worker.update({
                    where: { id: worker.id },
                    data: {
                        phoneOtpResendCount: 0,
                        phoneOtpCooldownUntil: newCooldown
                    }
                });

                return res.status(429).json({
                    success: false,
                    message: 'You have reached the phone verification code limit. Please try again after 24 hours.',
                    cooldownUntil: newCooldown,
                    coolDownUntil: newCooldown
                });
            }

            const phone = formatPhone(worker.phone);
            const otp = generateOTP();
            const apiKey = process.env.ROBASE_API_KEY;

            if (!apiKey)
                throw new Error('Robase API key is not configured.');

            const response = await fetch('https://api.robase.dev/v1/sms/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone_number: phone,
                    message: `Your SkillConnect verification code is ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`
                })
            });

            if (!response.ok)
                throw new Error('Unable to send verification SMS.');

            await prisma.worker.update({
                where: { id: worker.id },
                data: {
                    phoneOtpHash: await bcrypt.hash(otp, 12),
                    phoneOtpExpires: new Date(Date.now() + OTP_EXPIRY),
                    phoneOtpResendCount: count + 1,
                    phoneOtpCooldownUntil: cooldownUntil
                }
            });

            res.json({
                success: true,
                message: 'A phone verification code has been sent.',
                phone: worker.phone
            });
        } catch (error) {
            console.error('Worker phone OTP error:', error);

            sendError(
                res,
                error instanceof Error && error.message.startsWith('Please provide')
                    ? 400
                    : 500,
                error instanceof Error && error.message.startsWith('Please provide')
                    ? error.message
                    : 'Unable to send your verification code. Please try again.'
            );
        }
    }
];