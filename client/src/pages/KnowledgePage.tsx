import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, ExternalLink, RefreshCw, TriangleExclamationPoint } from 'lucide-react';
import { FileStatusBadge, fileTypeLabel } from '../components/knowledge/FileStatusBadge';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
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
import { chatbotsApi } from '../services/chatbots';
import { knowledgeApi } from '../services/knowledge';
import type { ProcessingStatus } from '../types/api';
import { cn } from '../utils/cn';
import { formatBytes, formatDate, formatNumber } from '../utils/format';

const PAGE_SIZE = 25;

export function KnowledgePage() {
  useDocumentTitle('Knowledge base');
  const [chatbotId, setChatbotId] = useState('');
  const [status, setStatus] = useState<ProcessingStatus | ''>('');
  const [page, setPage] = useState(1);
  const chatbots = useAsync(() => chatbotsApi.listAll(), []);
  const query = useMemo(() => ({ chatbotId: chatbotId || undefined, status: status || undefined, page, limit: PAGE_SIZE }), [chatbotId, status, page]);
  const list = useAsync(() => knowledgeApi.listAll(query), [query]);
  useEffect(() => setPage(1), [chatbotId, status]);

  const items = list.data?.items ?? [];
  const active = items.some((f) => f.processingStatus === 'pending' || f.processingStatus === 'processing');

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      knowledgeApi
        .listAll(query)
        .then((d) => list.setData(d))
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, query]);

  const filtered = Boolean(chatbotId || status);

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="All knowledge files across your chatbots. Each chatbot only ever searches its own files."
        actions={
          <Button icon={<RefreshCw size={15} />} onClick={() => void list.reload()} loading={list.refreshing}>
            Refresh
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          aria-label="Filter by chatbot"
          value={chatbotId}
          onChange={(e) => setChatbotId(e.target.value)}
          containerClassName="w-full sm:w-60"
          options={[{ value: '', label: 'All chatbots' }, ...(chatbots.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProcessingStatus | '')}
          containerClassName="w-full sm:w-44"
          options={[
            { value: '', label: 'All statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' },
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
            icon={<BookOpen size={22} />}
            title={filtered ? 'No files match these filters' : 'No knowledge files yet'}
            description={
              filtered ? 'Try another chatbot or status.' : "Open a chatbot's Knowledge Base tab to upload documents or add text entries."
            }
            action={
              filtered ? (
                <Button
                  onClick={() => {
                    setChatbotId('');
                    setStatus('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <ButtonLink to="/chatbots" variant="primary">
                  Go to my chatbots
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className={cn('transition-opacity', list.refreshing && 'opacity-60')}>
            <Table minWidth={880}>
              <THead>
                <tr>
                  <TH>File</TH>
                  <TH>Chatbot</TH>
                  <TH>Type</TH>
                  <TH>Size</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Chunks</TH>
                  <TH>Uploaded</TH>
                  <TH className="text-right">
                    <span className="sr-only">Open</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {items.map((f) => (
                  <TR key={f.id}>
                    <TD className="max-w-[260px]">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-zinc-900" title={f.fileName}>
                          {f.fileName}
                        </span>
                        {f.source === 'text' && <Badge tone="violet">Text</Badge>}
                      </div>
                    </TD>
                    <TD className="max-w-[180px] truncate">
                      <Link to={`/chatbots/${f.chatbotId}/knowledge`} className="text-zinc-700 hover:text-brand-700">
                        {f.chatbotName || '—'}
                      </Link>
                    </TD>
                    <TD className="text-xs font-medium text-zinc-500">{fileTypeLabel(f.fileType, f.fileName)}</TD>
                    <TD className="tabular whitespace-nowrap text-zinc-600">{formatBytes(f.size)}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <FileStatusBadge status={f.processingStatus} />
                        {(f.error || f.warning) && (
                          <Tooltip content={f.error ?? f.warning}>
                            <TriangleExclamationPoint size={15} className={f.error ? 'text-red-500' : 'text-amber-500'} aria-label="Details" />
                          </Tooltip>
                        )}
                      </span>
                    </TD>
                    <TD className="tabular text-right">
                      {formatNumber(f.chunkCount)}
                      {f.chunkCount > 0 && <span className="block text-[11px] text-zinc-400">{formatNumber(f.embeddedChunkCount)} embedded</span>}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-zinc-500">{formatDate(f.createdAt)}</TD>
                    <TD className="text-right">
                      <Link
                        to={`/chatbots/${f.chatbotId}/knowledge`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                      >
                        Manage <ExternalLink size={12} />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-zinc-100 px-5 py-3">
              <Pagination page={page} limit={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} itemLabel="files" />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
