import { Router } from 'express';
import {
  signupWorker,
  loginWorker,
  forgotPassword,
  googleAuthentication,
  googleCallback,
} from '../controllers/worker-authentication.js';

const router = Router();

router.post('/signup', signupWorker);
router.post('/login', loginWorker);
router.post('/forgot-password', forgotPassword);
router.post('/google', googleAuthentication);
router.get('/google/callback', googleCallback);

export default router;