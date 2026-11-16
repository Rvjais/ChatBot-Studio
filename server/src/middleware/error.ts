import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AIProviderError } from '../services/ai/errors.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

/**
 * Central error handler. Client errors get specific, safe messages; server errors are
 * logged with details but returned as a generic message (no stack traces, no internals).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    logger.error({ err }, 'Error after response started');
    return;
  }
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof AIProviderError) {
    status = 502;
    code = `AI_${err.code.toUpperCase()}`;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${env.MAX_UPLOAD_MB} MB)`
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Too many files (max ${env.MAX_FILES_PER_UPLOAD} per upload)`
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected file field "${err.field}"`
            : err.message;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = `Invalid value for ${err.path}`;
  } else if ((err as { code?: number })?.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with the same unique value already exists';
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  }

  if (status >= 500) logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
