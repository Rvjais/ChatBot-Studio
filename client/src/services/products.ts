import type { ImportReport, Paginated, Product, ProductSearchTestResult } from '../types/api';
import { clean } from './chatbots';
import { api } from './http';

const base = (id: string) => `/chatbots/${encodeURIComponent(id)}/products`;

export type ProductInputBody = Record<string, string | number | boolean>;

export const productsApi = {
  list: (chatbotId: string, query: { q?: string; category?: string; page?: number; limit?: number }) =>
    api.get<Paginated<Product>>(base(chatbotId), { params: clean(query) }).then((r) => r.data),
  categories: (chatbotId: string) => api.get<{ categories: string[] }>(`${base(chatbotId)}/categories`).then((r) => r.data.categories),
  create: (chatbotId: string, body: ProductInputBody) =>
    api.post<{ product: Product }>(base(chatbotId), body).then((r) => r.data.product),
  update: (chatbotId: string, id: string, body: ProductInputBody) =>
    api.put<{ product: Product }>(`${base(chatbotId)}/${id}`, body).then((r) => r.data.product),
  remove: (chatbotId: string, id: string) => api.delete(`${base(chatbotId)}/${id}`).then(() => undefined),
  removeAll: (chatbotId: string) => api.delete<{ deleted: number }>(base(chatbotId), { data: { confirm: true } }).then((r) => r.data.deleted),
  import: (chatbotId: string, file: File, mode: 'upsert' | 'replace') => {
    const form = new FormData();
    form.append('mode', mode);
    form.append('file', file);
    return api
      .post<{ report: ImportReport }>(`${base(chatbotId)}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
      })
      .then((r) => r.data.report);
  },
  searchTest: (chatbotId: string, query: string, pageProducts?: unknown[]) =>
    api
      .post<ProductSearchTestResult>(`${base(chatbotId)}/search-test`, { query, ...(pageProducts?.length ? { pageProducts } : {}) })
      .then((r) => r.data),
};
