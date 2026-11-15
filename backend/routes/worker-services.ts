import { Router } from 'express';
import { getWorkerServices } from '../controllers/worker-services.js';

const router = Router();

router.get('/', getWorkerServices);

export default router;