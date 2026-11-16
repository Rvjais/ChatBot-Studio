import { useState, type ReactNode } from 'react';
import { CircleDollarSign, MessageCircle, MessagesSquare, Sigma, TrendingUp } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { chatbotsApi } from '../../services/chatbots';
import { cn } from '../../utils/cn';
import { formatCompact, formatCost, formatNumber, formatRelative, pluralize } from '../../utils/format';
import { ChartCard, TokenSplitBar } from '../charts/ChartCard';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatCard } from '../ui/Misc';
import { Skeleton } from '../ui/Spinner';
import { ErrorState } from '../ui/States';
import { SegmentedControl } from '../ui/Tabs';
import { UsageTable } from './UsageTable';

const RANGES = [7, 30, 90] as const;

/** Per-chatbot analytics (GET /api/analytics/chatbots/:id?days=). */
export function ChatbotAnalyticsView({ chatbotId, toolbar }: { chatbotId: string; toolbar?: ReactNode }) {
  const [days, setDays] = useState<number>(30);
  const state = useAsync(() => chatbotsApi.analytics(chatbotId, days), [chatbotId, days]);
  const a = state.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Date range"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={RANGES.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
        />
        {toolbar}
      </div>

      {state.loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : !a ? (
        <Card>
          <ErrorState error={state.error} onRetry={state.reload} />
        </Card>
      ) : (
        <div className={cn('space-y-6 transition-opacity', state.refreshing && 'opacity-50')}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Conversations" value={formatCompact(a.totals.conversations)} hint={`${formatNumber(a.totals.allTimeConversations)} all time`} icon={<MessagesSquare size={16} />} />
            <StatCard label="Messages" value={formatCompact(a.totals.messages)} hint={`${formatNumber(a.totals.allTimeMessages)} all time`} icon={<MessageCircle size={16} />} />
            <StatCard label="Messages per conversation" value={a.totals.avgMessagesPerConversation.toFixed(1)} hint="Visitor + assistant messages" icon={<TrendingUp size={16} />} />
            <StatCard
              label="Estimated cost"
              value={a.usage.costUsd === null ? '—' : formatCost(a.usage.costUsd)}
              hint={a.usage.costUsd === null ? 'No pricing data' : `${pluralize(a.usage.messagesWithCost, 'priced answer')}`}
              icon={<CircleDollarSign size={16} />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard
              title="Conversations per day"
              description="New website conversations (dashboard tests excluded)."
              seriesLabel="Conversations"
              data={a.dailyConversations.map((d) => ({ key: d.date, value: d.count }))}
              emptyMessage="No conversations in this period"
            />
            <ChartCard
              title="Visitor messages per day"
              description="Questions sent by website visitors."
              seriesLabel="Visitor messages"
              data={a.dailyMessages.map((d) => ({ key: d.date, value: d.count }))}
              emptyMessage="No messages in this period"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Top questions" description="Most frequently asked (exact match, case-insensitive)." />
              <CardBody className="p-0">
                {a.topQuestions.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-zinc-500">No visitor questions in this period yet.</p>
                ) : (
                  <ol className="divide-y divide-zinc-100">
                    {a.topQuestions.map((q, i) => (
                      <li key={`${q.question}-${i}`} className="flex items-start gap-3 px-5 py-3">
                        <span className="tabular mt-0.5 w-5 shrink-0 text-xs font-medium text-zinc-400">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm break-words text-zinc-800">{q.question}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">Last asked {formatRelative(q.lastAsked)}</p>
                        </div>
                        <span className="tabular shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">×{formatNumber(q.count)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Sigma size={16} />} title="Token usage" description="Includes dashboard test chats — providers bill those too." />
              <CardBody className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-zinc-500">Input tokens</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCompact(a.usage.inputTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Output tokens</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCompact(a.usage.outputTokens)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Cost (USD)</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900">{a.usage.costUsd === null ? '—' : formatCost(a.usage.costUsd)}</p>
                  </div>
                </div>
                <TokenSplitBar input={a.usage.inputTokens} output={a.usage.outputTokens} />
                <p className="text-xs leading-relaxed text-zinc-500">
                  {a.usage.costUsd === null
                    ? 'No pricing data: costs are only shown for models with known prices. Add a pricing override in AI Settings to track spend.'
                    : `${pluralize(a.usage.messagesWithCost, 'answer')} priced.`}
                  {a.usage.messagesWithoutCost > 0 && ` ${pluralize(a.usage.messagesWithoutCost, 'answer')} had no pricing data and ${a.usage.messagesWithoutCost === 1 ? 'is' : 'are'} not included in the cost.`}
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="AI provider usage" description={`Answers generated in the last ${days} days, by provider and model.`} />
            <UsageTable rows={a.providerUsage} />
          </Card>
        </div>
      )}
    </div>
  );
}
