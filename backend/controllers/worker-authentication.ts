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

const hash = (value: string) =>
    crypto.createHash('sha256').update(value).digest('hex');

const generateOTP = () =>
    crypto.randomInt(100000, 1000000).toString();

const validEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sendOTPEmail = async (
    email: string,
    otp: string,
    purpose: string
) => {
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
            htmlContent: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;color:#333">
                    <h2>SkillConnect</h2>
                    <p>Your verification code is:</p>
                    <h1 style="letter-spacing:8px">${otp}</h1>
                    <p>This code expires in 10 minutes.</p>
                    <p>Do not share this code with anyone.</p>
                </div>
            `
        })
    });

    if (!response.ok)
        throw new Error('Unable to send verification email.');
};

const createWorkerSession = async (worker: { id: string }) => {
    const accessSecret = process.env.ACCESS_TOKEN_SECRET;
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

    if (!accessSecret || !refreshSecret)
        throw new Error('JWT secrets are not configured.');

    const accessToken = jwt.sign(
        { id: worker.id, userType: 'worker' },
        accessSecret,
        {
            expiresIn: (process.env.ACCESS_TOKEN_EXPIRE || '15m') as jwt.SignOptions['expiresIn']
        }
    );

    const refreshToken = jwt.sign(
        { id: worker.id, userType: 'worker' },
        refreshSecret,
        {
            expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || '7d') as jwt.SignOptions['expiresIn']
        }
    );

    await prisma.worker.update({
        where: { id: worker.id },
        data: { refreshTokenHash: hash(refreshToken) }
    });

    return { accessToken, refreshToken };
};

const setAuthCookies = (
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
) => {
    const production = process.env.NODE_ENV === 'production';

    const cookieOptions = {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' as const : 'lax' as const,
        path: '/'
    };

    res.cookie('accessToken', tokens.accessToken, cookieOptions);
    res.cookie('refreshToken', tokens.refreshToken, cookieOptions);
};

const redirect = (path: string) =>
    `${FRONTEND_URL}${path}`;

const redirectWithError = (res: Response, error: string) =>
    res.redirect(
        `${redirect('/worker-authentication/index.html')}?error=${encodeURIComponent(error)}`
    );

/* =========================================================
   1. WORKER SIGNUP
========================================================= */

export const signupWorker: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = req.body.password;
        const confirmPassword = req.body.confirmPassword;
        const termsAccepted = req.body.termsAccepted;

        if (!validEmail(email)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
            return;
        }

        if (typeof password !== 'string' || password.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters.'
            });
            return;
        }

        if (typeof confirmPassword !== 'string' || !confirmPassword) {
            res.status(400).json({
                success: false,
                message: 'Please confirm your password.'
            });
            return;
        }

        if (password !== confirmPassword) {
            res.status(400).json({
                success: false,
                message: 'Passwords do not match.'
            });
            return;
        }

        if (termsAccepted !== true) {
            res.status(400).json({
                success: false,
                message: 'Please agree to the Terms and Privacy Policy.'
            });
            return;
        }

        const existingWorker = await prisma.worker.findUnique({
            where: { email }
        });

        if (existingWorker) {
            res.status(409).json({
                success: false,
                message: 'An account with this email already exists.'
            });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const otp = generateOTP();

        const worker = await prisma.worker.create({
            data: {
                email,
                passwordHash,
                accountType: 'password',
                emailVerified: false,
                profileCompleted: false,
                emailOtpHash: hash(otp),
                emailOtpExpires: new Date(Date.now() + OTP_EXPIRY)
            }
        });

        try {
            await sendOTPEmail(
                email,
                otp,
                'Verify your SkillConnect account'
            );
        } catch (error) {
            await prisma.worker.delete({
                where: { id: worker.id }
            });

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

        res.status(500).json({
            success: false,
            message: 'Unable to create your account. Please try again.'
        });
    }
};

/* =========================================================
   2. WORKER LOGIN
========================================================= */

export const loginWorker: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = req.body.password;

        if (!validEmail(email)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
            return;
        }

        if (typeof password !== 'string' || !password) {
            res.status(400).json({
                success: false,
                message: 'Please enter your password.'
            });
            return;
        }

        const worker = await prisma.worker.findUnique({
            where: { email }
        });

        if (!worker) {
            res.status(404).json({
                success: false,
                message: 'No account was found with this email.'
            });
            return;
        }

        if (worker.accountType === 'googleId') {
            res.status(400).json({
                success: false,
                message: 'This account uses Google sign-in. Please continue with Google.'
            });
            return;
        }

        if (
            !worker.passwordHash ||
            !(await bcrypt.compare(password, worker.passwordHash))
        ) {
            res.status(401).json({
                success: false,
                message: 'Incorrect email or password.'
            });
            return;
        }

        // EMAIL VERIFICATION

        if (!worker.emailVerified) {
            const now = new Date();

            let count = worker.emailOtpResendCount;
            let cooldownUntil = worker.emailOtpCooldownUntil;

            if (cooldownUntil && cooldownUntil > now) {
                res.status(429).json({
                    success: false,
                    message: 'You have reached the verification code limit. Please try again after the cooldown.',
                    cooldownUntil
                });
                return;
            }

            if (cooldownUntil && cooldownUntil <= now) {
                count = 0;
                cooldownUntil = null;
            }

            if (count >= MAX_OTP_ATTEMPTS) {
                const newCooldown = new Date(Date.now() + COOLDOWN);

                await prisma.worker.update({
                    where: { id: worker.id },
                    data: {
                        emailOtpResendCount: 0,
                        emailOtpCooldownUntil: newCooldown
                    }
                });

                res.status(429).json({
                    success: false,
                    message: 'You have reached the verification code limit. Please try again after 24 hours.',
                    cooldownUntil: newCooldown
                });
                return;
            }

            const otp = generateOTP();
            const expires = new Date(Date.now() + OTP_EXPIRY);

            await sendOTPEmail(
                email,
                otp,
                'Your SkillConnect verification code'
            );

            await prisma.worker.update({
                where: { id: worker.id },
                data: {
                    emailOtpHash: hash(otp),
                    emailOtpExpires: expires,
                    emailOtpResendCount: count + 1,
                    emailOtpCooldownUntil: cooldownUntil
                }
            });

            res.json({
                success: true,
                message: 'Your email is not verified. A new verification code has been sent.',
                email,
                nextStep: 'email-verification'
            });
            return;
        }

        // PROFILE COMPLETION

        if (!worker.profileCompleted) {
            res.json({
                success: true,
                message: 'Please complete your worker profile.',
                email,
                nextStep: 'profile'
            });
            return;
        }

        // AUTHENTICATED LOGIN

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

        res.status(500).json({
            success: false,
            message: 'Unable to log in. Please try again.'
        });
    }
};

/* =========================================================
   3. FORGOT PASSWORD
========================================================= */

export const forgotPassword: RequestHandler = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!validEmail(email)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
            return;
        }

        const worker = await prisma.worker.findUnique({
            where: { email }
        });

        if (!worker) {
            res.status(404).json({
                success: false,
                message: 'No account was found with this email.'
            });
            return;
        }

        if (worker.accountType === 'googleId') {
            res.status(400).json({
                success: false,
                message: 'This account uses Google sign-in. Password reset is not available.'
            });
            return;
        }

        const now = new Date();

        let count = worker.passwordResetOtpResendCount;
        let cooldownUntil = worker.passwordResetOtpCooldownUntil;

        if (cooldownUntil && cooldownUntil > now) {
            res.status(429).json({
                success: false,
                message: 'You have reached the password reset code limit. Please try again after the cooldown.',
                cooldownUntil
            });
            return;
        }

        if (cooldownUntil && cooldownUntil <= now) {
            count = 0;
            cooldownUntil = null;
        }

        if (count >= MAX_OTP_ATTEMPTS) {
            const newCooldown = new Date(Date.now() + COOLDOWN);

            await prisma.worker.update({
                where: { id: worker.id },
                data: {
                    passwordResetOtpResendCount: 0,
                    passwordResetOtpCooldownUntil: newCooldown
                }
            });

            res.status(429).json({
                success: false,
                message: 'You have reached the password reset code limit. Please try again after 24 hours.',
                cooldownUntil: newCooldown
            });
            return;
        }

        const otp = generateOTP();
        const expires = new Date(Date.now() + OTP_EXPIRY);

        await sendOTPEmail(
            email,
            otp,
            'Your SkillConnect password reset code'
        );

        await prisma.worker.update({
            where: { id: worker.id },
            data: {
                passwordResetOtpHash: hash(otp),
                passwordResetOtpExpires: expires,
                passwordResetOtpResendCount: count + 1,
                passwordResetOtpCooldownUntil: cooldownUntil,
                passwordResetOtpVerified: false
            }
        });

        res.json({
            success: true,
            message: 'A password reset code has been sent to your email.',
            email
        });
    } catch (error) {
        console.error('Worker forgot password error:', error);

        res.status(500).json({
            success: false,
            message: 'Unable to process your password reset request. Please try again.'
        });
    }
};

/* =========================================================
   4. GOOGLE AUTHENTICATION START
========================================================= */

export const googleAuthentication: RequestHandler = async (_req, res) => {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

        if (!clientId || !callbackUrl) {
            res.status(500).json({
                success: false,
                message: 'Google authentication is not configured.'
            });
            return;
        }

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

        res.status(500).json({
            success: false,
            message: 'Unable to start Google authentication. Please try again.'
        });
    }
};

/* =========================================================
   5. GOOGLE AUTHENTICATION CALLBACK
========================================================= */

export const googleCallback: RequestHandler = async (req, res) => {
    try {
        const code = String(req.query.code || '');

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

        if (!code || !clientId || !clientSecret || !callbackUrl) {
            redirectWithError(res, 'google-authentication-failed');
            return;
        }

        // EXCHANGE GOOGLE CODE FOR ACCESS TOKEN

        const tokenResponse = await fetch(
            'https://oauth2.googleapis.com/token',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: callbackUrl,
                    grant_type: 'authorization_code'
                })
            }
        );

        if (!tokenResponse.ok)
            throw new Error('Google token exchange failed.');

        const tokenData = await tokenResponse.json() as {
            access_token?: string;
        };

        if (!tokenData.access_token)
            throw new Error('Google access token was not returned.');

        // RETRIEVE GOOGLE ACCOUNT

        const userResponse = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`
                }
            }
        );

        if (!userResponse.ok)
            throw new Error('Unable to retrieve Google account details.');

        const googleUser = await userResponse.json() as {
            id?: string;
            email?: string;
            verified_email?: boolean;
        };

        if (
            !googleUser.id ||
            !googleUser.email ||
            !googleUser.verified_email
        ) {
            throw new Error('Google account email could not be verified.');
        }

        const email = googleUser.email.trim().toLowerCase();
        const googleId = googleUser.id;

        // FIND WORKER

        let worker = await prisma.worker.findUnique({
            where: { email }
        });

        // EXISTING PASSWORD ACCOUNT

        if (worker && worker.accountType === 'password') {
            redirectWithError(res, 'password-account');
            return;
        }

        // CREATE NEW GOOGLE ACCOUNT

        if (!worker) {
            worker = await prisma.worker.create({
                data: {
                    email,
                    googleId,
                    accountType: 'googleId',
                    emailVerified: true,
                    profileCompleted: false
                }
            });

            res.redirect(
                `${redirect('/worker-create-profile/index.html')}?email=${encodeURIComponent(email)}`
            );
            return;
        }

        // EXISTING GOOGLE ACCOUNT

        if (worker.googleId !== googleId) {
            worker = await prisma.worker.update({
                where: { id: worker.id },
                data: { googleId }
            });
        }

        // INCOMPLETE PROFILE

        if (!worker.profileCompleted) {
            res.redirect(
                `${redirect('/worker-create-profile/index.html')}?email=${encodeURIComponent(email)}`
            );
            return;
        }

        // AUTHENTICATED GOOGLE LOGIN

        const tokens = await createWorkerSession(worker);
        setAuthCookies(res, tokens);

        res.redirect(redirect('/worker-services/index.html'));
    } catch (error) {
        console.error('Worker Google callback error:', error);

        redirectWithError(res, 'google-authentication-failed');
    }
};