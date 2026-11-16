import { useMemo } from 'react';
import { fetchCatalogModels, fetchProviders } from '../services/catalog';
import type { ProviderDefinition, ProviderId } from '../types/api';
import { useAsync } from './useAsync';

/** Provider catalog from GET /api/ai/providers (cached per session). */
export function useProviders() {
  const state = useAsync(() => fetchProviders(), []);
  const byId = useMemo(() => {
    const map = new Map<ProviderId, ProviderDefinition>();
    state.data?.providers.forEach((p) => map.set(p.id, p));
    return map;
  }, [state.data]);
  return { ...state, providers: state.data?.providers ?? [], embeddingProviders: state.data?.embeddingProviders ?? [], byId };
}

export function useCatalogModels(provider: ProviderId | undefined, type: 'chat' | 'embedding' = 'chat') {
  return useAsync(() => (provider ? fetchCatalogModels(provider, type) : Promise.resolve([])), [provider, type]);
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  custom: 'Custom',
};

export function providerLabel(id: string | undefined | null): string {
  if (!id) return '—';
  return PROVIDER_LABELS[id as ProviderId] ?? id;
}
