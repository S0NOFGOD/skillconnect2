import { Router } from 'express';
import {
    getWorkerViewService,
    updateWorkerViewService
} from '../controllers/worker-view-service.js';

const router = Router();

router.get('/:serviceId', getWorkerViewService);
router.put('/:serviceId', updateWorkerViewService);

export default router;