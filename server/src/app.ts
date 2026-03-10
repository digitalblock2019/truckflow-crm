import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiRouter from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(morgan('dev'));
// Skip JSON parsing for Stripe webhook (needs raw body for signature verification)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/invoice/webhook/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use('/api', apiRouter);

app.use(errorHandler);

export default app;
