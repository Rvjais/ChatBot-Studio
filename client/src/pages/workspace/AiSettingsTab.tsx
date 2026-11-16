import { useMemo, useState } from 'react';
import { CircleDollarSign, Cpu, Download, ExternalLink, PlugZap, Sparkles, TriangleExclamationPoint } from 'lucide-react';
import { ModelCombobox, type ModelOption } from '../../components/chatbots/ModelCombobox';
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  KeyValueEditor,
  NumberInput,
  Skeleton,
  type KeyValueRow,
} from '../../components/ui';
import { ApiKeyField, type KeyMode } from '../../components/workspace/ai/ApiKeyField';
import { EmbeddingSection, type EmbeddingDraft } from '../../components/workspace/ai/EmbeddingSection';
import { GenerationControls } from '../../components/workspace/ai/GenerationControls';
import { ProviderPicker } from '../../components/workspace/ai/ProviderPicker';
import { LastTestLine, TestResultView } from '../../components/workspace/ai/TestResult';
import { useWorkspace } from '../../components/workspace/context';
import { SaveBar } from '../../components/workspace/SaveBar';
import { useDraft } from '../../hooks/useDraft';
import { useCatalogModels, useProviders } from '../../hooks/useProviders';
import { fetchCatalogModels } from '../../services/catalog';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { AiConfigUpdate, Chatbot, GenerationSettings, LiveModel, ProviderId, TestProviderResult } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { formatCompact, pluralize } from '../../utils/format';

interface ChatDraft {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  authHeader: string;
  authPrefix: string;
  generation: GenerationSettings;
  pricing: { inputPerMillion: number | null; outputPerMillion: number | null };
  contextWindow: number | null;
  refusalFallback: boolean;
}

const toChatDraft = (c: Chatbot): ChatDraft => ({
  provider: c.ai.provider,
  model: c.ai.model,
  baseUrl: c.ai.baseUrl ?? '',
  authHeader: c.ai.authHeader || 'Authorization',
  authPrefix: c.ai.authPrefix ?? 'Bearer ',
  generation: { ...c.ai.generation },
  pricing: { ...c.ai.pricing },
  contextWindow: c.ai.contextWindow,
  refusalFallback: c.ai.refusalFallback,
});

const toEmbDraft = (c: Chatbot): EmbeddingDraft => ({
  provider: c.embedding.provider,
  model: c.embedding.model ?? '',
  useChatCredentials: c.embedding.useChatCredentials,
  baseUrl: c.embedding.baseUrl ?? '',
  dimensions: c.embedding.dimensions,
});

const headerRowsFrom = (c: Chatbot): KeyValueRow[] => c.ai.extraHeaderNames.map((key) => ({ key, value: '', locked: true }));

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function AiSettingsTab() {
  const { chatbot, updateChatbot, reload } = useWorkspace();
  const providersState = useProviders();
  const { providers, byId, embeddingProviders } = providersState;

  const chatSource = useMemo(() => toChatDraft(chatbot), [chatbot]);
  const embSource = useMemo(() => toEmbDraft(chatbot), [chatbot]);
  const chat = useDraft(chatSource);
  const emb = useDraft(embSource);
  const d = chat.draft;

  const [keyMode, setKeyMode] = useState<KeyMode>('keep');
  const [newKey, setNewKey] = useState('');
  const [embKeyMode, setEmbKeyMode] = useState<KeyMode>('keep');
  const [newEmbKey, setNewEmbKey] = useState('');
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() => headerRowsFrom(chatbot));
  const [headersTouched, setHeadersTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ result: TestProviderResult; unsaved: boolean } | null>(null);
  const [liveModels, setLiveModels] = useState<LiveModel[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const def = byId.get(d.provider);
  const catalog = useCatalogModels(d.provider, 'chat');
  const providerChanged = d.provider !== chatbot.ai.provider;
  const savedKeyApplies = chatbot.ai.hasApiKey && !providerChanged;

  const keyDirty = (keyMode === 'replace' && newKey.trim() !== '') || keyMode === 'remove';
  const embKeyDirty = (embKeyMode === 'replace' && newEmbKey.trim() !== '') || embKeyMode === 'remove';
  const chatDirty = chat.dirty || keyDirty || headersTouched;
  const dirty = chatDirty || emb.dirty || embKeyDirty;

  const modelOptions = useMemo<ModelOption[]>(() => {
    const list: ModelOption[] = (catalog.data ?? []).map((m) => ({ ...m, origin: 'catalog' }));
    const seen = new Set(list.map((m) => m.id));
    for (const m of liveModels ?? []) {
      if (m.type === 'embedding') continue;
      if (seen.has(m.id)) {
        const i = list.findIndex((x) => x.id === m.id);
        list[i] = { ...list[i]!, origin: 'live' };
      } else {
        list.push({ id: m.id, label: m.label, contextWindow: m.contextWindow, pricing: m.pricing, origin: 'live' });
      }
    }
    return list;
  }, [catalog.data, liveModels]);
  const selectedCatalogModel = catalog.data?.find((m) => m.id === d.model);
  const selectedLiveModel = liveModels?.find((m) => m.id === d.model);

  const changeProvider = async (provider: ProviderId) => {
    if (provider === d.provider) return;
    const next = byId.get(provider);
    const g = { ...d.generation };
    if (next) {
      (['temperature', 'topP', 'frequencyPenalty', 'presencePenalty'] as const).forEach((k) => {
        if (!next.supports[k]) g[k] = null;
      });
      if (!next.supports.effort) g.effort = null;
      g.maxOutputTokens = Math.min(g.maxOutputTokens, next.maxOutputTokensLimit);
    }
    const backToSaved = provider === chatbot.ai.provider;
    chat.patch({
      provider,
      model: backToSaved ? chatbot.ai.model : '',
      baseUrl: backToSaved ? chatbot.ai.baseUrl : '',
      generation: g,
    });
    setKeyMode(backToSaved ? 'keep' : 'replace');
    setNewKey('');
    setLiveModels(null);
    setLiveError(null);
    setTestResult(null);
    if (!backToSaved) {
      try {
        const models = await fetchCatalogModels(provider, 'chat');
        const pick = models.find((m) => m.recommended) ?? models[0];
        if (pick) chat.setDraft((cur) => (cur.provider === provider && !cur.model ? { ...cur, model: pick.id } : cur));
      } catch {
        /* suggestions are optional */
      }
    }
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!d.model.trim()) e.model = 'Choose or type a model ID';
    if (def?.requiresBaseUrl && !d.baseUrl.trim()) e.baseUrl = `${def.name} needs a base URL`;
    if (d.baseUrl.trim() && !isHttpUrl(d.baseUrl.trim())) e.baseUrl = 'Must be an http(s) URL';
    const limit = def?.maxOutputTokensLimit ?? 128_000;
    if (d.generation.maxOutputTokens < 16 || d.generation.maxOutputTokens > limit) e['generation.maxOutputTokens'] = `Must be between 16 and ${limit}`;
    if (d.contextWindow !== null && (d.contextWindow < 1024 || d.contextWindow > 10_000_000)) e.contextWindow = 'Must be between 1,024 and 10,000,000';
    for (const k of ['inputPerMillion', 'outputPerMillion'] as const) {
      const v = d.pricing[k];
      if (v !== null && (v < 0 || v > 10_000)) e[`pricing.${k}`] = 'Must be between 0 and 10,000';
    }
    if (headersTouched) {
      const headerErrors: Record<number, string> = {};
      const names = new Set<string>();
      headerRows.forEach((r, i) => {
        if (!r.key.trim() && !r.value) return;
        if (!/^[A-Za-z0-9-]{1,100}$/.test(r.key.trim())) headerErrors[i] = 'Header names may contain letters, numbers and hyphens only';
        else if (names.has(r.key.trim().toLowerCase())) headerErrors[i] = 'Duplicate header';
        else if (!r.value) headerErrors[i] = 'Enter the value (header values are write-only and must be re-entered when headers change)';
        names.add(r.key.trim().toLowerCase());
      });
      Object.entries(headerErrors).forEach(([i, msg]) => (e[`header.${i}`] = msg));
    }
    const ed = emb.draft;
    if (ed.provider !== 'none') {
      if (!ed.model.trim()) e['embedding.model'] = 'Choose an embedding model';
      const usesChat = ed.provider === d.provider && ed.useChatCredentials;
      if (!usesChat && ed.provider === 'custom' && !ed.baseUrl.trim()) e['embedding.baseUrl'] = 'A base URL is required for a custom endpoint';
      if (!usesChat && ed.baseUrl.trim() && !isHttpUrl(ed.baseUrl.trim())) e['embedding.baseUrl'] = 'Must be an http(s) URL';
      if (ed.dimensions !== null && (ed.dimensions < 8 || ed.dimensions > 8192)) e['embedding.dimensions'] = 'Must be between 8 and 8192';
    }
    return e;
  };

  /** Only changed fields are sent; the API key only when a new one was typed. */
  const buildChatUpdate = (): AiConfigUpdate => {
    const u: AiConfigUpdate = {};
    const s = chatSource;
    if (d.provider !== s.provider) u.provider = d.provider;
    if (d.model.trim() !== s.model || u.provider) u.model = d.model.trim();
    if (keyMode === 'replace' && newKey.trim()) u.apiKey = newKey.trim();
    if (keyMode === 'remove') u.apiKey = null;
    if (d.baseUrl.trim() !== s.baseUrl) u.baseUrl = d.baseUrl.trim() || null;
    if (d.authHeader !== s.authHeader) u.authHeader = d.authHeader.trim() || 'Authorization';
    if (d.authPrefix !== s.authPrefix) u.authPrefix = d.authPrefix;
    if (headersTouched) {
      const entries = headerRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value] as const);
      u.extraHeaders = entries.length ? Object.fromEntries(entries) : null;
    }
    if (!same(d.generation, s.generation)) u.generation = { ...d.generation };
    if (!same(d.pricing, s.pricing)) u.pricing = { ...d.pricing };
    if (d.contextWindow !== s.contextWindow) u.contextWindow = d.contextWindow;
    if (d.refusalFallback !== s.refusalFallback) u.refusalFallback = d.refusalFallback;
    return u;
  };

  const buildEmbeddingUpdate = (): AiConfigUpdate['embedding'] | undefined => {
    const ed = emb.draft;
    const s = embSource;
    const e: NonNullable<AiConfigUpdate['embedding']> = {};
    if (ed.provider !== s.provider) e.provider = ed.provider;
    if (ed.model.trim() !== s.model || e.provider) e.model = ed.model.trim() || null;
    if (ed.useChatCredentials !== s.useChatCredentials) e.useChatCredentials = ed.useChatCredentials;
    if (ed.baseUrl.trim() !== s.baseUrl) e.baseUrl = ed.baseUrl.trim() || null;
    if (ed.dimensions !== s.dimensions) e.dimensions = ed.dimensions;
    if (embKeyMode === 'replace' && newEmbKey.trim()) e.apiKey = newEmbKey.trim();
    if (embKeyMode === 'remove') e.apiKey = null;
    return Object.keys(e).length ? e : undefined;
  };

  const buildUpdate = (): AiConfigUpdate => {
    const u = buildChatUpdate();
    const e = buildEmbeddingUpdate();
    if (e) u.embedding = e;
    return u;
  };

  const resetLocal = (c: Chatbot) => {
    chat.setDraft(toChatDraft(c));
    emb.setDraft(toEmbDraft(c));
    setKeyMode('keep');
    setNewKey('');
    setEmbKeyMode('keep');
    setNewEmbKey('');
    setHeaderRows(headerRowsFrom(c));
    setHeadersTouched(false);
    setErrors({});
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const updated = await chatbotsApi.updateAiConfig(chatbot.id, buildUpdate());
      const embeddingChanged = updated.embedding.provider !== chatbot.embedding.provider || updated.embedding.model !== chatbot.embedding.model || updated.embedding.dimensions !== chatbot.embedding.dimensions;
      updateChatbot(updated);
      resetLocal(updated);
      setTestResult(null);
      if (embeddingChanged && (chatbot.stats?.knowledgeFiles ?? 0) > 0) {
        toast.warning('AI settings saved', 'The embedding model changed — re-process the knowledge base so search uses the new vectors.');
      } else {
        toast.success('AI settings saved');
      }
    } catch (err) {
      setErrors(getFieldErrors(err));
      toast.error('Could not save AI settings', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const unsaved = chatDirty;
    try {
      const result = await chatbotsApi.testProvider(chatbot.id, 'chat', unsaved ? buildChatUpdate() : undefined);
      setTestResult({ result, unsaved });
      if (!unsaved) void reload();
    } catch (err) {
      setTestResult({ result: { ok: false, latencyMs: 0, message: getErrorMessage(err) }, unsaved });
    } finally {
      setTesting(false);
    }
  };

  const loadLiveModels = async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const models = await chatbotsApi.liveModels(chatbot.id, {
        provider: d.provider,
        apiKey: keyMode === 'replace' && newKey.trim() ? newKey.trim() : undefined,
        baseUrl: d.baseUrl.trim() || undefined,
      });
      setLiveModels(models);
      toast.success(`Loaded ${pluralize(models.length, 'model')} from ${def?.name ?? d.provider}`);
    } catch (err) {
      setLiveError(getErrorMessage(err));
    } finally {
      setLoadingLive(false);
    }
  };

  if (providersState.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (providersState.error || !def) {
    return (
      <Card>
        <ErrorState error={providersState.error ?? new Error('Unknown provider')} onRetry={providersState.reload} title="Could not load AI providers" />
      </Card>
    );
  }

  const catalogPricing = selectedCatalogModel?.pricing ?? (selectedLiveModel?.pricing ? { ...selectedLiveModel.pricing, source: 'provider model list' } : undefined);
  const effectiveContext = selectedCatalogModel?.contextWindow ?? selectedLiveModel?.contextWindow;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={<Sparkles size={16} />} title="AI provider" description="Each chatbot can use a different provider and model." />
        <CardBody>
          <ProviderPicker providers={providers} value={d.provider} onChange={(p) => void changeProvider(p)} />
          {providerChanged && chatbot.ai.hasApiKey && (
            <Callout tone="warning" className="mt-4" icon={<TriangleExclamationPoint size={16} />}>
              API keys are vendor-specific: saving with {def.name} removes the saved {byId.get(chatbot.ai.provider)?.name ?? chatbot.ai.provider} key unless you
              enter a new key below.
            </Callout>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Cpu size={16} />}
          title="Model & credentials"
          description={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {def.docsUrl && (
                <a href={def.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  {def.name} API docs <ExternalLink size={12} />
                </a>
              )}
              {def.apiKeyUrl && (
                <a href={def.apiKeyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  Get an API key <ExternalLink size={12} />
                </a>
              )}
            </span>
          }
        />
        <CardBody className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <ModelCombobox
              value={d.model}
              onChange={(model) => chat.patch({ model })}
              options={modelOptions}
              loading={catalog.loading}
              error={errors.model}
              required
              hint={
                liveError ? undefined : selectedCatalogModel?.notes ?? (effectiveContext ? `Context window: ${formatCompact(effectiveContext)} tokens.` : 'Any model ID offered by the provider works — suggestions are not a limit.')
              }
            />
            {def.supports.listModels && (
              <Button className="lg:mt-[26px]" icon={<Download size={15} />} onClick={loadLiveModels} loading={loadingLive}>
                Load models from provider
              </Button>
            )}
          </div>
          {liveError && (
            <Callout tone="error" title="Could not load models from the provider">
              {liveError}
            </Callout>
          )}
          {liveModels && !liveError && (
            <p className="-mt-2 text-xs text-emerald-700">{pluralize(liveModels.length, 'model')} loaded live from {def.name} — open the model list to choose one.</p>
          )}
          {selectedCatalogModel?.supportsSampling === false && (
            <Callout tone="neutral">This model is a reasoning model that ignores sampling parameters such as temperature and top-p.</Callout>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ApiKeyField
              hasKey={savedKeyApplies}
              last4={chatbot.ai.apiKeyLast4}
              mode={savedKeyApplies ? keyMode : keyMode === 'remove' ? 'remove' : 'replace'}
              onModeChange={setKeyMode}
              value={newKey}
              onValueChange={(v) => {
                setNewKey(v);
                if (keyMode !== 'replace') setKeyMode('replace');
              }}
              error={errors.apiKey}
              placeholder={def.apiKeyRequired ? `Paste your ${def.name} API key` : 'Optional for this endpoint'}
              hint={
                !savedKeyApplies && !newKey.trim() && def.apiKeyRequired
                  ? `No ${def.name} key saved — the chatbot cannot answer until you add one.`
                  : 'Encrypted at rest (AES-256-GCM). It is never shown again or sent to the browser.'
              }
            />
            {def.allowCustomBaseUrl && (
              <Input
                label="Base URL"
                type="url"
                required={def.requiresBaseUrl}
                value={d.baseUrl}
                placeholder={def.defaultBaseUrl || 'https://my-endpoint.example.com/v1'}
                onChange={(e) => chat.patch({ baseUrl: e.target.value })}
                error={errors.baseUrl}
                hint={def.requiresBaseUrl ? 'The OpenAI-compatible root URL (the part before /chat/completions).' : `Optional — leave empty for ${def.defaultBaseUrl}. Useful for proxies and gateways.`}
              />
            )}
          </div>

          {def.supports.customHeaders && (
            <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Auth header name"
                  value={d.authHeader}
                  placeholder="Authorization"
                  onChange={(e) => chat.patch({ authHeader: e.target.value })}
                  error={errors.authHeader}
                  hint='Header that carries the API key, e.g. "Authorization" or "api-key".'
                />
                <Input
                  label="Auth value prefix"
                  value={d.authPrefix}
                  placeholder="Bearer "
                  onChange={(e) => chat.patch({ authPrefix: e.target.value })}
                  error={errors.authPrefix}
                  hint='Text before the key, e.g. "Bearer " (note the space). Leave empty to send the raw key.'
                />
              </div>
              <Field
                label="Extra headers"
                hint="Sent with every request to this endpoint. Values are stored encrypted and never shown again — when you change headers, re-enter every value."
              >
                <KeyValueEditor
                  rows={headerRows}
                  onChange={(rows) => {
                    setHeaderRows(rows);
                    setHeadersTouched(true);
                  }}
                  keyPlaceholder="Header name"
                  valuePlaceholder="Header value"
                  addLabel="Add header"
                  valueType="password"
                  max={20}
                  errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('header.')).map(([k, v]) => [Number(k.slice(7)), v]))}
                />
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-zinc-100 pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={<PlugZap size={15} />} onClick={testConnection} loading={testing}>
                Test connection
              </Button>
              {testResult ? null : chatDirty ? (
                <p className="text-xs text-zinc-500">Testing uses your unsaved changes; the result is not stored until you save and test again.</p>
              ) : (
                <LastTestLine lastTest={chatbot.ai.lastTest} />
              )}
            </div>
            {testResult && <TestResultView result={testResult.result} unsaved={testResult.unsaved} />}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Generation" description={`Only parameters ${def.name} accepts are shown.`} />
        <CardBody>
          <GenerationControls
            provider={def}
            value={d.generation}
            onChange={(p) => chat.patch({ generation: { ...d.generation, ...p } })}
            refusalFallback={d.refusalFallback}
            onRefusalFallbackChange={(v) => chat.patch({ refusalFallback: v })}
            modelMaxOutput={selectedCatalogModel?.maxOutputTokens}
            errors={errors}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<CircleDollarSign size={16} />}
          title="Pricing & context window (optional)"
          description="Used for cost estimates in analytics and for trimming long conversations. Leave empty to use catalog values."
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-zinc-600">
            {catalogPricing ? (
              <>
                Catalog price for <span className="font-mono">{d.model}</span>: ${catalogPricing.inputPerMillion} input / ${catalogPricing.outputPerMillion} output per 1M
                tokens <span className="text-zinc-400">({catalogPricing.source})</span>.
              </>
            ) : (
              <>No verified pricing is known for this model, so costs show as “—” unless you enter your contract prices below.</>
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput
              label="Input price (USD / 1M tokens)"
              min={0}
              max={10000}
              step="any"
              value={d.pricing.inputPerMillion}
              onValueChange={(v) => chat.patch({ pricing: { ...d.pricing, inputPerMillion: v } })}
              error={errors['pricing.inputPerMillion']}
              placeholder={catalogPricing ? String(catalogPricing.inputPerMillion) : 'Not set'}
            />
            <NumberInput
              label="Output price (USD / 1M tokens)"
              min={0}
              max={10000}
              step="any"
              value={d.pricing.outputPerMillion}
              onValueChange={(v) => chat.patch({ pricing: { ...d.pricing, outputPerMillion: v } })}
              error={errors['pricing.outputPerMillion']}
              placeholder={catalogPricing ? String(catalogPricing.outputPerMillion) : 'Not set'}
            />
            <NumberInput
              label="Context window (tokens)"
              min={1024}
              max={10000000}
              step={1}
              value={d.contextWindow}
              onValueChange={(v) => chat.patch({ contextWindow: v === null ? null : Math.round(v) })}
              error={errors.contextWindow}
              placeholder={effectiveContext ? String(effectiveContext) : 'Auto'}
            />
          </div>
        </CardBody>
      </Card>

      <EmbeddingSection
        chatbot={chatbot}
        draft={emb.draft}
        patch={emb.patch}
        chatProvider={d.provider}
        embeddingProviders={embeddingProviders}
        providersById={byId}
        keyMode={embKeyMode}
        onKeyModeChange={setEmbKeyMode}
        newKey={newEmbKey}
        onNewKeyChange={(v) => {
          setNewEmbKey(v);
          if (v && embKeyMode !== 'replace') setEmbKeyMode('replace');
        }}
        errors={errors}
        buildOverride={() => {
          const u = buildChatUpdate();
          const e = buildEmbeddingUpdate();
          return e ? { ...u, embedding: e } : u;
        }}
        dirty={dirty}
      />

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => resetLocal(chatbot)} />
    </div>
  );
}
