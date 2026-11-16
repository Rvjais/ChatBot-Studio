import { useRef, useState, type DragEvent } from 'react';
import { FileUp, X } from 'lucide-react';
import { knowledgeApi } from '../../services/knowledge';
import { toast } from '../../stores/toast';
import type { KnowledgeFile } from '../../types/api';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../utils/errors';
import { formatBytes, pluralize } from '../../utils/format';
import { Button } from '../ui/Button';
import { usePlatformLimits } from '../../hooks/usePlatformLimits';
import { KNOWLEDGE_EXTENSIONS } from './FileStatusBadge';

/** Drag-and-drop multi-file upload (multipart field "files"). Validates type/size before sending. */
export function UploadDropzone({ chatbotId, onUploaded }: { chatbotId: string; onUploaded: (files: KnowledgeFile[]) => void }) {
  const { maxUploadMb: KNOWLEDGE_MAX_MB, maxFilesPerUpload: KNOWLEDGE_MAX_FILES } = usePlatformLimits();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  const addFiles = (list: FileList | File[]) => {
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!KNOWLEDGE_EXTENSIONS.includes(ext)) problems.push(`${f.name}: unsupported type`);
      else if (f.size > KNOWLEDGE_MAX_MB * 1024 * 1024) problems.push(`${f.name}: larger than ${KNOWLEDGE_MAX_MB} MB`);
      else if (f.size === 0) problems.push(`${f.name}: file is empty`);
      else accepted.push(f);
    }
    setQueue((q) => {
      const merged = [...q];
      for (const f of accepted) if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      if (merged.length > KNOWLEDGE_MAX_FILES) problems.push(`Only ${KNOWLEDGE_MAX_FILES} files can be uploaded at once — extra files were skipped.`);
      return merged.slice(0, KNOWLEDGE_MAX_FILES);
    });
    setRejected(problems);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const upload = async () => {
    if (!queue.length) return;
    setProgress(0);
    try {
      const files = await knowledgeApi.upload(chatbotId, queue, setProgress);
      toast.success(`Uploaded ${pluralize(files.length, 'file')}`, 'Processing runs in the background — statuses update automatically.');
      setQueue([]);
      setRejected([]);
      onUploaded(files);
    } catch (err) {
      toast.error('Upload failed', getErrorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload knowledge files"
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-zinc-300 bg-zinc-50/50 hover:border-brand-400 hover:bg-brand-50/40',
        )}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-zinc-200">
          <FileUp size={20} />
        </div>
        <p className="text-sm font-medium text-zinc-800">
          Drop files here or <span className="text-brand-600">browse</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          PDF, TXT, MD, DOCX, CSV, JSON, XLSX · up to {KNOWLEDGE_MAX_MB} MB each · {KNOWLEDGE_MAX_FILES} files per upload
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={KNOWLEDGE_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600" role="alert">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {queue.length > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-100">
            {queue.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-zinc-800">{f.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                  {formatBytes(f.size)}
                  {!uploading && (
                    <button
                      type="button"
                      className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      onClick={() => setQueue((q) => q.filter((x) => x !== f))}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-3 py-2.5">
            {uploading ? (
              <div className="flex flex-1 items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="tabular text-xs text-zinc-500">{progress! < 100 ? `${progress}%` : 'Processing…'}</span>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setQueue([])}>
                Clear
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={upload} loading={uploading}>
              Upload {pluralize(queue.length, 'file')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
