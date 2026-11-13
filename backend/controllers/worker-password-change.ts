import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma.js';

// ==========================
// WORKER PASSWORD CHANGE
// ==========================

const workerPasswordChange: RequestHandler = async (req, res) => {

    try {

        const { email, password, confirmPassword } = req.body;

        // ==========================
        // BACKEND VALIDATION
        // ==========================

        if (!email || typeof email !== 'string' || !email.trim()) {
            res.status(400).json({
                message: 'Email is required.'
            });
            return;
        }

        if (!password || typeof password !== 'string' || !password.trim()) {
            res.status(400).json({
                message: 'Please enter a new password.'
            });
            return;
        }

        if (password.length < 8) {
            res.status(400).json({
                message: 'Your password must contain at least 8 characters.'
            });
            return;
        }

        if (
            !confirmPassword ||
            typeof confirmPassword !== 'string' ||
            !confirmPassword.trim()
        ) {
            res.status(400).json({
                message: 'Please confirm your new password.'
            });
            return;
        }

        if (password !== confirmPassword) {
            res.status(400).json({
                message: 'The new password and confirmation password must be the same.'
            });
            return;
        }

        // ==========================
        // FIND WORKER
        // ==========================

        const worker = await prisma.worker.findUnique({
            where: {
                email: email.trim().toLowerCase()
            }
        });

        if (!worker) {
            res.status(404).json({
                message: 'No worker account was found with this email address.'
            });
            return;
        }

        // ==========================
        // CHECK RESET AUTHORIZATION
        // ==========================

        const now = new Date();

        if (
            !worker.resetAuthorizationExpires ||
            worker.resetAuthorizationExpires <= now
        ) {
            res.status(401).json({
                message: 'Your password reset authorization has expired or is invalid. Please restart the password reset process.'
            });
            return;
        }

        // ==========================
        // HASH NEW PASSWORD
        // ==========================

        const passwordHash = await bcrypt.hash(password, 12);

        // ==========================
        // SAVE NEW PASSWORD
        // ==========================

        const updatedWorker = await prisma.worker.updateMany({
            where: {
                id: worker.id,
                resetAuthorizationExpires: {
                    gt: new Date()
                }
            },
            data: {
                passwordHash,
                resetAuthorizationExpires: null
            }
        });

        // ==========================
        // CHECK AUTHORIZATION AGAIN
        // ==========================

        if (updatedWorker.count === 0) {
            res.status(401).json({
                message: 'Your password reset authorization has expired or is invalid. Please restart the password reset process.'
            });
            return;
        }

        // ==========================
        // SUCCESS RESPONSE
        // ==========================

        res.status(200).json({
            message: 'Your password has been changed successfully. You can now log in with your new password.'
        });

    } catch (error) {

        console.error('Worker password change error:', error);

        res.status(500).json({
            message: 'An unexpected error occurred while changing your password. Please try again.'
        });

    }
};

export default workerPasswordChange;