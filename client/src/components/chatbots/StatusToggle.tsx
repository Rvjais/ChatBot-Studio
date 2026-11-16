import { useState } from 'react';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { Chatbot } from '../../types/api';
import { getErrorMessage } from '../../utils/errors';
import { cn } from '../../utils/cn';
import { Switch } from '../ui/Switch';

/** Activates/deactivates a chatbot via PATCH /status with an optimistic switch. */
export function StatusToggle({
  chatbot,
  onChange,
  showLabel = true,
  size = 'sm',
}: {
  chatbot: Pick<Chatbot, 'id' | 'name' | 'status'>;
  onChange: (updated: Chatbot) => void;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const active = pending ?? chatbot.status === 'active';

  const toggle = async (next: boolean) => {
    setPending(next);
    try {
      const updated = await chatbotsApi.setStatus(chatbot.id, next ? 'active' : 'inactive');
      onChange(updated);
      toast.success(next ? `${chatbot.name} is now active` : `${chatbot.name} is now inactive`, next ? undefined : 'The widget will stop answering visitors.');
    } catch (err) {
      toast.error('Could not change status', getErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Switch size={size} checked={active} onChange={toggle} disabled={pending !== null} aria-label={active ? 'Deactivate chatbot' : 'Activate chatbot'} />
      {showLabel && <span className={cn('text-xs font-medium', active ? 'text-emerald-700' : 'text-zinc-500')}>{active ? 'Active' : 'Inactive'}</span>}
    </span>
  );
}
