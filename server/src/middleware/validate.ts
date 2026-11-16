import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { AppError } from '../utils/errors.js';

function formatIssues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Validates and replaces req.body with the parsed (typed, stripped) value. */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', formatIssues(result.error)));
    }
    req.body = result.data;
    next();
  };
}

/** Validates the query string into req.validatedQuery. */
export function validateQuery(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters', formatIssues(result.error)));
    }
    req.validatedQuery = result.data as Record<string, any>;
    next();
  };
}
