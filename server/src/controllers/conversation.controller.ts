import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Chatbot } from '../models/Chatbot.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { notFound } from '../utils/errors.js';
import { escapeRegex } from '../utils/text.js';

export async function list(req: Request, res: Response) {
  const q = req.validatedQuery as { chatbotId?: string; q?: string; channel?: string; page: number; limit: number };
  const ownerId = req.user!.id;
  // ownerId is ALWAYS part of the filter: a chatbotId from another tenant simply matches nothing.
  const filter: Record<string, unknown> = { ownerId };
  if (q.chatbotId) filter.chatbotId = new Types.ObjectId(q.chatbotId);
  if (q.channel) filter.channel = q.channel;

  if (q.q) {
    const term = q.q;
    const matchingIds = await Message.find({ ownerId, $text: { $search: term } })
      .select('conversationId')
      .limit(1000)
      .lean();
    filter.$or = [
      { conversationId: term },
      { visitorId: new RegExp(`^${escapeRegex(term)}`, 'i') },
      { lastMessagePreview: new RegExp(escapeRegex(term), 'i') },
      { _id: { $in: [...new Set(matchingIds.map((m) => m.conversationId.toString()))].map((id) => new Types.ObjectId(id)) } },
    ];
  }

  const [items, total, chatbots] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Conversation.countDocuments(filter),
    Chatbot.find({ ownerId }).select('name').lean(),
  ]);
  const names = new Map(chatbots.map((c) => [c._id.toString(), c.name]));
  res.json({
    items: items.map((c) => ({
      id: c._id.toString(),
      conversationId: c.conversationId,
      chatbotId: c.chatbotId.toString(),
      chatbotName: names.get(c.chatbotId.toString()) ?? 'Deleted chatbot',
      visitorId: c.visitorId,
      channel: c.channel,
      messageCount: c.messageCount,
      preview: c.lastMessagePreview ?? '',
      origin: c.origin ?? null,
      pageUrl: c.pageUrl ?? null,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
    })),
    total,
    page: q.page,
    limit: q.limit,
  });
}

export async function get(req: Request, res: Response) {
  const conv = await Conversation.findOne({ _id: req.params.id, ownerId: req.user!.id }).lean();
  if (!conv) throw notFound('Conversation');
  const [messages, chatbot] = await Promise.all([
    Message.find({ conversationId: conv._id, ownerId: req.user!.id }).sort({ timestamp: 1 }).limit(1000).lean(),
    Chatbot.findOne({ _id: conv.chatbotId, ownerId: req.user!.id }).select('name').lean(),
  ]);
  res.json({
    conversation: {
      id: conv._id.toString(),
      conversationId: conv.conversationId,
      chatbotId: conv.chatbotId.toString(),
      chatbotName: chatbot?.name ?? 'Deleted chatbot',
      visitorId: conv.visitorId,
      channel: conv.channel,
      messageCount: conv.messageCount,
      origin: conv.origin ?? null,
      pageUrl: conv.pageUrl ?? null,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
    },
    messages: messages.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      tokenUsage: m.tokenUsage ?? null,
      metadata: m.metadata ?? null,
    })),
  });
}

export async function remove(req: Request, res: Response) {
  const conv = await Conversation.findOneAndDelete({ _id: req.params.id, ownerId: req.user!.id });
  if (!conv) throw notFound('Conversation');
  await Message.deleteMany({ conversationId: conv._id, ownerId: req.user!.id });
  res.status(204).end();
}
