import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

let openLayers = 0;

/** Locks body scroll, closes on Escape and restores focus when the layer unmounts. */
function useLayer(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openLayers++;
    document.body.style.overflow = 'hidden';
    const layerIndex = openLayers;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layerIndex === openLayers) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && containerRef.current && layerIndex === openLayers) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const autofocus = el.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      (autofocus ?? el).focus({ preventScroll: true });
    }, 20);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openLayers--;
      if (openLayers === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, containerRef]);
}

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
  /** Prevent closing via backdrop/Escape while an action is running. */
  dismissible?: boolean;
  bodyClassName?: string;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true, bodyClassName }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLayer(open, () => dismissible && onClose(), ref);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => dismissible && onClose()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl bg-white shadow-pop outline-none sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose} disabled={!dismissible} className="-mr-2">
            <X size={18} />
          </Button>
        </div>
        <div className={cn('scrollbar-thin flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  bodyClassName?: string;
}

const drawerWidths = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' };

/** Right-side panel for viewers and the test chat. */
export function Drawer({ open, onClose, title, description, actions, children, footer, width = 'lg', bodyClassName }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLayer(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex h-full w-full animate-slide-in-right flex-col bg-white shadow-pop outline-none', drawerWidths[width])}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {description && <div className="mt-0.5 text-sm text-zinc-500">{description}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <Button variant="ghost" size="sm" iconOnly aria-label="Close panel" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        </div>
        <div className={cn('scrollbar-thin flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
        {footer && <div className="border-t border-zinc-200 bg-white">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
