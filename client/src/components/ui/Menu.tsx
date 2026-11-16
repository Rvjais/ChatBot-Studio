import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const MENU_WIDTH = 184;

/** "More actions" dropdown, rendered in a portal so scroll containers never clip it. */
export function ActionMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open) return setPos(null);
    const rect = buttonRef.current!.getBoundingClientRect();
    const estimatedHeight = items.length * 38 + 8;
    const up = rect.bottom + estimatedHeight + 8 > window.innerHeight && rect.top > estimatedHeight;
    setPos({
      top: up ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      up,
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
      >
        <Ellipsis size={18} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 animate-pop-in rounded-lg border border-zinc-200 bg-white py-1 shadow-pop"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setPos(null);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors focus:outline-none disabled:opacity-50',
                  item.danger ? 'text-red-600 hover:bg-red-50 focus:bg-red-50' : 'text-zinc-700 hover:bg-zinc-50 focus:bg-zinc-50',
                )}
              >
                {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
