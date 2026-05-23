import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('Unhandled Error:', err?.message || err);

  // Body too large (from express.json limit)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Request body too large (max 50 MB)', code: 'PAYLOAD_TOO_LARGE' } });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';

  res.status(status).json({ error: { message, code } });
}
