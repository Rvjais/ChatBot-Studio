import type { Types } from 'mongoose';
import type { ChatbotDoc } from '../models/Chatbot.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: Types.ObjectId; email: string; name: string };
      chatbot?: ChatbotDoc;
      /** Parsed + validated query string (Express 5 makes req.query read-only). */
      validatedQuery?: Record<string, any>;
    }
  }
}

export {};
