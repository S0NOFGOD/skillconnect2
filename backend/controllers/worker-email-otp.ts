import type { Request, Response } from 'express';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma.js';

const OTP_EXPIRY = 10 * 60 * 1000;
const MAX_RESENDS = 4;
const COOLDOWN = 24 * 60 * 60 * 1000;

const sendOTPEmail = async (email: string, otp: string) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'SkillConnect';

  if (!apiKey || !senderEmail) throw new Error('Brevo email configuration is missing.');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: 'SkillConnect Email Verification',
      textContent: `Your SkillConnect verification code is ${otp}. It expires in 10 minutes.`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;padding:25px;max-width:500px;margin:auto">
          <h2>Verify Your Email</h2>
          <p>Use the verification code below to continue creating your SkillConnect account.</p>
          <h1 style="letter-spacing:8px;color:#16a34a">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
          <p>SkillConnect</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Brevo email error:', error);
    throw new Error('Unable to send verification email.');
  }
};

export const verifyWorkerEmailOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
    }

    const worker = await prisma.worker.findUnique({ where: { email } });

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker account not found. Please register again.' });
    }

    if (worker.emailVerified) {
      return res.json({ success: true, message: 'Your email is already verified.' });
    }

    if (!worker.emailOtpHash || !worker.emailOtpExpires || worker.emailOtpExpires <= new Date()) {
      return res.status(400).json({ success: false, message: 'Your verification code has expired. Please request a new one.' });
    }

    const isValid = await bcrypt.compare(otp, worker.emailOtpHash);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'The verification code is incorrect. Please try again.' });
    }

    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        emailVerified: true,
        emailOtpHash: null,
        emailOtpExpires: null,
      },
    });

    return res.json({ success: true, message: 'Your email has been successfully verified.' });
  } catch (error) {
    console.error('Worker email OTP verification error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

export const resendWorkerEmailOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const worker = await prisma.worker.findUnique({ where: { email } });

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker account not found. Please register again.' });
    }

    if (worker.emailVerified) {
      return res.status(400).json({ success: false, message: 'Your email has already been verified.' });
    }

    const now = new Date();
    const activeCooldown = worker.emailOtpCooldownUntil && worker.emailOtpCooldownUntil > now;

    if (activeCooldown) {
      return res.status(429).json({
        success: false,
        message: 'You have reached the maximum resend attempts.',
        coolDownUntil: worker.emailOtpCooldownUntil!.toISOString(),
      });
    }

    const resendCount = worker.emailOtpCooldownUntil ? 0 : worker.emailOtpResendCount;

    if (resendCount >= MAX_RESENDS) {
      const coolDownUntil = new Date(now.getTime() + COOLDOWN);

      await prisma.worker.update({
        where: { id: worker.id },
        data: { emailOtpCooldownUntil: coolDownUntil },
      });

      return res.status(429).json({
        success: false,
        message: 'You have reached the maximum resend attempts.',
        coolDownUntil: coolDownUntil.toISOString(),
      });
    }

    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await sendOTPEmail(email, otp);

    await prisma.worker.update({
      where: { id: worker.id },
      data: {
        emailOtpHash: otpHash,
        emailOtpExpires: new Date(now.getTime() + OTP_EXPIRY),
        emailOtpResendCount: resendCount + 1,
        emailOtpCooldownUntil: null,
      },
    });

    return res.json({
      success: true,
      message: 'A new verification code has been sent to your email.',
    });
  } catch (error) {
    console.error('Worker email OTP resend error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to send a new verification code. Please try again.',
    });
  }
};