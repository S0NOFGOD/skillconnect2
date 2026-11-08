import { Router } from 'express';
import { getNearbyWorkers } from '../controllers/services.js';

const router = Router();

router.post('/', getNearbyWorkers);

export default router;