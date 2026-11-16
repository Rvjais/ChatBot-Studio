import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bot, ChartColumn, CircleDollarSign, MessageCircle, MessagesSquare, Plus } from 'lucide-react';
import { ChatbotAnalyticsView } from '../components/analytics/ChatbotAnalyticsView';
import { UsageTable } from '../components/analytics/UsageTable';
import { ChartCard } from '../components/charts/ChartCard';
import { ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatCard } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { chatbotsApi } from '../services/chatbots';
import { analyticsApi } from '../services/conversations';
import { formatCompact, formatCost, formatNumber, pluralize } from '../utils/format';

export function AnalyticsPage() {
  useDocumentTitle('Analytics');
  const [params, setParams] = useSearchParams();
  const overview = useAsync(() => analyticsApi.overview(), []);
  const chatbots = useAsync(() => chatbotsApi.listAll(), []);
  const [selected, setSelected] = useState(params.get('chatbot') ?? '');

  useEffect(() => {
    if (!selected && chatbots.data?.length) setSelected(chatbots.data[0]!.id);
  }, [chatbots.data, selected]);

  const select = (id: string) => {
    setSelected(id);
    const next = new URLSearchParams(params);
    next.set('chatbot', id);
    setParams(next, { replace: true });
  };

  const o = overview.data;
  const noChatbots = chatbots.data && chatbots.data.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Usage across all chatbots, and detailed analytics per chatbot." className="mb-0" />

      {overview.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : !o ? (
        <Card>
          <ErrorState error={overview.error} onRetry={overview.reload} />
        </Card>
      ) : (
        <section className="space-y-6" aria-label="All chatbots">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Conversations" value={formatCompact(o.totals.conversations)} hint="All chatbots, all time" icon={<MessagesSquare size={16} />} />
            <StatCard label="Messages" value={formatCompact(o.totals.messages)} hint="All chatbots, all time" icon={<MessageCircle size={16} />} />
            <StatCard
              label="Tokens · 30 days"
              value={formatCompact(o.usageLast30Days.inputTokens + o.usageLast30Days.outputTokens)}
              hint={`${formatNumber(o.usageLast30Days.inputTokens)} in / ${formatNumber(o.usageLast30Days.outputTokens)} out`}
              icon={<ChartColumn size={16} />}
            />
            <StatCard
              label="Cost · 30 days"
              value={o.usageLast30Days.costUsd === null ? '—' : formatCost(o.usageLast30Days.costUsd)}
              hint={
                o.usageLast30Days.costUsd === null
                  ? 'No pricing data'
                  : o.usageLast30Days.messagesWithoutCost
                    ? `${pluralize(o.usageLast30Days.messagesWithoutCost, 'answer')} without pricing`
                    : 'All answers priced'
              }
              icon={<CircleDollarSign size={16} />}
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ChartCard
              title="Conversations per day · all chatbots"
              description="Last 14 days, website widget only."
              seriesLabel="Conversations"
              data={o.dailyConversations.map((d) => ({ key: d.date, value: d.count }))}
              emptyMessage="No conversations in the last 14 days"
            />
            <Card>
              <CardHeader title="Provider usage · last 30 days" description="Answers, tokens and cost by model across all chatbots." />
              <UsageTable rows={o.usageLast30Days.byModel} compact />
            </Card>
          </div>
        </section>
      )}

      <section className="space-y-4" aria-label="Per chatbot">
        <div className="border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Chatbot analytics</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Daily trends, top questions and model usage for one chatbot.</p>
        </div>
        {chatbots.loading ? (
          <Skeleton className="h-9 w-64" />
        ) : chatbots.error && !chatbots.data ? (
          <Card>
            <ErrorState error={chatbots.error} onRetry={chatbots.reload} compact />
          </Card>
        ) : noChatbots ? (
          <Card>
            <EmptyState
              icon={<Bot size={22} />}
              title="No chatbots yet"
              description="Create a chatbot to start collecting analytics."
              action={
                <ButtonLink to="/chatbots?new=1" variant="primary" icon={<Plus size={15} />}>
                  New chatbot
                </ButtonLink>
              }
            />
          </Card>
        ) : selected ? (
          <ChatbotAnalyticsView
            key={selected}
            chatbotId={selected}
            toolbar={
              <Select
                aria-label="Chatbot"
                value={selected}
                onChange={(e) => select(e.target.value)}
                containerClassName="w-full sm:w-64"
                options={(chatbots.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            }
          />
        ) : null}
      </section>
    </div>
  );
}
