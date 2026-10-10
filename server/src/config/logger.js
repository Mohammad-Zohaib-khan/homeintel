import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.isTest ? 'silent' : env.isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
      '*.password', '*.passwordHash', '*.token', '*.accessToken', '*.refreshToken',
      '*.mfaCode', '*.totpSecret', '*.apiKey', '*.secret',
    ],
    censor: '[REDACTED]',
  },
});
