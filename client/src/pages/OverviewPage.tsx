import { Link, useNavigate } from 'react-router';
import { ArrowRight, Bot, BookOpen, CircleCheck, CircleX, CodeXml, KeyRound, MessageCircle, MessagesSquare, Plus, Power, Sigma } from 'lucide-react';
import { UsageTable } from '../components/analytics/UsageTable';
import { ChartCard, TokenSplitBar } from '../components/charts/ChartCard';
import { ProviderMonogram } from '../components/workspace/ai/ProviderPicker';
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { providerLabel } from '../hooks/useProviders';
import { analyticsApi } from '../services/conversations';
import { useAuthStore } from '../stores/auth';
import type { OverviewAnalytics } from '../types/api';
import { cn } from '../utils/cn';
import { formatCompact, formatCost, formatNumber, formatRelative, pluralize } from '../utils/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ProviderStatusCard({ rows }: { rows: OverviewAnalytics['providerStatus'] }) {
  return (
    <Card>
      <CardHeader
        icon={<KeyRound size={16} />}
        title="AI provider status"
        description="Credentials and last connection test per chatbot."
        actions={
          <Link to="/api-config" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Manage
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">No chatbots yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.slice(0, 8).map((r) => (
            <li key={r.chatbotId} className="flex items-center gap-3 px-5 py-3">
              <ProviderMonogram id={r.provider} size={30} />
              <div className="min-w-0 flex-1">
                <Link to={`/chatbots/${r.chatbotId}/ai`} className="block truncate text-sm font-medium text-zinc-900 hover:text-brand-700">
                  {r.name}
                </Link>
                <p className="truncate text-xs text-zinc-500">
                  {providerLabel(r.provider)} · <span className="font-mono">{r.model}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {r.configured ? <Badge tone="green" dot>Key set</Badge> : <Badge tone="amber" dot>No key</Badge>}
                {r.lastTest === 'success' ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                    <CircleCheck size={11} /> Test passed
                  </span>
                ) : r.lastTest === 'failed' ? (
                  <span className="flex items-center gap-1 text-[11px] text-red-600">
                    <CircleX size={11} /> Test failed
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400">Not tested</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && (
        <div className="border-t border-zinc-100 px-5 py-2.5 text-xs text-zinc-500">
          +{rows.length - 8} more — <Link to="/api-config" className="text-brand-600 hover:underline">see all</Link>
        </div>
      )}
    </Card>
  );
}

function RecentActivityCard({ rows }: { rows: OverviewAnalytics['recentActivity'] }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader
        icon={<MessagesSquare size={16} />}
        title="Recent activity"
        actions={
          <Link to="/conversations" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">No conversations yet. Try “Test chat” in a chatbot workspace.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => navigate(`/conversations?open=${r.id}`)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-zinc-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                  <MessageCircle size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900">{r.chatbotName}</span>
                    {r.channel === 'preview' && <Badge tone="gray">Test</Badge>}
                  </span>
                  <span className="block truncate text-sm text-zinc-500">{r.preview || 'No messages'}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-zinc-400">
                  {formatRelative(r.lastMessageAt)}
                  <span className="block">{pluralize(r.messageCount, 'msg')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GettingStarted() {
  const steps = [
    { icon: Bot, title: 'Create a chatbot', text: 'Pick a provider and model and paste your API key.' },
    { icon: BookOpen, title: 'Add knowledge', text: 'Upload documents, FAQs or a product catalog.' },
    { icon: CodeXml, title: 'Embed it', text: 'Copy one script tag into any website.' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr]">
        <div className="p-8">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Build your first AI chatbot</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
            Each chatbot has its own instructions, AI model, knowledge base, products and look — and works on any website.
          </p>
          <Link
            to="/chatbots?new=1"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Plus size={16} /> Create a chatbot
          </Link>
        </div>
        <ol className="space-y-4 border-t border-zinc-100 bg-zinc-50/70 p-8 lg:border-t-0 lg:border-l">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-zinc-200">
                <Icon size={16} />
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-zinc-500">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

export function OverviewPage() {
  useDocumentTitle('Overview');
  const user = useAuthStore((s) => s.user);
  const state = useAsync(() => analyticsApi.overview(), []);
  const o = state.data;

  return (
    <div>
      <PageHeader
        title={`${greeting()}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Here's how your chatbots are doing."
        actions={
          <Link to="/chatbots?new=1" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            <Plus size={16} /> New chatbot
          </Link>
        }
      />

      {state.loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : !o ? (
        <Card>
          <ErrorState error={state.error} onRetry={state.reload} />
        </Card>
      ) : (
        <div className={cn('space-y-6 transition-opacity', state.refreshing && 'opacity-60')}>
          {o.totals.chatbots === 0 && <GettingStarted />}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Chatbots" value={formatNumber(o.totals.chatbots)} icon={<Bot size={16} />} />
            <StatCard
              label="Active chatbots"
              value={formatNumber(o.totals.activeChatbots)}
              hint={o.totals.chatbots ? `${o.totals.chatbots - o.totals.activeChatbots} inactive` : undefined}
              icon={<Power size={16} />}
            />
            <StatCard label="Conversations" value={formatCompact(o.totals.conversations)} hint="Website widget, all time" icon={<MessagesSquare size={16} />} />
            <StatCard label="Messages" value={formatCompact(o.totals.messages)} hint="Visitor + assistant" icon={<MessageCircle size={16} />} />
            <StatCard
              label="Configured providers"
              value={`${formatNumber(o.totals.configuredChatbots)} / ${formatNumber(o.totals.chatbots)}`}
              hint="Chatbots with credentials"
              icon={<KeyRound size={16} />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ChartCard
              title="Conversations per day"
              description="New website conversations over the last 14 days."
              seriesLabel="Conversations"
              data={o.dailyConversations.map((d) => ({ key: d.date, value: d.count }))}
              height={220}
              emptyMessage="No conversations in the last 14 days"
            />
            <RecentActivityCard rows={o.recentActivity} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ProviderStatusCard rows={o.providerStatus} />
            <Card>
              <CardHeader
                icon={<Sigma size={16} />}
                title="Token usage · last 30 days"
                description="All chatbots, including dashboard test chats."
                actions={
                  <Link to="/analytics" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                    Analytics <ArrowRight size={14} />
                  </Link>
                }
              />
              <CardBody className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-zinc-500">Input tokens</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCompact(o.usageLast30Days.inputTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Output tokens</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCompact(o.usageLast30Days.outputTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Estimated cost</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">
                      {o.usageLast30Days.costUsd === null ? <span className="text-base font-medium text-zinc-500">No pricing data</span> : formatCost(o.usageLast30Days.costUsd)}
                    </p>
                  </div>
                </div>
                <TokenSplitBar input={o.usageLast30Days.inputTokens} output={o.usageLast30Days.outputTokens} />
                {o.usageLast30Days.messagesWithoutCost > 0 && (
                  <p className="text-xs text-zinc-500">
                    {pluralize(o.usageLast30Days.messagesWithoutCost, 'answer')} had no pricing data and {o.usageLast30Days.messagesWithoutCost === 1 ? 'is' : 'are'} excluded
                    from the cost.
                  </p>
                )}
              </CardBody>
              {o.usageLast30Days.byModel.length > 0 && (
                <div className="border-t border-zinc-100">
                  <UsageTable rows={o.usageLast30Days.byModel} compact />
                </div>
              )}
            </Card>
          </div>

          {o.totals.chatbots > 0 && o.totals.conversations === 0 && (
            <Card>
              <EmptyState
                compact
                icon={<CodeXml size={22} />}
                title="Ready to go live?"
                description="Copy the embed code from a chatbot's Embed tab and paste it into your website to start receiving conversations."
                action={
                  <ButtonLink to={`/chatbots/${o.providerStatus[0]?.chatbotId}/embed`} icon={<CodeXml size={15} />}>
                    Get embed code
                  </ButtonLink>
                }
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
