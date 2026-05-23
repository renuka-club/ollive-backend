import express from 'express';
import cors from 'cors';
import { config } from './config/env';

import conversationsRouter from './routes/conversations';
import messagesRouter from './routes/messages';
import logsRouter from './routes/logs';
import analyticsRouter from './routes/analytics';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow all localhost origins and the configured FRONTEND_URL
    const allowed = [config.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://localhost:8080'];
    if (!origin || allowed.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' })); // 50mb to accommodate base64-encoded images
app.use(requestLogger);

// Health check — used by Render and uptime monitors to keep the service warm
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// API Routes
app.use('/api/conversations', conversationsRouter);
// Mount messages router on top of the conversation id route
app.use('/api/conversations/:id/messages', messagesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/analytics', analyticsRouter);

// Global Error Handler
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`🚀 Ollive Backend is running on http://localhost:${config.PORT}`);
});
