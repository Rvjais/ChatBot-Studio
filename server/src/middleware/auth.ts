import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/errors.js';

const ISSUER = 'ai-chatbot-builder';
const AUDIENCE = 'dashboard';

interface TokenPayload {
  sub: string;
  ver: number;
}

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ ver: tokenVersion }, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies the Bearer JWT, then loads the user to confirm the account still exists and the
 * token has not been revoked (tokenVersion is bumped on logout / password change).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    }) as unknown as TokenPayload;
  } catch {
    return next(unauthorized('Invalid or expired session. Please sign in again.'));
  }
  if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) return next(unauthorized());
  const user = await User.findById(payload.sub).select('name email tokenVersion').lean();
  if (!user || (user.tokenVersion ?? 0) !== payload.ver) {
    return next(unauthorized('Your session has ended. Please sign in again.'));
  }
  req.user = { id: user._id, email: user.email, name: user.name };
  next();
}
