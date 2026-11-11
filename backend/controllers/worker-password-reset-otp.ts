import type { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();
const OTP_EXPIRY = 10 * 60 * 1000;
const RESET_AUTH_EXPIRY = 10 * 60 * 1000;
const RESEND_COOLDOWN = 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 4;

const getOTPStatus = (count: number, cooldownUntil: Date | null) => {
  const now = new Date();

  if (cooldownUntil && cooldownUntil > now)
    return { blocked: true, count, cooldownUntil };

  if (cooldownUntil && cooldownUntil <= now)
    return { blocked: false, count: 0, cooldownUntil: null };

  if (count >= MAX_OTP_ATTEMPTS)
    return { blocked: true, count: 0, cooldownUntil: new Date(Date.now() + RESEND_COOLDOWN) };

  return { blocked: false, count, cooldownUntil };
};

export const verifyWorkerPasswordResetOTP: RequestHandler = async (req, res) => {
  try {
    const { email, otp } = req.body ?? {};

    if (typeof email !== 'string' || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      res.status(400).json({ success: false, message: 'Enter a valid 6-digit OTP.' });
      return;
    }

    const worker = await prisma.worker.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!worker || !worker.passwordResetOtpHash || !worker.passwordResetOtpExpires) {
      res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });
      return;
    }

    if (worker.passwordResetOtpExpires <= new Date()) {
      await prisma.worker.update({
        where: { id: worker.id },
        data: {
          passwordResetOtpHash: null,
          passwordResetOtpExpires: null,
          passwordResetOtpVerified: false,
        },
      });

      res.status(400).json({ success: false, message: 'Your OTP has expired. Please request a new one.' });
      return;
    }

    const isValid = await bcrypt.compare(otp, worker.passwordResetOtpHash);

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Incorrect OTP. Please try again.' });
      return;
    }

    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        passwordResetOtpHash: null,
        passwordResetOtpExpires: null,
        passwordResetOtpVerified: true,
        resetAuthorizationExpires: new Date(Date.now() + RESET_AUTH_EXPIRY),
      },
    });

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
    });
  } catch (error) {
    console.error('Worker password reset OTP verification error:', error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

export const resendWorkerPasswordResetOTP: RequestHandler = async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      return;
    }

    const worker = await prisma.worker.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!worker) {
      res.status(404).json({ success: false, message: 'Worker account not found.' });
      return;
    }

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
            passwordResetOtpCooldownUntil: status.cooldownUntil,
          },
        });
      }

      res.status(429).json({
        success: false,
        message: status.cooldownUntil === worker.passwordResetOtpCooldownUntil
          ? 'You have reached the password reset code limit. Please try again after the cooldown.'
          : 'You have reached the password reset code limit. Please try again after 24 hours.',
        cooldownUntil: status.cooldownUntil!,
      });
      return;
    }

    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL || !process.env.BREVO_SENDER_NAME) {
      res.status(500).json({ success: false, message: 'Email service is not configured.' });
      return;
    }

    const otp = randomInt(0, 1000000).toString().padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, 12);

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME,
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: worker.email }],
        subject: 'Your SkillConnect Password Reset OTP',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
            <h2>SkillConnect Password Reset</h2>
            <p>Use the OTP below to reset your password:</p>
            <h1 style="letter-spacing:8px;">${otp}</h1>
            <p>This OTP expires in 10 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
          </div>
        `,
        textContent: `Your SkillConnect password reset OTP is ${otp}. It expires in 10 minutes.`,
      }),
    });

    if (!emailResponse.ok) {
      console.error('Brevo email error:', await emailResponse.text());
      res.status(502).json({ success: false, message: 'Unable to send OTP email. Please try again.' });
      return;
    }

    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpires: new Date(Date.now() + OTP_EXPIRY),
        passwordResetOtpResendCount: status.count + 1,
        passwordResetOtpCooldownUntil: status.cooldownUntil,
        passwordResetOtpVerified: false,
        resetAuthorizationExpires: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'A new OTP has been sent to your email.',
    });
  } catch (error) {
    console.error('Worker password reset OTP resend error:', error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};