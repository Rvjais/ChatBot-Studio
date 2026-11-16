import type { CatalogModel, PlatformLimits, ProviderId, ProvidersResponse } from '../types/api';
import { api } from './http';

let providersCache: Promise<ProvidersResponse> | null = null;
let limitsCache: Promise<PlatformLimits> | null = null;

/** Server defaults, used until (or if) /platform/limits can be loaded. The API enforces its own values. */
export const DEFAULT_LIMITS: PlatformLimits = {
  maxUploadMb: 20,
  maxFilesPerUpload: 10,
  maxKnowledgeFilesPerChatbot: 500,
  maxProductImportMb: 15,
  maxProductsPerChatbot: 50000,
  maxChatbotsPerUser: 50,
  widget: { maxMessageChars: 2000, maxProducts: 100, maxProductsBytes: 65536 },
};

/** The platform's configured limits (cached per session; cleared on failure so it can retry). */
export function fetchPlatformLimits(): Promise<PlatformLimits> {
  if (!limitsCache) {
    limitsCache = api
      .get<{ limits: PlatformLimits }>('/platform/limits')
      .then((r) => r.data.limits)
      .catch((err) => {
        limitsCache = null;
        throw err;
      });
  }
  return limitsCache;
}
const modelsCache = new Map<string, Promise<CatalogModel[]>>();

/** Provider definitions rarely change; cache them for the session (cleared on failure). */
export function fetchProviders(): Promise<ProvidersResponse> {
  if (!providersCache) {
    providersCache = api
      .get<ProvidersResponse>('/ai/providers')
      .then((r) => r.data)
      .catch((err) => {
        providersCache = null;
        throw err;
      });
  }
  return providersCache;
}

export function fetchCatalogModels(provider: ProviderId, type: 'chat' | 'embedding' = 'chat'): Promise<CatalogModel[]> {
  const key = `${provider}:${type}`;
  let hit = modelsCache.get(key);
  if (!hit) {
    hit = api
      .get<{ models: CatalogModel[] }>('/ai/models', { params: { provider, type } })
      .then((r) => r.data.models)
      .catch((err) => {
        modelsCache.delete(key);
        throw err;
      });
    modelsCache.set(key, hit);
  }
  return hit;
}
