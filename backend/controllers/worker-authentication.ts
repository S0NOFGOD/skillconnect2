import type { RequestHandler, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const OTP_EXPIRY = 10 * 60 * 1000;
const COOLDOWN = 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 4;

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const generateOTP = () => crypto.randomInt(100000, 1000000).toString();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const redirect = (path: string) => `${FRONTEND_URL}${path}`;

const sendOTPEmail = async (email: string, otp: string, purpose: string) => {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL)
        throw new Error('Brevo configuration is missing.');

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            sender: {
                name: process.env.BREVO_SENDER_NAME || 'SkillConnect',
                email: process.env.BREVO_SENDER_EMAIL
            },
            to: [{ email }],
            subject: purpose,
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;color:#333">
                <h2>SkillConnect</h2><p>Your verification code is:</p>
                <h1 style="letter-spacing:8px">${otp}</h1>
                <p>This code expires in 10 minutes.</p>
                <p>Do not share this code with anyone.</p>
            </div>`
        })
    });

    if (!response.ok) throw new Error('Unable to send verification email.');
};

const createWorkerSession = async (worker: { id: string }) => {
    const accessSecret = process.env.ACCESS_TOKEN_SECRET;
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

    if (!accessSecret || !refreshSecret) throw new Error('JWT secrets are not configured.');

    const payload = { id: worker.id, userType: 'worker' };
    const accessToken = jwt.sign(payload, accessSecret, {
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRE || '15m') as jwt.SignOptions['expiresIn']
    });
    const refreshToken = jwt.sign(payload, refreshSecret, {
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || '7d') as jwt.SignOptions['expiresIn']
    });

    await prisma.worker.update({
        where: { id: worker.id },
        data: { refreshTokenHash: hash(refreshToken) }
    });

    return { accessToken, refreshToken };
};

const setAuthCookies = (res: Response, tokens: { accessToken: string; refreshToken: string }) => {
    const production = process.env.NODE_ENV === 'production';
    const options = {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' as const : 'lax' as const,
        path: '/'
    };

    res.cookie('accessToken', tokens.accessToken, options);
    res.cookie('refreshToken', tokens.refreshToken, options);
};

const redirectWithError = (res: Response, error: string) =>
    res.redirect(`${redirect('/worker-authentication/index.html')}?error=${encodeURIComponent(error)}`);

const sendError = (res: Response, status: number, message: string) =>
    res.status(status).json({ success: false, message });

const sendCooldown = (res: Response, message: string, cooldownUntil: Date) =>
    res.status(429).json({ success: false, message, cooldownUntil });

const getOTPStatus = (count: number, cooldownUntil: Date | null) => {
    const now = new Date();

    if (cooldownUntil && cooldownUntil > now)
        return { blocked: true, count, cooldownUntil };

    if (cooldownUntil && cooldownUntil <= now)
        return { blocked: false, count: 0, cooldownUntil: null };

    if (count >= MAX_OTP_ATTEMPTS)
        return { blocked: true, count: 0, cooldownUntil: new Date(Date.now() + COOLDOWN) };

    return { blocked: false, count, cooldownUntil };
};

/* 1. WORKER SIGNUP */

export const signupWorker: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password, confirmPassword, termsAccepted } = req.body;

        if (!validEmail(email)) return sendError(res, 400, 'Please enter a valid email address.');
        if (typeof password !== 'string' || password.length < 8)
            return sendError(res, 400, 'Password must be at least 8 characters.');
        if (typeof confirmPassword !== 'string' || !confirmPassword)
            return sendError(res, 400, 'Please confirm your password.');
        if (password !== confirmPassword)
            return sendError(res, 400, 'Passwords do not match.');
        if (termsAccepted !== true)
            return sendError(res, 400, 'Please agree to the Terms and Privacy Policy.');

        if (await prisma.worker.findUnique({ where: { email } }))
            return sendError(res, 409, 'An account with this email already exists.');

        const otp = generateOTP();
        const worker = await prisma.worker.create({
            data: {
                email,
                passwordHash: await bcrypt.hash(password, 12),
                accountType: 'password',
                emailVerified: false,
                profileCompleted: false,
                emailOtpHash: await bcrypt.hash(otp, 12),
                emailOtpExpires: new Date(Date.now() + OTP_EXPIRY),
                emailOtpResendCount: 1,
                emailOtpCooldownUntil: null
            }
        });

        try {
            await sendOTPEmail(email, otp, 'Verify your SkillConnect account');
        } catch (error) {
            await prisma.worker.delete({ where: { id: worker.id } });
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Account created. A verification code has been sent to your email.',
            email: worker.email,
            nextStep: 'email-verification'
        });
    } catch (error) {
        console.error('Worker signup error:', error);
        sendError(res, 500, 'Unable to create your account. Please try again.');
    }
};

/* 2. WORKER LOGIN */

export const loginWorker: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const { password } = req.body;

        if (!validEmail(email)) return sendError(res, 400, 'Please enter a valid email address.');
        if (typeof password !== 'string' || !password)
            return sendError(res, 400, 'Please enter your password.');

        const worker = await prisma.worker.findUnique({ where: { email } });

        if (!worker) return sendError(res, 404, 'No account was found with this email.');
        if (worker.accountType === 'googleId')
            return sendError(res, 400, 'This account uses Google sign-in. Please continue with Google.');
        if (!worker.passwordHash || !(await bcrypt.compare(password, worker.passwordHash)))
            return sendError(res, 401, 'Incorrect email or password.');

        if (!worker.emailVerified) {
            const status = getOTPStatus(worker.emailOtpResendCount, worker.emailOtpCooldownUntil);

            if (status.blocked) {
                if (status.cooldownUntil !== worker.emailOtpCooldownUntil) {
                    await prisma.worker.update({
                        where: { id: worker.id },
                        data: {
                            emailOtpResendCount: 0,
                            emailOtpCooldownUntil: status.cooldownUntil
                        }
                    });
                }

                return sendCooldown(
                    res,
                    status.cooldownUntil === worker.emailOtpCooldownUntil
                        ? 'You have reached the verification code limit. Please try again after the cooldown.'
                        : 'You have reached the verification code limit. Please try again after 24 hours.',
                    status.cooldownUntil!
                );
            }

            const otp = generateOTP();

            await sendOTPEmail(email, otp, 'Your SkillConnect verification code');
            await prisma.worker.update({
                where: { id: worker.id },
                data: {
                    emailOtpHash: await bcrypt.hash(otp, 12),
                    emailOtpExpires: new Date(Date.now() + OTP_EXPIRY),
                    emailOtpResendCount: status.count + 1,
                    emailOtpCooldownUntil: status.cooldownUntil
                }
            });

            return res.json({
                success: true,
                message: 'Your email is not verified. A new verification code has been sent.',
                email,
                nextStep: 'email-verification'
            });
        }

        if (!worker.profileCompleted)
            return res.json({
                success: true,
                message: 'Please complete your worker profile.',
                email,
                nextStep: 'profile'
            });

        const tokens = await createWorkerSession(worker);
        setAuthCookies(res, tokens);

        res.json({
            success: true,
            message: `Welcome back, ${worker.fullName || 'worker'}.`,
            email,
            fullName: worker.fullName,
            nextStep: 'authenticated'
        });
    } catch (error) {
        console.error('Worker login error:', error);
        sendError(res, 500, 'Unable to log in. Please try again.');
    }
};

/* 3. FORGOT PASSWORD */

export const forgotPassword: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!validEmail(email)) return sendError(res, 400, 'Please enter a valid email address.');

        const worker = await prisma.worker.findUnique({ where: { email } });

        if (!worker) return sendError(res, 404, 'No account was found with this email.');
        if (worker.accountType === 'googleId')
            return sendError(res, 400, 'This account uses Google sign-in. Password reset is not available.');

        const status = getOTPStatus(
            worker.passwordResetOtpResendCount,
            worker.passwordResetOtpCooldownUntil
        );

        if (status.blocked) {
            if (status.cooldownUntil !== worker.passwordResetOtpCooldownUntil) {
                await prisma.worker.update({
                    where: { id: worker.id },
                    data: {
                        passwordResetOtpResendCount: 0,
                        passwordResetOtpCooldownUntil: status.cooldownUntil
                    }
                });
            }

            return sendCooldown(
                res,
                status.cooldownUntil === worker.passwordResetOtpCooldownUntil
                    ? 'You have reached the password reset code limit. Please try again after the cooldown.'
                    : 'You have reached the password reset code limit. Please try again after 24 hours.',
                status.cooldownUntil!
            );
        }

        const otp = generateOTP();

        await sendOTPEmail(email, otp, 'Your SkillConnect password reset code');
        await prisma.worker.update({
            where: { id: worker.id },
            data: {
                passwordResetOtpHash: await bcrypt.hash(otp, 12),
                passwordResetOtpExpires: new Date(Date.now() + OTP_EXPIRY),
                passwordResetOtpResendCount: status.count + 1,
                passwordResetOtpCooldownUntil: status.cooldownUntil,
                passwordResetOtpVerified: false,
                resetAuthorizationExpires: null
            }
        });

        res.json({
            success: true,
            message: 'A password reset code has been sent to your email.',
            email
        });
    } catch (error) {
        console.error('Worker forgot password error:', error);
        sendError(res, 500, 'Unable to process your password reset request. Please try again.');
    }
};

/* 4. GOOGLE AUTHENTICATION START */

export const googleAuthentication: RequestHandler = async (_req, res) => {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

        if (!clientId || !callbackUrl)
            return sendError(res, 500, 'Google authentication is not configured.');

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'online',
            prompt: 'select_account'
        });

        res.json({
            success: true,
            authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        });
    } catch (error) {
        console.error('Google authentication error:', error);
        sendError(res, 500, 'Unable to start Google authentication. Please try again.');
    }
};

/* 5. GOOGLE AUTHENTICATION CALLBACK */

export const googleCallback: RequestHandler = async (req, res) => {
    try {
        const code = String(req.query.code || '');
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

        if (!code || !clientId || !clientSecret || !callbackUrl)
            return redirectWithError(res, 'google-authentication-failed');

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code, client_id: clientId, client_secret: clientSecret,
                redirect_uri: callbackUrl, grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) throw new Error('Google token exchange failed.');

        const tokenData = await tokenResponse.json() as { access_token?: string };
        if (!tokenData.access_token) throw new Error('Google access token was not returned.');

        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        if (!userResponse.ok) throw new Error('Unable to retrieve Google account details.');

        const googleUser = await userResponse.json() as {
            id?: string;
            email?: string;
            verified_email?: boolean;
        };

        if (!googleUser.id || !googleUser.email || !googleUser.verified_email)
            throw new Error('Google account email could not be verified.');

        const email = googleUser.email.trim().toLowerCase();
        const googleId = googleUser.id;
        let worker = await prisma.worker.findUnique({ where: { email } });

        console.log('GOOGLE WORKER LOOKUP:', {
            email, found: Boolean(worker), accountType: worker?.accountType || null
        });

        if (worker?.accountType === 'password')
            return redirectWithError(res, 'password-account');

        if (!worker) {
            worker = await prisma.worker.create({
                data: {
                    email, googleId, accountType: 'googleId',
                    emailVerified: true, profileCompleted: false
                }
            });

            return res.redirect(
                `${redirect('/worker-create-profile/index.html')}?email=${encodeURIComponent(email)}`
            );
        }

        if (worker.googleId !== googleId)
            worker = await prisma.worker.update({
                where: { id: worker.id },
                data: { googleId }
            });

        if (!worker.profileCompleted)
            return res.redirect(
                `${redirect('/worker-create-profile/index.html')}?email=${encodeURIComponent(email)}`
            );

        const tokens = await createWorkerSession(worker);
        setAuthCookies(res, tokens);
        res.redirect(redirect('/worker-services/index.html'));
    } catch (error) {
        console.error('Worker Google callback error:', error);
        redirectWithError(res, 'google-authentication-failed');
    }
};