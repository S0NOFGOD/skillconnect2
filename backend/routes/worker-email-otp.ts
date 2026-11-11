import { Router } from 'express';
import {
  verifyWorkerEmailOTP,
  resendWorkerEmailOTP,
} from '../controllers/worker-email-otp.js';

const router = Router();

router.post('/verify', verifyWorkerEmailOTP);
router.post('/resend', resendWorkerEmailOTP);

export default router;