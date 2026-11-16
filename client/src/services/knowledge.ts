import type {
  KnowledgeChunk,
  KnowledgeFile,
  KnowledgeFileWithChatbot,
  KnowledgeSearchResult,
  KnowledgeTotals,
  Paginated,
  ProcessingStatus,
} from '../types/api';
import { clean } from './chatbots';
import { api } from './http';

const base = (id: string) => `/chatbots/${encodeURIComponent(id)}/knowledge`;

export const knowledgeApi = {
  list: (chatbotId: string) => api.get<{ files: KnowledgeFile[]; totals: KnowledgeTotals }>(base(chatbotId)).then((r) => r.data),
  upload: (chatbotId: string, files: File[], onProgress?: (percent: number) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api
      .post<{ files: KnowledgeFile[] }>(`${base(chatbotId)}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((r) => r.data.files);
  },
  addText: (chatbotId: string, title: string, content: string) =>
    api.post<{ file: KnowledgeFile }>(`${base(chatbotId)}/text`, { title, content }).then((r) => r.data.file),
  chunks: (chatbotId: string, fileId: string, page: number, limit = 10) =>
    api.get<Paginated<KnowledgeChunk>>(`${base(chatbotId)}/${fileId}/chunks`, { params: { page, limit } }).then((r) => r.data),
  remove: (chatbotId: string, fileId: string) => api.delete(`${base(chatbotId)}/${fileId}`).then(() => undefined),
  reprocess: (chatbotId: string, fileId: string) =>
    api.post<{ file: KnowledgeFile }>(`${base(chatbotId)}/${fileId}/reprocess`).then((r) => r.data.file),
  reprocessAll: (chatbotId: string) => api.post<{ queued: number }>(`${base(chatbotId)}/reprocess-all`).then((r) => r.data.queued),
  search: (chatbotId: string, query: string) =>
    api.post<KnowledgeSearchResult>(`${base(chatbotId)}/search`, { query }).then((r) => r.data),
  listAll: (query: { chatbotId?: string; status?: ProcessingStatus; page?: number; limit?: number }) =>
    api.get<Paginated<KnowledgeFileWithChatbot>>('/knowledge', { params: clean(query) }).then((r) => r.data),
};
