import type { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateWorker } from './worker-authentication.js';

const prisma = new PrismaClient();

/* GET AUTHENTICATED WORKER SERVICES */

export const getWorkerServices: RequestHandler[] = [
    authenticateWorker,
    async (_req, res) => {
        try {
            const workerId = res.locals.workerId as string;

            const services = await prisma.service.findMany({
                where: { workerId },
                select: {
                    id: true,
                    skill: true,
                    createdAt: true,
                    adminApproval: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return res.json({
                success: true,
                services: services.map(service => ({
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