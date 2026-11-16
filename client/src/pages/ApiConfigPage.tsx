import { useState } from 'react';
import { Link } from 'react-router';
import { Bot, Check, ExternalLink, Lock, PlugZap, Plus, Settings2, ShieldCheck, X } from 'lucide-react';
import { ProviderMonogram } from '../components/workspace/ai/ProviderPicker';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { providerLabel, useProviders } from '../hooks/useProviders';
import { chatbotsApi } from '../services/chatbots';
import { toast } from '../stores/toast';
import type { Chatbot, ProviderDefinition, TestProviderResult } from '../types/api';
import { getErrorMessage } from '../utils/errors';
import { formatMs, formatNumber, formatRelative } from '../utils/format';

function Supported({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {ok ? <Check size={13} className="text-emerald-600" /> : <X size={13} className="text-zinc-300" />}
      <span className={ok ? 'text-zinc-700' : 'text-zinc-400'}>{label}</span>
    </li>
  );
}

function ProviderCard({ p }: { p: ProviderDefinition }) {
  const s = p.supports;
  const range = (r: { min: number; max: number } | null) => (r ? ` (${r.min}–${r.max})` : '');
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-3">
        <ProviderMonogram id={p.id} size={36} />
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900">{p.name}</h3>
          <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{p.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 px-5 pb-4 text-xs">
        <ul className="space-y-1">
          <Supported ok={s.streaming} label="Streaming" />
          <Supported ok={s.embeddings} label="Embeddings" />
          <Supported ok={s.listModels} label="Live model list" />
          <Supported ok={p.allowCustomBaseUrl} label={p.requiresBaseUrl ? 'Base URL (required)' : 'Custom base URL'} />
        </ul>
        <ul className="space-y-1">
          <Supported ok={Boolean(s.temperature)} label={`Temperature${range(s.temperature)}`} />
          <Supported ok={Boolean(s.topP)} label="Top P" />
          <Supported ok={Boolean(s.frequencyPenalty)} label="Penalties" />
          {s.effort ? <Supported ok label={`Effort (${s.effort.length} levels)`} /> : <Supported ok={s.customHeaders} label="Custom headers" />}
        </ul>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 px-5 py-3 text-xs">
        <span className="text-zinc-500">Max output: {formatNumber(p.maxOutputTokensLimit)} tokens</span>
        <span className="ml-auto flex gap-3">
          {p.docsUrl && (
            <a href={p.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              Docs <ExternalLink size={11} />
            </a>
          )}
          {p.apiKeyUrl && (
            <a href={p.apiKeyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              API keys <ExternalLink size={11} />
            </a>
          )}
        </span>
      </div>
    </Card>
  );
}

function ChatbotRow({ c, onTested }: { c: Chatbot; onTested: (c: Chatbot) => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestProviderResult | null>(null);
  const configured = c.ai.hasApiKey || (c.ai.provider === 'custom' && Boolean(c.ai.baseUrl));
  const last = c.ai.lastTest;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await chatbotsApi.testProvider(c.id, 'chat');
      setResult(r);
      if (r.ok) toast.success(`${c.name}: connection successful`, `${r.message} (${formatMs(r.latencyMs)})`);
      else toast.error(`${c.name}: connection failed`, r.message);
      chatbotsApi.get(c.id).then(onTested).catch(() => undefined);
    } catch (err) {
      toast.error(`${c.name}: test failed`, getErrorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const status = result ? (result.ok ? 'success' : 'failed') : last?.status;

  return (
    <TR>
      <TD>
        <Link to={`/chatbots/${c.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
          {c.name}
        </Link>
        <p className="text-xs text-zinc-500">{c.status === 'active' ? 'Active' : 'Inactive'}</p>
      </TD>
      <TD>
        <div className="flex items-center gap-2">
          <ProviderMonogram id={c.ai.provider} size={24} />
          <div className="min-w-0">
            <p className="text-sm text-zinc-800">{providerLabel(c.ai.provider)}</p>
            <p className="max-w-[200px] truncate font-mono text-xs text-zinc-500">{c.ai.model}</p>
          </div>
        </div>
      </TD>
      <TD>
        {c.ai.hasApiKey ? (
          <Badge tone="green" dot>
            ••••{c.ai.apiKeyLast4}
          </Badge>
        ) : configured ? (
          <Badge tone="gray">No key (custom)</Badge>
        ) : (
          <Badge tone="amber" dot>
            Missing
          </Badge>
        )}
      </TD>
      <TD>
        {status ? (
          <Tooltip content={result?.message ?? last?.message ?? ''}>
            <Badge tone={status === 'success' ? 'green' : 'red'}>{status === 'success' ? 'Passed' : 'Failed'}</Badge>
          </Tooltip>
        ) : (
          <span className="text-xs text-zinc-400">Never tested</span>
        )}
        {!result && last && <p className="mt-0.5 text-[11px] text-zinc-400">{formatRelative(last.testedAt)}</p>}
        {result && <p className="mt-0.5 text-[11px] text-zinc-400">just now · {formatMs(result.latencyMs)}</p>}
      </TD>
      <TD className="text-xs text-zinc-600">{c.embedding.provider === 'none' ? 'Keyword only' : `${providerLabel(c.embedding.provider)} · ${c.embedding.model || '—'}`}</TD>
      <TD className="text-right whitespace-nowrap">
        <Button size="xs" icon={<PlugZap size={13} />} onClick={test} loading={testing}>
          Test
        </Button>{' '}
        <ButtonLink size="xs" variant="ghost" to={`/chatbots/${c.id}/ai`} icon={<Settings2 size={13} />}>
          Configure
        </ButtonLink>
      </TD>
    </TR>
  );
}

export function ApiConfigPage() {
  useDocumentTitle('API configuration');
  const chatbots = useAsync(() => chatbotsApi.list({ limit: 100, sort: 'name' }), []);
  const { providers, loading: providersLoading, error: providersError, reload: reloadProviders } = useProviders();
  const items = chatbots.data?.items ?? [];

  const replace = (updated: Chatbot) =>
    chatbots.setData((prev) => (prev ? { ...prev, items: prev.items.map((c) => (c.id === updated.id ? { ...updated, stats: c.stats } : c)) } : prev!));

  return (
    <div className="space-y-8">
      <PageHeader title="API configuration" description="AI provider credentials and connection health for every chatbot." className="mb-0" />

      <Card>
        <CardHeader title="Chatbot connections" description="Run a live test with each chatbot's saved credentials, or open its AI settings." />
        {chatbots.loading ? (
          <div className="p-5">
            <SkeletonRows rows={4} />
          </div>
        ) : chatbots.error && !chatbots.data ? (
          <ErrorState error={chatbots.error} onRetry={chatbots.reload} compact />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<Bot size={22} />}
            title="No chatbots yet"
            description="Create a chatbot and add your provider API key."
            action={
              <ButtonLink to="/chatbots?new=1" variant="primary" icon={<Plus size={15} />}>
                New chatbot
              </ButtonLink>
            }
          />
        ) : (
          <Table minWidth={900}>
            <THead>
              <tr>
                <TH>Chatbot</TH>
                <TH>Provider / model</TH>
                <TH>API key</TH>
                <TH>Last test</TH>
                <TH>Embeddings</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {items.map((c) => (
                <ChatbotRow key={c.id} c={c} onTested={replace} />
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-200">
            <ShieldCheck size={20} />
          </span>
          <div className="space-y-1.5 text-sm leading-relaxed text-zinc-700">
            <p className="font-semibold text-zinc-900">How your keys are protected</p>
            <ul className="space-y-1">
              <li className="flex gap-2">
                <Lock size={14} className="mt-1 shrink-0 text-emerald-600" /> Keys are encrypted at rest with AES-256-GCM, bound to their chatbot record.
              </li>
              <li className="flex gap-2">
                <Lock size={14} className="mt-1 shrink-0 text-emerald-600" /> They are never returned to the browser — the dashboard only ever sees the last four characters.
              </li>
              <li className="flex gap-2">
                <Lock size={14} className="mt-1 shrink-0 text-emerald-600" /> The embed code and public widget API contain only the public chatbot ID, never a key.
              </li>
            </ul>
          </div>
        </CardBody>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Supported providers</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Each chatbot can use any of these. Parameters a provider does not accept are hidden in its settings.</p>
        </div>
        {providersLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : providersError ? (
          <Card>
            <ErrorState error={providersError} onRetry={reloadProviders} compact />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((p) => (
              <ProviderCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
