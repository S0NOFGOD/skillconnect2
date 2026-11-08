import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createContact(req: Request, res: Response) {
    try {
        const email =
            typeof req.body?.email === 'string'
                ? req.body.email.trim().toLowerCase()
                : '';

        const message =
            typeof req.body?.message === 'string'
                ? req.body.message.trim()
                : '';

        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.',
            });
        }

        if (!message || message.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a message of 1–5,000 characters.',
            });
        }

        await prisma.contact.upsert({
            where: {
                email,
            },
            create: {
                email,
                message,
            },
            update: {
                message,
            },
        });

        return res.status(201).json({
            success: true,
            message: 'Thank you for contacting SkillConnect. We will get back to you soon.',
        });

    } catch (error) {
        console.error('Contact submission error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to send your message right now. Please try again later.',
        });
    }
}