import type {
  AiConfigUpdate,
  Chatbot,
  ChatbotAnalytics,
  ChatbotListQuery,
  ChatbotStatus,
  ChatbotUpdate,
  CreateChatbotInput,
  EmbedInfo,
  LiveModel,
  Paginated,
  ProviderId,
  TestProviderResult,
  WidgetPublicConfig,
} from '../types/api';
import { api } from './http';

const base = (id: string) => `/chatbots/${encodeURIComponent(id)}`;

export const chatbotsApi = {
  list: (query: ChatbotListQuery = {}) => api.get<Paginated<Chatbot>>('/chatbots', { params: clean(query) }).then((r) => r.data),
  /** Every chatbot of the user (for selectors). */
  listAll: () => api.get<Paginated<Chatbot>>('/chatbots', { params: { limit: 100, sort: 'name' } }).then((r) => r.data.items),
  get: (id: string) => api.get<{ chatbot: Chatbot }>(base(id)).then((r) => r.data.chatbot),
  create: (input: CreateChatbotInput) => api.post<{ chatbot: Chatbot }>('/chatbots', input).then((r) => r.data.chatbot),
  update: (id: string, input: ChatbotUpdate) => api.put<{ chatbot: Chatbot }>(base(id), input).then((r) => r.data.chatbot),
  remove: (id: string) => api.delete(base(id)).then(() => undefined),
  duplicate: (id: string, input: { name?: string; includeProducts: boolean; includeKnowledge: boolean }) =>
    api.post<{ chatbot: Chatbot }>(`${base(id)}/duplicate`, input).then((r) => r.data.chatbot),
  setStatus: (id: string, status: ChatbotStatus) =>
    api.patch<{ chatbot: Chatbot }>(`${base(id)}/status`, { status }).then((r) => r.data.chatbot),
  updateAiConfig: (id: string, input: AiConfigUpdate) =>
    api.put<{ chatbot: Chatbot }>(`${base(id)}/ai-config`, input).then((r) => r.data.chatbot),
  testProvider: (id: string, target: 'chat' | 'embedding', override?: AiConfigUpdate) =>
    api.post<TestProviderResult>(`${base(id)}/test-provider`, { target, ...(override ? { override } : {}) }).then((r) => r.data),
  liveModels: (id: string, input: { provider?: ProviderId; apiKey?: string; baseUrl?: string }) =>
    api.post<{ models: LiveModel[] }>(`${base(id)}/models`, clean(input)).then((r) => r.data.models),
  embed: (id: string) => api.get<EmbedInfo>(`${base(id)}/embed`).then((r) => r.data),
  createSyncKey: (id: string) => api.post<{ key: string; message: string }>(`${base(id)}/sync-key`).then((r) => r.data),
  revokeSyncKey: (id: string) => api.delete(`${base(id)}/sync-key`).then(() => undefined),
  analytics: (id: string, days: number) =>
    api.get<ChatbotAnalytics>(`/analytics/chatbots/${encodeURIComponent(id)}`, { params: { days } }).then((r) => r.data),
  /** Public widget config (limits for page-provided products). */
  widgetConfig: (publicId: string) =>
    api.get<WidgetPublicConfig>(`/widget/config/${encodeURIComponent(publicId)}`).then((r) => r.data.config),
};

/** Drops empty values so the server's query validation doesn't see blank strings. */
export function clean<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out as Partial<T>;
}
