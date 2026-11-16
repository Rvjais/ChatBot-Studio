import { useEffect, useRef, useState } from 'react';
import { CircleCheck, FileSpreadsheet, Upload } from 'lucide-react';
import { productsApi } from '../../services/products';
import { toast } from '../../stores/toast';
import type { ImportReport } from '../../types/api';
import { cn } from '../../utils/cn';
import { getErrorMessage } from '../../utils/errors';
import { formatBytes, formatNumber } from '../../utils/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Callout } from '../ui/States';
import { usePlatformLimits } from '../../hooks/usePlatformLimits';

export function ImportProductsModal({
  chatbotId,
  open,
  onClose,
  onImported,
}: {
  chatbotId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { maxProductImportMb: MAX_MB } = usePlatformLimits();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setMode('upsert');
      setError(null);
      setReport(null);
    }
  }, [open]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['json', 'csv', 'xlsx'].includes(ext ?? '')) return setError('Choose a .json, .csv or .xlsx file.');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`The file is larger than ${MAX_MB} MB.`);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await productsApi.import(chatbotId, file, mode);
      setReport(r);
      onImported();
      if (r.failed) toast.warning('Import finished with errors', `${r.failed} of ${r.total} rows were rejected.`);
      else toast.success('Products imported', `${formatNumber(r.inserted)} added, ${formatNumber(r.updated)} updated.`);
    } catch (err) {
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
      title="Import products"
      description="Upload a JSON array, CSV or Excel sheet. Common column names (id/sku, name/title, price, currency, stock, category, url, image) are recognised automatically."
      footer={
        report ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Upload size={15} />} onClick={submit} loading={busy} disabled={!file}>
              Import
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
            <CircleCheck size={18} className="text-emerald-600" /> Import report · {formatNumber(report.total)} rows read
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Inserted', value: report.inserted, tone: 'text-emerald-700' },
              { label: 'Updated', value: report.updated, tone: 'text-sky-700' },
              { label: 'Failed', value: report.failed, tone: report.failed ? 'text-red-700' : 'text-zinc-900' },
              { label: 'Removed', value: report.removed, tone: 'text-zinc-900' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-zinc-200 px-3 py-2.5">
                <p className="text-xs text-zinc-500">{s.label}</p>
                <p className={cn('mt-0.5 text-xl font-semibold', s.tone)}>{formatNumber(s.value)}</p>
              </div>
            ))}
          </div>
          {report.errors.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-red-700">Rejected rows</p>
              <ul className="scrollbar-thin max-h-48 divide-y divide-red-100 overflow-y-auto rounded-lg border border-red-200 bg-red-50/50 text-sm">
                {report.errors.map((e, i) => (
                  <li key={i} className="px-3 py-1.5 text-red-800">
                    <span className="tabular font-medium">Row {e.row}:</span> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-amber-800">Warnings</p>
              <ul className="scrollbar-thin max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 px-5 py-5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-zinc-200">
              <FileSpreadsheet size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-zinc-900">{file ? file.name : 'Choose a file'}</span>
              <span className="block text-xs text-zinc-500">{file ? formatBytes(file.size) : `.json, .csv or .xlsx · up to ${MAX_MB} MB`}</span>
            </span>
          </button>
          <input ref={inputRef} type="file" hidden accept=".json,.csv,.xlsx" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-zinc-800">Import mode</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: 'upsert', title: 'Add & update', text: 'Adds new products and updates existing ones with the same product ID. Other products are kept.' },
                  { value: 'replace', title: 'Replace catalog', text: 'Makes the catalog match this file exactly: products not in the file are removed.' },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors',
                    mode === o.value ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500' : 'border-zinc-200 hover:bg-zinc-50',
                  )}
                >
                  <input type="radio" name="import-mode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="mt-1 accent-brand-600" />
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">{o.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {mode === 'replace' && <Callout tone="warning">Products that are not in the uploaded file will be permanently deleted.</Callout>}
          {error && <Callout tone="error">{error}</Callout>}
        </div>
      )}
    </Modal>
  );
}
