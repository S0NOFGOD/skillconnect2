import { Router } from 'express';
import workerPasswordChange from '../controllers/worker-password-change.js';

const router = Router();

router.post('/', workerPasswordChange);

export default router;