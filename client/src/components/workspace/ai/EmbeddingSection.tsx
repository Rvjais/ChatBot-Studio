import { useMemo, useState } from 'react';
import { Database, FlaskConical, RefreshCw } from 'lucide-react';
import { useCatalogModels } from '../../../hooks/useProviders';
import { chatbotsApi } from '../../../services/chatbots';
import { knowledgeApi } from '../../../services/knowledge';
import { toast } from '../../../stores/toast';
import type {
  AiConfigUpdate,
  Chatbot,
  EmbeddingProviderId,
  EmbeddingProviderSetting,
  ProviderDefinition,
  ProviderId,
  TestProviderResult,
} from '../../../types/api';
import { getErrorMessage } from '../../../utils/errors';
import { pluralize } from '../../../utils/format';
import { ModelCombobox } from '../../chatbots/ModelCombobox';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Input, NumberInput, Select } from '../../ui/Field';
import { Callout } from '../../ui/States';
import { Switch } from '../../ui/Switch';
import { ApiKeyField, type KeyMode } from './ApiKeyField';
import { TestResultView } from './TestResult';

export interface EmbeddingDraft {
  provider: EmbeddingProviderSetting;
  model: string;
  useChatCredentials: boolean;
  baseUrl: string;
  dimensions: number | null;
}

export function EmbeddingSection({
  chatbot,
  draft,
  patch,
  chatProvider,
  embeddingProviders,
  providersById,
  keyMode,
  onKeyModeChange,
  newKey,
  onNewKeyChange,
  errors,
  buildOverride,
  dirty,
}: {
  chatbot: Chatbot;
  draft: EmbeddingDraft;
  patch: (p: Partial<EmbeddingDraft>) => void;
  chatProvider: ProviderId;
  embeddingProviders: { id: EmbeddingProviderId; name: string }[];
  providersById: Map<ProviderId, ProviderDefinition>;
  keyMode: KeyMode;
  onKeyModeChange: (m: KeyMode) => void;
  newKey: string;
  onNewKeyChange: (v: string) => void;
  errors: Record<string, string>;
  buildOverride: () => AiConfigUpdate;
  dirty: boolean;
}) {
  const enabled = draft.provider !== 'none';
  const sameAsChat = enabled && draft.provider === chatProvider;
  const usesChatCredentials = sameAsChat && draft.useChatCredentials;
  const def = enabled ? providersById.get(draft.provider as ProviderId) : undefined;
  const catalog = useCatalogModels(enabled ? (draft.provider as ProviderId) : undefined, 'embedding');
  const options = useMemo(() => (catalog.data ?? []).map((m) => ({ ...m, origin: 'catalog' as const })), [catalog.data]);
  const selectedModel = catalog.data?.find((m) => m.id === draft.model);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestProviderResult | null>(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const fileCount = chatbot.stats?.knowledgeFiles ?? 0;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await chatbotsApi.testProvider(chatbot.id, 'embedding', dirty ? buildOverride() : undefined));
    } catch (err) {
      setResult({ ok: false, latencyMs: 0, message: getErrorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Database size={16} />}
        title="Embeddings (semantic search)"
        description="Embeddings let the bot find relevant knowledge by meaning, not just keywords. Without them, retrieval uses keyword search only."
      />
      <CardBody className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Embedding provider"
            value={draft.provider}
            onChange={(e) => {
              const provider = e.target.value as EmbeddingProviderSetting;
              patch({ provider, model: '', baseUrl: '', dimensions: null, useChatCredentials: provider === chatProvider });
              onNewKeyChange('');
              onKeyModeChange('keep');
              setResult(null);
            }}
            error={errors['embedding.provider']}
          >
            <option value="none">None — keyword search only</option>
            {embeddingProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {enabled && (
            <ModelCombobox
              label="Embedding model"
              value={draft.model}
              onChange={(model) => patch({ model })}
              options={options}
              loading={catalog.loading}
              placeholder="e.g. text-embedding-3-small"
              error={errors['embedding.model']}
              hint={selectedModel?.dimensions ? `Default output: ${selectedModel.dimensions} dimensions.` : undefined}
            />
          )}
        </div>

        {enabled && (
          <>
            {sameAsChat ? (
              <Switch
                checked={draft.useChatCredentials}
                onChange={(v) => patch({ useChatCredentials: v })}
                label="Use the chat provider's credentials"
                description={`Reuses the ${def?.name ?? ''} API key and base URL configured above.`}
              />
            ) : (
              <Callout tone="neutral">
                The embedding provider differs from the chat provider ({providersById.get(chatProvider)?.name ?? chatProvider}), so it needs its own API key.
              </Callout>
            )}

            {!usesChatCredentials && (
              <div className="grid gap-4 md:grid-cols-2">
                <ApiKeyField
                  label="Embedding API key"
                  hasKey={chatbot.embedding.hasApiKey && chatbot.embedding.provider === draft.provider}
                  last4={chatbot.embedding.apiKeyLast4}
                  mode={keyMode}
                  onModeChange={onKeyModeChange}
                  value={newKey}
                  onValueChange={onNewKeyChange}
                  error={errors['embedding.apiKey']}
                  hint={
                    def?.apiKeyUrl ? (
                      <a className="text-brand-600 hover:underline" href={def.apiKeyUrl} target="_blank" rel="noreferrer">
                        Get an API key from {def.name}
                      </a>
                    ) : undefined
                  }
                />
                {(def?.allowCustomBaseUrl || draft.provider === 'custom') && (
                  <Input
                    label="Embedding base URL"
                    type="url"
                    required={draft.provider === 'custom'}
                    value={draft.baseUrl}
                    placeholder={def?.defaultBaseUrl || 'https://my-endpoint.example.com/v1'}
                    onChange={(e) => patch({ baseUrl: e.target.value })}
                    error={errors['embedding.baseUrl']}
                    hint={draft.provider === 'custom' ? 'Required for a custom OpenAI-compatible endpoint.' : 'Leave empty to use the default endpoint.'}
                  />
                )}
              </div>
            )}

            <NumberInput
              label="Dimensions (optional)"
              min={8}
              max={8192}
              step={1}
              value={draft.dimensions}
              onValueChange={(v) => patch({ dimensions: v === null ? null : Math.round(v) })}
              error={errors['embedding.dimensions']}
              containerClassName="max-w-xs"
              hint="Only for models that support shortened vectors. Leave empty for the model default."
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<FlaskConical size={15} />} onClick={test} loading={testing} disabled={!draft.model.trim()}>
                Test embeddings
              </Button>
              {!draft.model.trim() && <span className="text-xs text-zinc-500">Choose an embedding model first.</span>}
            </div>
            {result && <TestResultView result={result} unsaved={dirty} />}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
          <p className="max-w-xl text-sm leading-relaxed text-amber-900">
            Changing the embedding provider, model or dimensions makes existing vectors incompatible. After saving, re-process the knowledge base so
            every chunk is embedded with the new model.
          </p>
          <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => setReprocessOpen(true)} disabled={fileCount === 0}>
            Re-process all knowledge
          </Button>
        </div>
      </CardBody>

      <ConfirmDialog
        open={reprocessOpen}
        onClose={() => setReprocessOpen(false)}
        tone="primary"
        title="Re-process all knowledge?"
        confirmLabel="Re-process"
        description={
          <>
            All {pluralize(fileCount, 'file')} will be extracted, chunked and embedded again with the <strong>saved</strong> embedding settings. Answers keep
            working during processing, using keyword search for files that are not finished yet.
            {dirty && <span className="mt-2 block font-medium text-amber-700">You have unsaved changes — save them first if they should apply.</span>}
          </>
        }
        onConfirm={async () => {
          const queued = await knowledgeApi.reprocessAll(chatbot.id);
          toast.success('Re-processing started', `${pluralize(queued, 'file')} queued.`);
        }}
      />
    </Card>
  );
}
