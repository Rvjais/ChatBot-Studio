import type { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { validateBrowserProducts } from '../services/products/browser-products.js';
import { assertOriginAllowed, loadPublicChatbot, publicWidgetConfig } from '../services/widget/widget.service.js';
import { notFound } from '../utils/errors.js';
import { respondWithChat } from './chat-response.js';

const originOf = (req: Request) => ({ origin: req.get('origin') ?? undefined, referer: req.get('referer') ?? undefined });

export async function getConfig(req: Request, res: Response) {
  const chatbot = await loadPublicChatbot(String(req.params.publicId));
  const { origin, referer } = originOf(req);
  assertOriginAllowed(chatbot, origin, referer);
  // Browser-only caching: the answer can depend on the requesting site (allowed domains), and
  // browser caches are partitioned per site, so no shared cache may store it.
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({ config: publicWidgetConfig(chatbot) });
}

/** Public chat endpoint used by widget.js. Steps 1–4 of the engine workflow happen here. */
export async function chat(req: Request, res: Response) {
  const body = req.body as {
    chatbotId?: string;
    publicId?: string;
    message: string;
    conversationId?: string | null;
    visitorId: string;
    products?: unknown[];
    pageUrl?: string;
    stream?: boolean;
  };
  const chatbot = await loadPublicChatbot(body.chatbotId ?? body.publicId ?? '', true);
  const { origin, referer } = originOf(req);
  assertOriginAllowed(chatbot, origin, referer);

  const pageProducts =
    chatbot.productSettings?.allowBrowserProducts !== false && body.products?.length ? validateBrowserProducts(body.products).products : [];

  await respondWithChat(
    res,
    {
      chatbot,
      message: body.message,
      conversationId: body.conversationId ?? undefined,
      visitorId: body.visitorId,
      pageProducts,
      channel: 'widget',
      origin,
      pageUrl: body.pageUrl,
    },
    { stream: Boolean(body.stream), exposeErrors: false },
  );
}

/** Restores a visitor's conversation (only for the visitor and chatbot that own it). */
export async function getConversation(req: Request, res: Response) {
  const { chatbotId, visitorId } = req.validatedQuery as { chatbotId: string; visitorId: string };
  const chatbot = await loadPublicChatbot(chatbotId);
  const { origin, referer } = originOf(req);
  assertOriginAllowed(chatbot, origin, referer);
  const conv = await Conversation.findOne({ conversationId: req.params.conversationId, chatbotId: chatbot._id, visitorId }).lean();
  if (!conv) throw notFound('Conversation');
  const messages = await Message.find({ conversationId: conv._id, role: { $in: ['user', 'assistant'] } })
    .sort({ timestamp: 1 })
    .limit(200)
    .select('role content timestamp')
    .lean();
  res.json({
    conversationId: conv.conversationId,
    messages: messages.map((m) => ({ id: m._id.toString(), role: m.role, content: m.content, timestamp: m.timestamp })),
  });
}
