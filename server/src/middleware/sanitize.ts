import type { NextFunction, Request, Response } from 'express';

const MAX_DEPTH = 20;

/**
 * Removes object keys that MongoDB would interpret as operators or paths ("$where", "a.b")
 * and prototype-pollution keys, recursively. Defence in depth on top of zod validation.
 */
export function stripDangerousKeys<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((v, i) => ((value as unknown[])[i] = stripDangerousKeys(v, depth + 1)));
    return value;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete (value as Record<string, unknown>)[key];
    } else {
      (value as Record<string, unknown>)[key] = stripDangerousKeys((value as Record<string, unknown>)[key], depth + 1);
    }
  }
  return value;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = stripDangerousKeys(req.body);
  next();
}
