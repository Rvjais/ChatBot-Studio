import { Types } from 'mongoose';
import { Chatbot } from '../../models/Chatbot.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';

function dayRange(days: number): { since: Date; keys: string[] } {
  const keys: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return { since: new Date(today.getTime() - (days - 1) * 86_400_000), keys };
}

function fill(keys: string[], rows: { _id: string; count: number }[]) {
  const map = new Map(rows.map((r) => [r._id, r.count]));
  return keys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

interface UsageRow {
  _id: { provider: string; model: string };
  messages: number;
  inputTokens: number;
  outputTokens: number;
  withUsage: number;
  costUsd: number;
  costedMessages: number;
  avgLatencyMs: number;
  errors: number;
}

async function providerUsage(match: Record<string, unknown>) {
  const rows = await Message.aggregate<UsageRow>([
    { $match: { ...match, role: 'assistant' } },
    {
      $group: {
        _id: { provider: '$metadata.provider', model: '$metadata.model' },
        messages: { $sum: 1 },
        inputTokens: { $sum: { $ifNull: ['$tokenUsage.inputTokens', 0] } },
        outputTokens: { $sum: { $ifNull: ['$tokenUsage.outputTokens', 0] } },
        withUsage: { $sum: { $cond: [{ $gt: ['$tokenUsage.totalTokens', null] }, 1, 0] } },
        costUsd: { $sum: { $ifNull: ['$metadata.costUsd', 0] } },
        costedMessages: { $sum: { $cond: [{ $gt: ['$metadata.costUsd', null] }, 1, 0] } },
        avgLatencyMs: { $avg: '$metadata.latencyMs' },
        errors: { $sum: { $cond: [{ $gt: ['$metadata.error.code', null] }, 1, 0] } },
      },
    },
    { $sort: { messages: -1 } },
  ]);
  return rows.map((r) => ({
    provider: r._id.provider ?? 'unknown',
    model: r._id.model ?? 'unknown',
    messages: r.messages,
    errors: r.errors,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    messagesWithUsage: r.withUsage,
    /** Sum of recorded costs only; null when no message had a known cost. */
    costUsd: r.costedMessages ? Number(r.costUsd.toFixed(6)) : null,
    messagesWithCost: r.costedMessages,
    avgLatencyMs: r.avgLatencyMs ? Math.round(r.avgLatencyMs) : null,
  }));
}

function summarizeUsage(rows: Awaited<ReturnType<typeof providerUsage>>) {
  const costed = rows.filter((r) => r.costUsd !== null);
  return {
    inputTokens: rows.reduce((n, r) => n + r.inputTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
    costUsd: costed.length ? Number(costed.reduce((n, r) => n + (r.costUsd ?? 0), 0).toFixed(6)) : null,
    messagesWithCost: rows.reduce((n, r) => n + r.messagesWithCost, 0),
    messagesWithoutCost: rows.reduce((n, r) => n + (r.messages - r.messagesWithCost - r.errors), 0),
  };
}

export async function overviewAnalytics(ownerId: Types.ObjectId) {
  const { since, keys } = dayRange(14);
  const [totalChatbots, activeChatbots, totalConversations, totalMessages, chatbots, recent, daily, usage] = await Promise.all([
    Chatbot.countDocuments({ ownerId }),
    Chatbot.countDocuments({ ownerId, status: 'active' }),
    Conversation.countDocuments({ ownerId, channel: 'widget' }),
    Message.countDocuments({ ownerId, channel: 'widget', role: { $in: ['user', 'assistant'] } }),
    Chatbot.find({ ownerId }).select('name status ai.provider ai.model ai.apiKeyLast4 ai.lastTest ai.baseUrl').sort({ updatedAt: -1 }).lean(),
    Conversation.find({ ownerId }).sort({ lastMessageAt: -1 }).limit(8).lean(),
    Conversation.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId, channel: 'widget', createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    providerUsage({ ownerId, timestamp: { $gte: new Date(Date.now() - 30 * 86_400_000) } }),
  ]);

  const names = new Map(chatbots.map((c) => [c._id.toString(), c.name]));
  const providerStatus = chatbots.map((c) => ({
    chatbotId: c._id.toString(),
    name: c.name,
    status: c.status,
    provider: c.ai?.provider,
    model: c.ai?.model,
    configured: Boolean(c.ai?.apiKeyLast4) || (c.ai?.provider === 'custom' && Boolean(c.ai?.baseUrl)),
    lastTest: c.ai?.lastTest?.status ?? null,
  }));

  return {
    totals: {
      chatbots: totalChatbots,
      activeChatbots,
      conversations: totalConversations,
      messages: totalMessages,
      configuredChatbots: providerStatus.filter((p) => p.configured).length,
    },
    providerStatus,
    recentActivity: recent.map((c) => ({
      id: c._id.toString(),
      conversationId: c.conversationId,
      chatbotId: c.chatbotId.toString(),
      chatbotName: names.get(c.chatbotId.toString()) ?? 'Deleted chatbot',
      channel: c.channel,
      preview: c.lastMessagePreview ?? '',
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
    })),
    dailyConversations: fill(keys, daily),
    usageLast30Days: { byModel: usage, ...summarizeUsage(usage) },
  };
}

export async function chatbotAnalytics(chatbotId: Types.ObjectId, days: number) {
  const { since, keys } = dayRange(days);
  const convMatch = { chatbotId, channel: 'widget', createdAt: { $gte: since } };
  const msgMatch = { chatbotId, channel: 'widget', timestamp: { $gte: since } };

  const [conversations, messages, dailyConv, dailyMsg, topQuestions, usage, allTime] = await Promise.all([
    Conversation.countDocuments(convMatch),
    Message.countDocuments({ ...msgMatch, role: { $in: ['user', 'assistant'] } }),
    Conversation.aggregate<{ _id: string; count: number }>([
      { $match: convMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Message.aggregate<{ _id: string; count: number }>([
      { $match: { ...msgMatch, role: 'user' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, count: { $sum: 1 } } },
    ]),
    Message.aggregate<{ _id: string; count: number; example: string; lastAsked: Date }>([
      { $match: { ...msgMatch, role: 'user' } },
      {
        $project: {
          content: 1,
          timestamp: 1,
          key: { $trim: { input: { $toLower: { $substrCP: ['$content', 0, 160] } }, chars: ' ?!.\n\t' } },
        },
      },
      { $group: { _id: '$key', count: { $sum: 1 }, example: { $first: '$content' }, lastAsked: { $max: '$timestamp' } } },
      { $sort: { count: -1, lastAsked: -1 } },
      { $limit: 10 },
    ]),
    // Token spend includes dashboard test chats (the provider bills those too).
    providerUsage({ chatbotId, timestamp: { $gte: since } }),
    Conversation.aggregate<{ conversations: number; messages: number }>([
      { $match: { chatbotId, channel: 'widget' } },
      { $group: { _id: null, conversations: { $sum: 1 }, messages: { $sum: '$messageCount' } } },
    ]),
  ]);

  return {
    days,
    totals: {
      conversations,
      messages,
      avgMessagesPerConversation: conversations ? Number((messages / conversations).toFixed(2)) : 0,
      allTimeConversations: allTime[0]?.conversations ?? 0,
      allTimeMessages: allTime[0]?.messages ?? 0,
    },
    dailyConversations: fill(keys, dailyConv),
    dailyMessages: fill(keys, dailyMsg),
    topQuestions: topQuestions.map((q) => ({ question: q.example.slice(0, 200), count: q.count, lastAsked: q.lastAsked })),
    providerUsage: usage,
    usage: summarizeUsage(usage),
  };
}
