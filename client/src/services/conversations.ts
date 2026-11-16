import type { ConversationDetail, ConversationListQuery, ConversationSummary, OverviewAnalytics, Paginated } from '../types/api';
import { clean } from './chatbots';
import { api } from './http';

export const conversationsApi = {
  list: (query: ConversationListQuery) =>
    api.get<Paginated<ConversationSummary>>('/conversations', { params: clean(query) }).then((r) => r.data),
  get: (id: string) => api.get<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`).then((r) => r.data),
  remove: (id: string) => api.delete(`/conversations/${encodeURIComponent(id)}`).then(() => undefined),
};

export const analyticsApi = {
  overview: () => api.get<OverviewAnalytics>('/analytics/overview').then((r) => r.data),
};
