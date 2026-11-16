import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Eye, MessagesSquare, Trash } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebounce';
import { chatbotsApi } from '../../services/chatbots';
import { conversationsApi } from '../../services/conversations';
import { toast } from '../../stores/toast';
import type { Channel, ConversationSummary } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatDateTime, formatNumber, formatRelative } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Select } from '../ui/Field';
import { SearchInput } from '../ui/Misc';
import { Pagination } from '../ui/Pagination';
import { SkeletonRows } from '../ui/Spinner';
import { EmptyState, ErrorState } from '../ui/States';
import { TBody, TD, TH, THead, TR, Table } from '../ui/Table';
import { ConversationViewer } from './ConversationViewer';

const PAGE_SIZE = 20;

/** Conversation list + viewer. With `chatbotId` it is scoped to one chatbot (workspace tab). */
export function ConversationList({ chatbotId: fixedChatbotId }: { chatbotId?: string }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const [chatbotId, setChatbotId] = useState(fixedChatbotId ?? params.get('chatbot') ?? '');
  const [channel, setChannel] = useState<Channel | ''>((params.get('channel') as Channel) ?? '');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const openId = params.get('open');

  const chatbots = useAsync(() => (fixedChatbotId ? Promise.resolve([]) : chatbotsApi.listAll()), [fixedChatbotId]);
  const query = useMemo(
    () => ({ chatbotId: fixedChatbotId ?? (chatbotId || undefined), q: q || undefined, channel: channel || undefined, page, limit: PAGE_SIZE }),
    [fixedChatbotId, chatbotId, q, channel, page],
  );
  const list = useAsync(() => conversationsApi.list(query), [query]);
  useEffect(() => setPage(1), [q, chatbotId, channel]);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: !id });
  };

  const removeLocal = (id: string) => {
    list.setData((prev) => (prev ? { ...prev, items: prev.items.filter((c) => c.id !== id), total: Math.max(0, prev.total - 1) } : prev!));
    void list.reload();
  };

  const items = list.data?.items ?? [];
  const filtered = Boolean(q || (!fixedChatbotId && chatbotId) || channel);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search messages, visitor or conversation ID" className="w-full sm:w-80" />
        {!fixedChatbotId && (
          <Select
            aria-label="Filter by chatbot"
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            containerClassName="w-full sm:w-56"
            options={[{ value: '', label: 'All chatbots' }, ...(chatbots.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
        <Select
          aria-label="Filter by channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel | '')}
          containerClassName="w-full sm:w-44"
          options={[
            { value: '', label: 'All channels' },
            { value: 'widget', label: 'Website widget' },
            { value: 'preview', label: 'Dashboard tests' },
          ]}
        />
      </div>

      <Card>
        {list.loading ? (
          <div className="p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title={filtered ? 'No conversations match' : 'No conversations yet'}
            description={
              filtered
                ? 'Try a different search or filter.'
                : 'Conversations appear here when visitors chat with your widget or when you use “Test chat” in a chatbot workspace.'
            }
            action={
              filtered ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    if (!fixedChatbotId) setChatbotId('');
                    setChannel('');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn('transition-opacity', list.refreshing && 'opacity-60')}>
            <Table minWidth={fixedChatbotId ? 760 : 900}>
              <THead>
                <tr>
                  {!fixedChatbotId && <TH>Chatbot</TH>}
                  <TH>Visitor</TH>
                  <TH>Preview</TH>
                  <TH className="text-right">Messages</TH>
                  <TH>Started</TH>
                  <TH>Last message</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {items.map((c) => (
                  <TR key={c.id} interactive onClick={() => setOpen(c.id)}>
                    {!fixedChatbotId && <TD className="max-w-[160px] truncate font-medium text-zinc-900">{c.chatbotName}</TD>}
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="max-w-[130px] truncate font-mono text-xs text-zinc-600" title={c.visitorId}>
                          {c.visitorId}
                        </span>
                        {c.channel === 'preview' && <Badge tone="gray">Test</Badge>}
                      </div>
                    </TD>
                    <TD className="max-w-[280px]">
                      <p className="truncate text-zinc-700" title={c.preview}>
                        {c.preview || <span className="text-zinc-400">—</span>}
                      </p>
                    </TD>
                    <TD className="tabular text-right">{formatNumber(c.messageCount)}</TD>
                    <TD className="text-xs whitespace-nowrap text-zinc-500">{formatDateTime(c.createdAt)}</TD>
                    <TD className="text-xs whitespace-nowrap text-zinc-500" title={formatDateTime(c.lastMessageAt)}>
                      {formatRelative(c.lastMessageAt)}
                    </TD>
                    <TD className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button size="xs" variant="ghost" iconOnly aria-label="Open conversation" title="Open" onClick={() => setOpen(c.id)}>
                        <Eye size={15} />
                      </Button>
                      <Button size="xs" variant="danger-ghost" iconOnly aria-label="Delete conversation" title="Delete" onClick={() => setDeleting(c)}>
                        <Trash size={15} />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-zinc-100 px-5 py-3">
              <Pagination page={page} limit={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} itemLabel="conversations" />
            </div>
          </div>
        )}
      </Card>

      <ConversationViewer
        id={openId}
        onClose={() => setOpen(null)}
        onDeleted={(id) => {
          setOpen(null);
          removeLocal(id);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete conversation?"
        confirmLabel="Delete conversation"
        description={
          <>
            The conversation with visitor <span className="font-mono text-xs">{deleting?.visitorId}</span> ({formatNumber(deleting?.messageCount ?? 0)} messages) will be
            permanently deleted.
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          await conversationsApi.remove(deleting.id);
          toast.success('Conversation deleted');
          removeLocal(deleting.id);
        }}
      />
    </>
  );
}
