import type { RequestHandler } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../lib/prisma.js';
import { authenticateWorker } from './worker-authentication.js';

const MAX_IMAGES = 3;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const MAX_OPTIMIZED_SIZE = 5 * 1024 * 1024;
const MAX_WORDS = 150;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SKILLS = [
    'Swimming Instructor', 'Barber', 'Hairdresser', 'Makeup Artist', 'Tailor',
    'Fashion Designer', 'Plumber', 'Electrician', 'Painter', 'Welder',
    'Carpenter', 'Bricklayer', 'Cleaner', 'Laundry Service', 'Mechanic',
    'Auto Electrician', 'Phone Repair', 'Computer Repair', 'Graphic Designer',
    'Web Developer', 'Photographer', 'Videographer', 'Caterer', 'Baker',
    'Cook', 'Event Planner', 'Interior Decorator', 'AC Technician',
    'Generator Repair', 'POP Installer', 'Tiler', 'Furniture Maker', 'Driver',
    'Tutor', 'Fitness Trainer', 'Other'
];

const EXPERIENCES = [
    'Less than 1 year', '1 year', '2 years',
    '3 years', '4 years', '5 years+'
];

type Review = {
    fullName?: string;
    rating?: number;
    review?: string;
    date?: string;
};

type UploadedImage = {
    public_id: string;
};

const sendError = (res: Parameters<RequestHandler>[1], status: number, message: string) =>
    res.status(status).json({ success: false, message });

const wordCount = (value: string) =>
    value.trim() ? value.trim().split(/\s+/).length : 0;


// ==========================
// CLOUDINARY CONFIGURATION
// ==========================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function optimizeImage(file: Express.Multer.File): Promise<Buffer> {
    const metadata = await sharp(file.buffer).metadata();

    const validFormats: Record<string, string> = {
        'image/jpeg': 'jpeg',
        'image/png': 'png',
        'image/webp': 'webp'
    };

    if (!metadata.format || metadata.format !== validFormats[file.mimetype]) {
        throw new Error('An uploaded image is invalid or has an unsupported format.');
    }

    for (const quality of [80, 70, 60, 50]) {
        const buffer = await sharp(file.buffer)
            .rotate()
            .resize({
                width: 2000,
                height: 2000,
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

        if (buffer.length <= MAX_OPTIMIZED_SIZE) return buffer;
    }

    throw new Error('An optimized portfolio image exceeds the 5 MB limit.');
}

async function uploadToCloudinary(
    buffer: Buffer,
    workerId: string
): Promise<UploadedImage> {
    if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
    ) {
        throw new Error('Cloudinary configuration is missing.');
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: `skillconnect/workers/${workerId}/services`,
                resource_type: 'image'
            },
            (error, result) => {
                if (error || !result) {
                    reject(error || new Error('Unable to upload portfolio image.'));
                    return;
                }

                resolve({ public_id: result.public_id });
            }
        );

        stream.end(buffer);
    });
}

async function deleteCloudinaryImage(publicId: string) {
    if (!publicId) return;

    try {
        await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image'
        });
    } catch (error) {
        console.error('Cloudinary image deletion failed:', error);
    }
}


// ==========================
// PORTFOLIO UPLOAD VALIDATION
// ==========================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: MAX_IMAGES
    },
    fileFilter: (_req, file, callback) => {
        if (!IMAGE_TYPES.has(file.mimetype)) {
            callback(new Error('Portfolio images must be JPG, PNG or WebP.'));
            return;
        }

        callback(null, true);
    }
});

const portfolioUpload: RequestHandler = (req, res, next) => {
    upload.array('portfolioPhotos', MAX_IMAGES)(req, res, error => {
        if (!error) return next();

        const message = error instanceof multer.MulterError
            ? error.code === 'LIMIT_FILE_SIZE'
                ? 'Each portfolio image must not exceed 10 MB.'
                : error.code === 'LIMIT_FILE_COUNT'
                    ? 'You can upload a maximum of 3 portfolio images.'
                    : 'Invalid portfolio image upload.'
            : error.message || 'Unable to process portfolio images.';

        return sendError(res, 400, message);
    });
};


// ==========================
// 1. GET WORKER SERVICE
// ==========================

const getService: RequestHandler = async (req, res) => {
    try {
        const serviceId = String(req.params.serviceId || '').trim();
        const workerId = res.locals.workerId as string;

        if (!serviceId) {
            return sendError(res, 400, 'Service ID is required.');
        }

        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                workerId
            },
            select: {
                skill: true,
                experience: true,
                description: true,
                portfolio: true,
                adminApproval: true,
                adminResponse: true,
                ratingAndReview: true
            }
        });

        if (!service) {
            return sendError(res, 404, 'Service not found.');
        }

        const reviews = Array.isArray(service.ratingAndReview)
            ? (service.ratingAndReview as unknown as Review[])
            : [];

        const newestReviews = [...reviews]
            .sort((a, b) => {
                const dateA = new Date(a.date || 0).getTime();
                const dateB = new Date(b.date || 0).getTime();
                return dateB - dateA;
            })
            .slice(0, 3);

        return res.json({
            success: true,
            service: {
                skill: service.skill,
                experience: service.experience,
                description: service.description,
                portfolios: service.portfolio,
                adminApproval: service.adminApproval,
                adminResponse: service.adminResponse,
                ratingAndReview: newestReviews
            }
        });
    } catch (error) {
        console.error('Worker view service error:', error);
        return sendError(res, 500, 'Unable to retrieve this service. Please try again.');
    }
};


// ==========================
// 2. UPDATE WORKER SERVICE
// ==========================

const updateService: RequestHandler = async (req, res) => {
    const uploadedImages: string[] = [];

    try {
        const serviceId = String(req.params.serviceId || '').trim();
        const bodyServiceId = String(req.body.serviceId || '').trim();
        const workerId = res.locals.workerId as string;

        const skill = String(req.body.skill || '').trim();
        const experience = String(req.body.experience || '').trim();
        const description = String(req.body.description || '').trim();

        const files = (req.files || []) as Express.Multer.File[];

        if (!serviceId || serviceId !== bodyServiceId) {
            return sendError(res, 400, 'Invalid service ID.');
        }

        if (!SKILLS.includes(skill)) {
            return sendError(res, 400, 'Please select a valid skill.');
        }

        if (!EXPERIENCES.includes(experience)) {
            return sendError(res, 400, 'Please select a valid experience level.');
        }

        if (!description) {
            return sendError(res, 400, 'Please describe the service you provide.');
        }

        if (wordCount(description) > MAX_WORDS) {
            return sendError(res, 400, 'Your description must not exceed 150 words.');
        }

        if (files.length > MAX_IMAGES) {
            return sendError(res, 400, 'You can upload a maximum of 3 portfolio images.');
        }

        const rawIndexes = req.body.portfolioIndexes;
        const indexes = rawIndexes === undefined
            ? []
            : Array.isArray(rawIndexes)
                ? rawIndexes
                : [rawIndexes];

        if (indexes.length !== files.length) {
            return sendError(res, 400, 'Invalid portfolio image positions.');
        }

        const portfolioIndexes = indexes.map((value: unknown) => {
            const index = Number(value);
            return Number.isInteger(index) && index >= 0 && index < MAX_IMAGES
                ? index
                : -1;
        });

        if (
            portfolioIndexes.includes(-1) ||
            new Set(portfolioIndexes).size !== portfolioIndexes.length
        ) {
            return sendError(res, 400, 'Invalid or duplicate portfolio image positions.');
        }

        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                workerId
            },
            select: {
                portfolio: true
            }
        });

        if (!service) {
            return sendError(res, 404, 'Service not found.');
        }

        const portfolios = [...service.portfolio];
        const oldImages: string[] = [];

        // Validate, optimize and upload replacement images.

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (!IMAGE_TYPES.has(file.mimetype)) {
                throw new Error(`Portfolio ${i + 1} must be JPG, PNG or WebP.`);
            }

            if (file.size > MAX_UPLOAD_SIZE) {
                throw new Error(`Portfolio ${i + 1} exceeds 10 MB.`);
            }

            const index = portfolioIndexes[i];
            const optimized = await optimizeImage(file);
            const uploaded = await uploadToCloudinary(optimized, workerId);

            uploadedImages.push(uploaded.public_id);

            if (portfolios[index]) {
                oldImages.push(portfolios[index]);
            }

            portfolios[index] = uploaded.public_id;
        }

        // Save the updated service.

        await prisma.service.update({
            where: { id: serviceId },
            data: {
                skill,
                experience,
                description,
                portfolio: portfolios,
                adminApproval: 'Under Review',
                adminResponse: 'It may take up to 24 hours for admin update'
            }
        });

        // Delete replaced images only after the database update succeeds.

        await Promise.all(oldImages.map(deleteCloudinaryImage));

        return res.json({
            success: true,
            message: 'Your service has been updated successfully. It may take up to 24 hours for admin update.'
        });

    } catch (error) {
        // Remove newly uploaded images if the update fails.

        await Promise.all(uploadedImages.map(deleteCloudinaryImage));

        console.error('Worker update service error:', error);

        return sendError(
            res,
            400,
            error instanceof Error
                ? error.message
                : 'Unable to update this service. Please try again.'
        );
    }
};


// ==========================
// ROUTE MIDDLEWARE
// ==========================

export const getWorkerViewService: RequestHandler[] = [
    authenticateWorker,
    getService
];

export const updateWorkerViewService: RequestHandler[] = [
    authenticateWorker,
    portfolioUpload,
    updateService
];