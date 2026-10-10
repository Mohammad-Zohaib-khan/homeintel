import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export const notFoundHandler = (req, _res, next) => next(AppError.notFound(`Route ${req.method} ${req.path} not found`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'Something went wrong', details;
  if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid input';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Payload too large';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'BAD_JSON'; message = 'Malformed JSON body';
  } else if (err?.message === 'CORS_ORIGIN_DENIED') {
    status = 403; code = 'CORS_DENIED'; message = 'Origin not allowed';
  }
  if (status >= 500) {
    logger.error({ err: { name: err?.name, message: err?.message, stack: env.isProd ? undefined : err?.stack }, path: req.path }, 'unhandled error');
  }
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
};
