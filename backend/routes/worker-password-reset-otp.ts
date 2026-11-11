import { Router } from 'express';
import {
  verifyWorkerPasswordResetOTP,
  resendWorkerPasswordResetOTP,
} from '../controllers/worker-password-reset-otp.js';

const router = Router();

router.post('/verify', verifyWorkerPasswordResetOTP);
router.post('/resend', resendWorkerPasswordResetOTP);

export default router;