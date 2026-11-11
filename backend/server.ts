import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import healthRoutes from './routes/health.js';
import contactRoutes from './routes/contact.js';
import servicesRoutes from './routes/services.js';
import workerAuthenticationRoutes from './routes/worker-authentication.js';
import workerEmailOTPRoutes from './routes/worker-email-otp.js';
import workerPasswordResetOTPRoutes from './routes/worker-password-reset-otp.js';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://skillconnect2-six.vercel.app',
  ],
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/health', healthRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/worker-authentication', workerAuthenticationRoutes);
app.use('/api/worker-email-otp', workerEmailOTPRoutes);
app.use('/api/worker-password-reset-otp', workerPasswordResetOTPRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`SkillConnect API running on port ${PORT}`);
});