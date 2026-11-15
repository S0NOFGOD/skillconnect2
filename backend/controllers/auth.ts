import type { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const hash = (value: string) =>
    crypto.createHash('sha256').update(value).digest('hex');

const getCookieOptions = () => {
    const production = process.env.NODE_ENV === 'production';

    return {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' as const : 'lax' as const,
        path: '/'
    };
};

const clearAuthCookies = (res: Parameters<RequestHandler>[1]) => {
    const options = getCookieOptions();

    res.clearCookie('accessToken', options);
    res.clearCookie('refreshToken', options);
};

const sendError = (
    res: Parameters<RequestHandler>[1],
    status: number,
    message: string
) => res.status(status).json({ success: false, message });

/* 1. REFRESH ACCESS TOKEN */

export const refreshToken: RequestHandler = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
        const accessSecret = process.env.ACCESS_TOKEN_SECRET;

        if (!refreshSecret || !accessSecret)
            return sendError(res, 500, 'Authentication is not configured.');

        if (!token)
            return sendError(res, 401, 'Refresh token is missing.');

        const decoded = jwt.verify(token, refreshSecret);

        if (
            typeof decoded === 'string' ||
            decoded.userType !== 'worker' ||
            typeof decoded.id !== 'string'
        ) {
            return sendError(res, 401, 'Invalid refresh token.');
        }

        const worker = await prisma.worker.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                refreshTokenHash: true
            }
        });

        if (!worker || worker.refreshTokenHash !== hash(token))
            return sendError(res, 401, 'Your session is invalid or has expired.');

        const payload = {
            id: worker.id,
            userType: 'worker'
        };

        const newAccessToken = jwt.sign(payload, accessSecret, {
            expiresIn: (process.env.ACCESS_TOKEN_EXPIRE || '15m') as jwt.SignOptions['expiresIn']
        });

        const newRefreshToken = jwt.sign(payload, refreshSecret, {
            expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || '7d') as jwt.SignOptions['expiresIn']
        });

        await prisma.worker.update({
            where: { id: worker.id },
            data: {
                refreshTokenHash: hash(newRefreshToken)
            }
        });

        const options = getCookieOptions();

        res.cookie('accessToken', newAccessToken, options);
        res.cookie('refreshToken', newRefreshToken, options);

        return res.json({
            success: true,
            message: 'Authentication session refreshed.'
        });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError)
            return sendError(res, 401, 'Your session is invalid or has expired.');

        console.error('Token refresh error:', error);
        return sendError(res, 500, 'Unable to refresh your session. Please try again.');
    }
};

/* 2. WORKER LOGOUT */

export const logout: RequestHandler = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

        if (!refreshSecret)
            return sendError(res, 500, 'Authentication is not configured.');

        if (!token)
            return sendError(res, 401, 'Refresh token is missing.');

        const decoded = jwt.verify(token, refreshSecret);

        if (
            typeof decoded === 'string' ||
            decoded.userType !== 'worker' ||
            typeof decoded.id !== 'string'
        ) {
            return sendError(res, 401, 'Invalid refresh token.');
        }

        const worker = await prisma.worker.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                refreshTokenHash: true
            }
        });

        if (!worker || worker.refreshTokenHash !== hash(token))
            return sendError(res, 401, 'Your session is invalid or has expired.');

        await prisma.worker.update({
            where: { id: worker.id },
            data: {
                refreshTokenHash: null
            }
        });

        clearAuthCookies(res);

        return res.json({
            success: true,
            message: 'You have been logged out successfully.'
        });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError)
            return sendError(res, 401, 'Your session is invalid or has expired.');

        console.error('Worker logout error:', error);
        return sendError(res, 500, 'Unable to log out. Please try again.');
    }
};