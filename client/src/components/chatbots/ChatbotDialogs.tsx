import { useEffect, useState, type FormEvent } from 'react';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { Chatbot } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { pluralize } from '../../utils/format';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Callout } from '../ui/States';
import { Checkbox } from '../ui/Switch';

export function DuplicateChatbotModal({
  chatbot,
  open,
  onClose,
  onDuplicated,
}: {
  chatbot: Pick<Chatbot, 'id' | 'name' | 'stats'>;
  open: boolean;
  onClose: () => void;
  onDuplicated: (copy: Chatbot) => void;
}) {
  const [name, setName] = useState('');
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeKnowledge, setIncludeKnowledge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(`${chatbot.name} (copy)`.slice(0, 100));
      setIncludeProducts(true);
      setIncludeKnowledge(true);
      setError(null);
      setFieldErrors({});
    }
  }, [open, chatbot.name]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const copy = await chatbotsApi.duplicate(chatbot.id, { name: name.trim() || undefined, includeProducts, includeKnowledge });
      toast.success('Chatbot duplicated', `"${copy.name}" was created as inactive.`);
      onDuplicated(copy);
      onClose();
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
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
      title="Duplicate chatbot"
      description="Copies all settings, instructions, AI configuration (including the encrypted API key) and appearance."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            Duplicate
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <Input label="Name of the copy" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} data-autofocus />
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
          <Checkbox
            checked={includeKnowledge}
            onChange={setIncludeKnowledge}
            label="Include knowledge base"
            description={
              chatbot.stats
                ? `Processed files (of ${pluralize(chatbot.stats.knowledgeFiles, 'file')}) are copied with their chunks and embeddings.`
                : 'Processed files are copied with their chunks and embeddings.'
            }
          />
          <Checkbox
            checked={includeProducts}
            onChange={setIncludeProducts}
            label="Include products"
            description={chatbot.stats ? `${pluralize(chatbot.stats.products, 'product')} will be copied.` : undefined}
          />
        </div>
        <p className="text-xs text-zinc-500">The copy gets a new public ID and starts inactive. Conversations and the sync key are not copied.</p>
        {error && <Callout tone="error">{error}</Callout>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function DeleteChatbotDialog({
  chatbot,
  open,
  onClose,
  onDeleted,
}: {
  chatbot: Pick<Chatbot, 'id' | 'name' | 'stats'>;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete chatbot?"
      confirmLabel="Delete chatbot"
      confirmDisabled={typed.trim() !== chatbot.name.trim()}
      description={
        <>
          This permanently deletes <strong className="text-zinc-900">{chatbot.name}</strong> together with its knowledge files, products,
          conversations and analytics. Websites embedding it will stop showing the widget. This cannot be undone.
        </>
      }
      onConfirm={async () => {
        await chatbotsApi.remove(chatbot.id);
        toast.success('Chatbot deleted', chatbot.name);
        onDeleted();
      }}
    >
      <Input label={<>Type <span className="font-mono text-zinc-900">{chatbot.name}</span> to confirm</>} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
    </ConfirmDialog>
  );
}
