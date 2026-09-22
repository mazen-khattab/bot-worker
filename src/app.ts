import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import workerRoutes from './routes';
import { requireApiKey } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // This service only talks to one known .NET backend, so a generous but
  // finite limit is mostly a safety net against bugs/loops, not abuse.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use('/api/worker', requireApiKey, workerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
