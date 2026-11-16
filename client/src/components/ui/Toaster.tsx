import { useEffect } from 'react';
import { CircleCheck, CircleExclamationPoint, Info, TriangleExclamationPoint, X } from 'lucide-react';
import { useToastStore, type Toast } from '../../stores/toast';
import { cn } from '../../utils/cn';

const styles = {
  success: { icon: CircleCheck, color: 'text-emerald-600' },
  error: { icon: CircleExclamationPoint, color: 'text-red-600' },
  info: { icon: Info, color: 'text-sky-600' },
  warning: { icon: TriangleExclamationPoint, color: 'text-amber-600' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);
  const { icon: Icon, color } = styles[toast.variant];
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-pop"
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', color)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm break-words text-zinc-500">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="-m-1 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-[380px] sm:items-end"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
