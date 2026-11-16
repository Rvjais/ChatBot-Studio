import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { CHATBOT_SECRET_FIELDS } from '../services/ai/ai.service.js';
import { Chatbot, type ChatbotDoc } from '../models/Chatbot.js';
import { notFound } from '../utils/errors.js';

/**
 * Loads the chatbot from :id ONLY if it belongs to the authenticated user. A chatbot owned by
 * someone else is reported as "not found" so IDs cannot be probed. Every chatbot-scoped
 * dashboard route goes through this middleware.
 */
export function loadOwnedChatbot(opts: { withSecrets?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) return next(notFound('Chatbot'));
    const query = Chatbot.findOne({ _id: id, ownerId: req.user!.id });
    const chatbot = (await (opts.withSecrets ? query.select(CHATBOT_SECRET_FIELDS) : query)) as ChatbotDoc | null;
    if (!chatbot) return next(notFound('Chatbot'));
    req.chatbot = chatbot;
    next();
  };
}

/** Validates :param as an ObjectId (404 otherwise). */
export function objectIdParam(name: string, label = 'Resource') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = req.params[name];
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) return next(notFound(label));
    next();
  };
}
