import { useState, type ReactNode } from 'react';
import { TriangleExclamationPoint } from 'lucide-react';
import { getErrorMessage } from '../../utils/errors';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** May return a promise; errors are shown inline and the dialog stays open. */
  onConfirm: () => unknown | Promise<unknown>;
  children?: ReactNode;
  /** Disable the confirm button until extra inputs are valid (e.g. typed confirmation). */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      setError(getErrorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      dismissible={!busy}
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && <TriangleExclamationPoint size={18} className="text-red-500" aria-hidden="true" />}
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={confirmDisabled} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm leading-relaxed text-zinc-600">{description}</div>}
      {children && <div className={description ? 'mt-4' : ''}>{children}</div>}
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
