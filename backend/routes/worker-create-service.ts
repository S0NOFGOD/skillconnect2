import { Router } from 'express';
import { createWorkerService } from '../controllers/worker-create-service.js';

const router = Router();

router.post('/', createWorkerService);

export default router;