import { Router } from 'express';
import {
    getWorkerDashboard,
    sendWorkerPhoneOTP
} from '../controllers/worker-dashboard.js';

const router = Router();

router.get('/dashboard', getWorkerDashboard);
router.post('/send-phone-otp', sendWorkerPhoneOTP);

export default router;