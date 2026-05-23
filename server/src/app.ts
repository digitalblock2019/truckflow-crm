import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiRouter from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Render terminates TLS at its load balancer and forwards via X-Forwarded-For.
// Trusting one proxy hop makes req.ip the real client IP (used by the audit log).
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(morgan('dev'));
// Skip JSON parsing for Stripe webhook (needs raw body for signature verification).
// 10mb cap covers ~30k trucker import rows per chunk comfortably; large uploads
// are chunked on the client into batches of 500.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/invoice/webhook/stripe') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

app.use('/api', apiRouter);

app.use(errorHandler);

export default app;
