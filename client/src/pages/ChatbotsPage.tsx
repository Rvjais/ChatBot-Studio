import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bot, LayoutGrid, List, Plus } from 'lucide-react';
import { ChatbotCard, ChatbotRow } from '../components/chatbots/ChatbotCard';
import { DeleteChatbotDialog, DuplicateChatbotModal } from '../components/chatbots/ChatbotDialogs';
import { CreateChatbotModal } from '../components/chatbots/CreateChatbotModal';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  SkeletonCards,
  SkeletonRows,
  TBody,
  TH,
  THead,
  Table,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useProviders } from '../hooks/useProviders';
import { chatbotsApi } from '../services/chatbots';
import type { Chatbot, ChatbotListQuery, ChatbotStatus, ProviderId } from '../types/api';
import { cn } from '../utils/cn';

const PAGE_SIZE = 24;

export function ChatbotsPage() {
  useDocumentTitle('My chatbots');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const status = (params.get('status') as ChatbotStatus | null) ?? '';
  const provider = (params.get('provider') as ProviderId | null) ?? '';
  const sort = (params.get('sort') as ChatbotListQuery['sort']) ?? 'updated';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('chatbots-view') as 'grid' | 'list') || 'grid');
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [duplicating, setDuplicating] = useState<Chatbot | null>(null);
  const [deleting, setDeleting] = useState<Chatbot | null>(null);
  const { providers } = useProviders();

  const query = useMemo<ChatbotListQuery>(
    () => ({ q: q || undefined, status: status || undefined, provider: provider || undefined, sort, page, limit: PAGE_SIZE }),
    [q, status, provider, sort, page],
  );
  const list = useAsync(() => chatbotsApi.list(query), [query]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  // Keep ?q in the URL in sync with the debounced search.
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) setParam('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const replaceItem = (updated: Chatbot) =>
    list.setData((prev) => (prev ? { ...prev, items: prev.items.map((c) => (c.id === updated.id ? { ...updated, stats: c.stats } : c)) } : prev!));

  const filtersActive = Boolean(q || status || provider);
  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="My chatbots"
        description="Create, configure and manage every chatbot in your workspace."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            New chatbot
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search chatbots" className="w-full sm:w-72" />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          containerClassName="w-[calc(50%-4px)] sm:w-36"
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <Select
          aria-label="Filter by provider"
          value={provider}
          onChange={(e) => setParam('provider', e.target.value)}
          containerClassName="w-[calc(50%-4px)] sm:w-44"
          options={[{ value: '', label: 'All providers' }, ...providers.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <Select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setParam('sort', e.target.value === 'updated' ? '' : e.target.value)}
          containerClassName="w-[calc(50%-4px)] sm:w-44"
          options={[
            { value: 'updated', label: 'Recently updated' },
            { value: 'created', label: 'Newest first' },
            { value: 'name', label: 'Name (A–Z)' },
          ]}
        />
        <div className="ml-auto">
          <SegmentedControl
            aria-label="Layout"
            value={view}
            onChange={(v) => {
              setView(v);
              localStorage.setItem('chatbots-view', v);
            }}
            options={[
              { value: 'grid', label: <LayoutGrid size={15} aria-label="Grid view" /> },
              { value: 'list', label: <List size={15} aria-label="List view" /> },
            ]}
          />
        </div>
      </div>

      {list.loading ? (
        view === 'grid' ? (
          <SkeletonCards />
        ) : (
          <Card className="p-5">
            <SkeletonRows rows={6} />
          </Card>
        )
      ) : list.error && !list.data ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.reload} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          {filtersActive ? (
            <EmptyState
              icon={<Bot size={22} />}
              title="No chatbots match your filters"
              description="Try a different search term or clear the filters."
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Bot size={22} />}
              title="Create your first chatbot"
              description="Pick an AI provider, add your instructions and knowledge, then embed it on any website with one script tag."
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                  New chatbot
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className={cn('transition-opacity', list.refreshing && 'opacity-60')}>
          {view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => (
                <ChatbotCard key={c.id} chatbot={c} onChange={replaceItem} onDuplicate={setDuplicating} onDelete={setDeleting} />
              ))}
            </div>
          ) : (
            <Card>
              <Table minWidth={900}>
                <THead>
                  <tr>
                    <TH>Chatbot</TH>
                    <TH>Provider / model</TH>
                    <TH>Connection</TH>
                    <TH>Conversations</TH>
                    <TH>Files / products</TH>
                    <TH>Status</TH>
                    <TH>Updated</TH>
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((c) => (
                    <ChatbotRow key={c.id} chatbot={c} onChange={replaceItem} onDuplicate={setDuplicating} onDelete={setDeleting} />
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          <Pagination
            className="mt-5"
            page={page}
            limit={PAGE_SIZE}
            total={list.data?.total ?? 0}
            itemLabel="chatbots"
            onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
          />
        </div>
      )}

      {createOpen && (
        <CreateChatbotModal
          open
          onClose={() => {
            setCreateOpen(false);
            if (params.get('new')) setParam('new', '');
          }}
        />
      )}
      {duplicating && (
        <DuplicateChatbotModal
          open
          chatbot={duplicating}
          onClose={() => setDuplicating(null)}
          onDuplicated={() => void list.reload()}
        />
      )}
      {deleting && <DeleteChatbotDialog open chatbot={deleting} onClose={() => setDeleting(null)} onDeleted={() => void list.reload()} />}
    </div>
  );
}
