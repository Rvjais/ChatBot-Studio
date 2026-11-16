import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { knowledgeApi } from '../../services/knowledge';
import { toast } from '../../stores/toast';
import type { KnowledgeFile } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { formatNumber } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Pagination } from '../ui/Pagination';
import { SkeletonRows } from '../ui/Spinner';
import { Callout, EmptyState, ErrorState } from '../ui/States';

export function AddTextModal({
  chatbotId,
  open,
  onClose,
  onAdded,
}: {
  chatbotId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (f: KnowledgeFile) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setContent('');
      setErrors({});
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give this entry a title';
    if (!content.trim()) e.content = 'Content cannot be empty';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      const file = await knowledgeApi.addText(chatbotId, title.trim(), content.trim());
      toast.success('Text entry added', 'It will be processed in a moment.');
      onAdded(file);
      onClose();
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Add text entry"
      description="Paste FAQs, policies or any text. It is chunked and indexed like an uploaded file."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Add entry
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="e.g. Shipping & returns policy" data-autofocus />
        <Textarea
          label="Content"
          rows={12}
          maxLength={200_000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          error={errors.content}
          aside={`${formatNumber(content.length)} / 200,000`}
          placeholder="Write or paste the information the chatbot should know…"
        />
        {error && <Callout tone="error">{error}</Callout>}
      </div>
    </Modal>
  );
}

const CHUNK_PAGE_SIZE = 10;

export function ChunksModal({ chatbotId, file, onClose }: { chatbotId: string; file: KnowledgeFile | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [file?.id]);
  const state = useAsync(() => (file ? knowledgeApi.chunks(chatbotId, file.id, page, CHUNK_PAGE_SIZE) : Promise.resolve(null)), [file?.id, page], {
    enabled: Boolean(file),
  });
  const data = state.data;

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="xl"
      title={file ? `Chunks · ${file.fileName}` : 'Chunks'}
      description={file ? `${formatNumber(file.chunkCount)} chunks · ${formatNumber(file.embeddedChunkCount)} embedded · ${formatNumber(file.characterCount)} characters` : undefined}
      footer={
        data && data.total > CHUNK_PAGE_SIZE ? (
          <Pagination className="w-full" page={page} limit={CHUNK_PAGE_SIZE} total={data.total} onPageChange={setPage} itemLabel="chunks" />
        ) : undefined
      }
    >
      {state.loading ? (
        <SkeletonRows rows={4} />
      ) : state.error && !data ? (
        <ErrorState error={state.error} onRetry={state.reload} compact />
      ) : !data || data.items.length === 0 ? (
        <EmptyState compact title="No chunks yet" description={file?.processingStatus === 'failed' ? file.error ?? 'Processing failed.' : 'This file has not produced any chunks yet.'} />
      ) : (
        <ol className={state.refreshing ? 'space-y-3 opacity-60' : 'space-y-3'}>
          {data.items.map((c) => (
            <li key={c.id} className="rounded-lg border border-zinc-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50/70 px-3 py-1.5 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700">#{c.index + 1}</span>
                <span>~{formatNumber(c.tokenEstimate)} tokens</span>
                {c.metadata.page !== null && <span>Page {c.metadata.page}</span>}
                {c.metadata.sheet && <span>Sheet {c.metadata.sheet}</span>}
                {c.metadata.rows && <span>Rows {c.metadata.rows}</span>}
                <span className="ml-auto">{c.embedded ? <Badge tone="green">Embedded</Badge> : <Badge tone="gray">Keyword only</Badge>}</span>
              </div>
              <p className="chat-text max-h-56 overflow-y-auto px-3 py-2.5 text-[13px] leading-relaxed text-zinc-700">{c.content}</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
