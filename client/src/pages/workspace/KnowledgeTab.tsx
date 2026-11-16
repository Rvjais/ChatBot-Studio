import { useEffect, useState } from 'react';
import { BookOpen, Eye, FilePlus, FileText, RefreshCw, Trash, TriangleExclamationPoint } from 'lucide-react';
import { FileStatusBadge, fileTypeLabel } from '../../components/knowledge/FileStatusBadge';
import { AddTextModal, ChunksModal } from '../../components/knowledge/KnowledgeModals';
import { RetrievalTest } from '../../components/knowledge/RetrievalTest';
import { UploadDropzone } from '../../components/knowledge/UploadDropzone';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { useAsync } from '../../hooks/useAsync';
import { knowledgeApi } from '../../services/knowledge';
import { toast } from '../../stores/toast';
import type { KnowledgeFile } from '../../types/api';
import { getErrorMessage } from '../../utils/errors';
import { formatBytes, formatDate, formatNumber, pluralize } from '../../utils/format';

const POLL_MS = 2000;

export function KnowledgeTab() {
  const { chatbot } = useWorkspace();
  const state = useAsync(() => knowledgeApi.list(chatbot.id), [chatbot.id]);
  const [addTextOpen, setAddTextOpen] = useState(false);
  const [viewing, setViewing] = useState<KnowledgeFile | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeFile | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const files = state.data?.files ?? [];
  const totals = state.data?.totals;
  const active = files.some((f) => f.processingStatus === 'pending' || f.processingStatus === 'processing');

  // Poll silently while anything is queued or processing.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setInterval(() => {
      knowledgeApi
        .list(chatbot.id)
        .then((data) => !cancelled && state.setData(data))
        .catch(() => {
          /* transient errors: keep polling */
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chatbot.id]);

  const merge = (added: KnowledgeFile[]) =>
    state.setData((prev) => {
      const base = prev ?? { files: [], totals: { files: 0, chunks: 0, pending: 0, processing: 0, completed: 0, failed: 0 } };
      const ids = new Set(added.map((f) => f.id));
      return { ...base, files: [...added, ...base.files.filter((f) => !ids.has(f.id))] };
    });

  const reprocess = async (file: KnowledgeFile) => {
    setReprocessing(file.id);
    try {
      const updated = await knowledgeApi.reprocess(chatbot.id, file.id);
      merge([updated]);
      toast.success('Re-processing started', file.fileName);
    } catch (err) {
      toast.error('Could not re-process the file', getErrorMessage(err));
    } finally {
      setReprocessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader
            icon={<BookOpen size={16} />}
            title="Knowledge files"
            description={
              totals
                ? `${pluralize(totals.files, 'file')} · ${pluralize(totals.chunks, 'chunk')}${totals.failed ? ` · ${totals.failed} failed` : ''}`
                : 'Documents this chatbot can answer from.'
            }
            actions={
              <>
                <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => void state.reload()} loading={state.refreshing}>
                  Refresh
                </Button>
                <Button size="sm" icon={<FilePlus size={14} />} onClick={() => setAddTextOpen(true)}>
                  Add text entry
                </Button>
              </>
            }
          />
          <CardBody className="space-y-5">
            <UploadDropzone chatbotId={chatbot.id} onUploaded={merge} />
            {active && (
              <p className="flex items-center gap-2 text-xs text-sky-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                </span>
                Processing in the background — this list refreshes automatically.
              </p>
            )}
          </CardBody>
          {state.loading ? (
            <div className="border-t border-zinc-100 p-5">
              <SkeletonRows rows={3} />
            </div>
          ) : state.error && !state.data ? (
            <div className="border-t border-zinc-100">
              <ErrorState error={state.error} onRetry={state.reload} compact />
            </div>
          ) : files.length === 0 ? (
            <div className="border-t border-zinc-100">
              <EmptyState
                compact
                icon={<FileText size={22} />}
                title="No knowledge yet"
                description="Upload documents or add a text entry. The chatbot will cite them when answering."
                action={
                  <Button icon={<FilePlus size={15} />} onClick={() => setAddTextOpen(true)}>
                    Add text entry
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="border-t border-zinc-100">
              <Table minWidth={820}>
                <THead>
                  <tr>
                    <TH>File</TH>
                    <TH>Type</TH>
                    <TH>Size</TH>
                    <TH>Uploaded</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Chunks</TH>
                    <TH className="text-right">Embedded</TH>
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {files.map((f) => (
                    <TR key={f.id}>
                      <TD className="max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-zinc-900" title={f.fileName}>
                            {f.fileName}
                          </span>
                          {f.source === 'text' && <Badge tone="violet">Text</Badge>}
                        </div>
                        {f.processingStatus === 'failed' && f.error && <p className="mt-0.5 truncate text-xs text-red-600" title={f.error}>{f.error}</p>}
                      </TD>
                      <TD className="text-xs font-medium text-zinc-500">{fileTypeLabel(f.fileType, f.fileName)}</TD>
                      <TD className="tabular whitespace-nowrap text-zinc-600">{formatBytes(f.size)}</TD>
                      <TD className="whitespace-nowrap text-zinc-600">{formatDate(f.createdAt)}</TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5">
                          <FileStatusBadge status={f.processingStatus} />
                          {(f.error || f.warning) && (
                            <Tooltip content={f.error ?? f.warning}>
                              <TriangleExclamationPoint size={15} className={f.error ? 'text-red-500' : 'text-amber-500'} aria-label={f.error ? 'Error details' : 'Warning'} />
                            </Tooltip>
                          )}
                        </span>
                      </TD>
                      <TD className="tabular text-right">{formatNumber(f.chunkCount)}</TD>
                      <TD className="tabular text-right">
                        {f.chunkCount ? (
                          <span className={f.embeddedChunkCount < f.chunkCount ? 'text-amber-700' : ''}>{formatNumber(f.embeddedChunkCount)}</span>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <Button size="xs" variant="ghost" iconOnly aria-label="View chunks" title="View chunks" onClick={() => setViewing(f)} disabled={!f.chunkCount}>
                          <Eye size={15} />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          iconOnly
                          aria-label="Re-process"
                          title="Re-process"
                          onClick={() => reprocess(f)}
                          loading={reprocessing === f.id}
                          disabled={f.processingStatus === 'processing' || f.processingStatus === 'pending'}
                        >
                          <RefreshCw size={15} />
                        </Button>
                        <Button size="xs" variant="danger-ghost" iconOnly aria-label="Delete file" title="Delete" onClick={() => setDeleting(f)}>
                          <Trash size={15} />
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <div className="min-w-0">
        <RetrievalTest chatbotId={chatbot.id} />
      </div>

      <AddTextModal chatbotId={chatbot.id} open={addTextOpen} onClose={() => setAddTextOpen(false)} onAdded={(f) => merge([f])} />
      <ChunksModal chatbotId={chatbot.id} file={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete knowledge file?"
        confirmLabel="Delete file"
        description={
          <>
            <strong className="text-zinc-900">{deleting?.fileName}</strong> and its {formatNumber(deleting?.chunkCount ?? 0)} chunks will be removed. The chatbot
            will no longer use this content.
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          await knowledgeApi.remove(chatbot.id, deleting.id);
          state.setData((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.id !== deleting.id) } : prev!));
          toast.success('File deleted', deleting.fileName);
          void state.reload();
        }}
      />
    </div>
  );
}
