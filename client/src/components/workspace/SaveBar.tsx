import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { CircleDot } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * Sticky bar shown while a form has unsaved changes. Also guards in-app navigation
 * (react-router blocker) and tab close (beforeunload) so edits are not lost silently.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  message = 'You have unsaved changes',
  disabled,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  message?: string;
  disabled?: boolean;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <>
      {dirty && (
        <div className="sticky bottom-4 z-20 mt-6 flex animate-pop-in flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-pop backdrop-blur">
          <p className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <CircleDot size={16} className="text-amber-500" aria-hidden="true" />
            {message}
          </p>
          <div className="flex gap-2">
            <Button onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" onClick={onSave} loading={saving} disabled={disabled}>
              Save changes
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description="Your unsaved changes on this page will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Stay on page"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </>
  );
}
