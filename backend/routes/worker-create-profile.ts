import { Router } from 'express';
import { createWorkerProfile } from '../controllers/worker-create-profile.js';

const router = Router();

router.post('/', createWorkerProfile);

export default router;