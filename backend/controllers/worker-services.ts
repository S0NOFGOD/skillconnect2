import type { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateWorker } from './worker-authentication.js';

const prisma = new PrismaClient();

/* GET AUTHENTICATED WORKER SERVICES */

export const getWorkerServices: RequestHandler[] = [
    authenticateWorker,
    async (_req, res) => {
        try {
            const workerId = res.locals.workerId as string;

            const worker = await prisma.worker.findUnique({
                where: { id: workerId },
                select: {
                    profilePhoto: true,
                    services: {
                        select: {
                            id: true,
                            skill: true,
                            createdAt: true,
                            adminApproval: true
                        },
                        orderBy: {
                            createdAt: 'desc'
                        }
                    }
                }
            });

            if (!worker) {
                return res.status(404).json({
                    success: false,
                    message: 'Worker account not found.'
                });
            }

            const profilePhoto = worker.profilePhoto
                ? cloudinary.url(worker.profilePhoto, {
                    secure: true,
                    cloud_name: process.env.CLOUDINARY_CLOUD_NAME
                })
                : null;

            return res.json({
                success: true,
                profilePhoto,
                services: worker.services.map(service => ({
                    id: service.id,
                    skill: service.skill,
                    date: service.createdAt,
                    adminApproval: service.adminApproval
                }))
            });

        } catch (error) {
            console.error('Get worker services error:', error);

            return res.status(500).json({
                success: false,
                message: 'Unable to retrieve your services. Please try again.'
            });
        }
    }
];