import { Router } from 'express';
import {
    refreshToken,
    logout
} from '../controllers/auth.js';

const router = Router();

router.post('/refresh', refreshToken);
router.post('/logout', logout);

export default router;