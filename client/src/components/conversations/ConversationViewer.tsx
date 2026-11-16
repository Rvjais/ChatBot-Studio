import { Markdown } from '../ui/Markdown';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bot, CircleExclamationPoint, FileText, Globe, Package, Trash, TriangleExclamationPoint, User } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { providerLabel } from '../../hooks/useProviders';
import { conversationsApi } from '../../services/conversations';
import { toast } from '../../stores/toast';
import type { ConversationMessage } from '../../types/api';
import { formatCost, formatDateTime, formatMs, formatNumber, formatTime } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Drawer } from '../ui/Modal';
import { MetaItem } from '../ui/Misc';
import { SkeletonRows } from '../ui/Spinner';
import { ErrorState } from '../ui/States';

function AssistantMeta({ m }: { m: ConversationMessage }) {
  const meta = m.metadata;
  if (!meta) return null;
  const usage = m.tokenUsage;
  return (
    <div className="mt-1.5 max-w-[85%] space-y-1.5 text-[11px] text-zinc-500">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {meta.model && (
          <span>
            {providerLabel(meta.provider)} · <span className="font-mono">{meta.model}</span>
          </span>
        )}
        {usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined) && (
          <span className="tabular">
            {formatNumber(usage.inputTokens ?? 0)} in / {formatNumber(usage.outputTokens ?? 0)} out tokens
          </span>
        )}
        <span>{typeof meta.costUsd === 'number' ? formatCost(meta.costUsd) : 'No pricing data'}</span>
        {meta.latencyMs !== undefined && <span>{formatMs(meta.latencyMs)}</span>}
        {meta.finishReason && <span>finish: {meta.finishReason}</span>}
        {meta.streamed && <span>streamed</span>}
      </div>
      {meta.sources && meta.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FileText size={12} className="text-zinc-400" />
          {meta.sources.map((s) => (
            <span key={s.chunkId} className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
              {s.fileName ?? 'file'}
              {s.page ? ` p.${s.page}` : ''}
              {typeof s.score === 'number' ? ` · ${s.score.toFixed(2)}` : ''}
            </span>
          ))}
        </div>
      )}
      {(meta.productIds?.length || meta.browserProductIds?.length) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Package size={12} className="text-zinc-400" />
          {meta.productIds?.map((id) => (
            <Badge key={`v-${id}`} tone="green">
              {id}
            </Badge>
          ))}
          {meta.browserProductIds?.map((id) => (
            <Badge key={`p-${id}`} tone="amber" title="Page-provided (unverified)">
              {id} · page
            </Badge>
          ))}
        </div>
      )}
      {meta.priceCheck && !meta.priceCheck.passed && (
        <p className="text-amber-700">
          <TriangleExclamationPoint size={12} className="mr-1 inline align-[-2px]" />
          Price check: unverified amounts {meta.priceCheck.unverifiedAmounts.join(', ')}
        </p>
      )}
      {meta.error && (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700 ring-1 ring-red-100">
          <CircleExclamationPoint size={12} className="mr-1 inline align-[-2px]" />
          <span className="font-mono font-semibold">{meta.error.code}</span> — {meta.error.message}
        </p>
      )}
    </div>
  );
}

export function ConversationViewer({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted: (id: string) => void }) {
  const state = useAsync(() => (id ? conversationsApi.get(id) : Promise.resolve(null)), [id], { enabled: Boolean(id) });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const data = state.data;
  const c = data?.conversation;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width="lg"
      title={c ? c.chatbotName : 'Conversation'}
      description={c ? <span className="font-mono text-xs">{c.conversationId}</span> : undefined}
      actions={
        c && (
          <Button size="sm" variant="danger-ghost" icon={<Trash size={14} />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )
      }
    >
      {state.loading ? (
        <div className="p-5">
          <SkeletonRows rows={5} />
        </div>
      ) : state.error && !data ? (
        <ErrorState error={state.error} onRetry={state.reload} compact />
      ) : data && c ? (
        <div>
          <dl className="grid grid-cols-2 gap-4 border-b border-zinc-100 bg-zinc-50/60 px-5 py-4 sm:grid-cols-3">
            <MetaItem label="Chatbot">
              <Link to={`/chatbots/${c.chatbotId}`} className="text-brand-600 hover:underline">
                {c.chatbotName}
              </Link>
            </MetaItem>
            <MetaItem label="Visitor">
              <span className="font-mono text-xs">{c.visitorId}</span>
            </MetaItem>
            <MetaItem label="Channel">
              <Badge tone={c.channel === 'widget' ? 'brand' : 'gray'}>{c.channel === 'widget' ? 'Widget' : 'Dashboard test'}</Badge>
            </MetaItem>
            <MetaItem label="Started">{formatDateTime(c.createdAt)}</MetaItem>
            <MetaItem label="Last message">{formatDateTime(c.lastMessageAt)}</MetaItem>
            <MetaItem label="Messages">{formatNumber(c.messageCount)}</MetaItem>
            {(c.origin || c.pageUrl) && (
              <div className="col-span-2 min-w-0 sm:col-span-3">
                <MetaItem label="Page">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe size={13} className="shrink-0 text-zinc-400" />
                    <span className="truncate">{c.pageUrl ?? c.origin}</span>
                  </span>
                </MetaItem>
              </div>
            )}
          </dl>
          <div className="space-y-4 px-5 py-5">
            {data.messages.length === 0 && <p className="text-center text-sm text-zinc-500">No messages in this conversation.</p>}
            {data.messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <User size={11} /> Visitor · {formatTime(m.timestamp)}
                  </div>
                  <div className="chat-text mt-1 max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-sm text-white">{m.content}</div>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <Bot size={11} /> Assistant · {formatTime(m.timestamp)}
                  </div>
                  <div
                    className={
                      m.metadata?.error
                        ? 'mt-1 max-w-[85%] rounded-2xl rounded-bl-md bg-red-50 px-3.5 py-2.5 text-sm text-red-900 ring-1 ring-red-200'
                        : 'mt-1 max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-zinc-800 ring-1 ring-zinc-200'
                    }
                  >
                    <Markdown text={m.content} />
                  </div>
                  <AssistantMeta m={m} />
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete conversation?"
        confirmLabel="Delete conversation"
        description="The full message history is permanently removed. Analytics already counted are not affected."
        onConfirm={async () => {
          if (!id) return;
          await conversationsApi.remove(id);
          toast.success('Conversation deleted');
          onDeleted(id);
        }}
      />
    </Drawer>
  );
}
