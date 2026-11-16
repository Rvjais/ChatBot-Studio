import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import { Copy, Trash } from 'lucide-react';
import { DeleteChatbotDialog, DuplicateChatbotModal } from '../../components/chatbots/ChatbotDialogs';
import { Button, Card, CardBody, CardHeader, Input, Select, Switch, Textarea } from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { SaveBar } from '../../components/workspace/SaveBar';
import { useDraft } from '../../hooks/useDraft';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { Chatbot, ChatbotStatus, ChatbotUpdate } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Hindi', 'Arabic', 'Bengali',
  'Chinese', 'Japanese', 'Korean', 'Russian', 'Turkish', 'Indonesian', 'Polish', 'Swedish', 'Ukrainian', 'Vietnamese',
];

interface GeneralDraft {
  name: string;
  description: string;
  identifier: string;
  welcomeMessage: string;
  placeholder: string;
  language: string;
  fallbackMessage: string;
  status: ChatbotStatus;
}

const toDraft = (c: Chatbot): GeneralDraft => ({
  name: c.name,
  description: c.description,
  identifier: c.identifier,
  welcomeMessage: c.welcomeMessage,
  placeholder: c.placeholder,
  language: c.language,
  fallbackMessage: c.fallbackMessage,
  status: c.status,
});

export function GeneralTab() {
  const { chatbot, updateChatbot } = useWorkspace();
  const navigate = useNavigate();
  const source = useMemo(() => toDraft(chatbot), [chatbot]);
  const { draft, setDraft, patch, dirty, reset } = useDraft(source);
  /** Navigate away after discarding the draft synchronously (so the unsaved-changes guard stays quiet). */
  const leave = (to: string) => {
    flushSync(() => reset());
    navigate(to, { replace: true });
  };
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customLanguage, setCustomLanguage] = useState(() => draft.language !== 'auto' && !LANGUAGES.includes(draft.language));
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Name is required';
    if (!draft.fallbackMessage.trim()) e.fallbackMessage = 'A fallback message is required';
    if (!draft.language.trim()) e.language = 'Choose a language or "Auto-detect"';
    if (draft.identifier && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.identifier.trim().toLowerCase())) {
      e.identifier = 'Use lowercase letters, numbers and single hyphens';
    }
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: ChatbotUpdate = {};
    (Object.keys(draft) as (keyof GeneralDraft)[]).forEach((k) => {
      if (draft[k] !== source[k]) (body as Record<string, unknown>)[k] = typeof draft[k] === 'string' ? (draft[k] as string).trim() : draft[k];
    });
    if (body.identifier === '') delete body.identifier;
    setSaving(true);
    try {
      const updated = await chatbotsApi.update(chatbot.id, body);
      updateChatbot(updated);
      setDraft(toDraft(updated));
      toast.success('General settings saved');
    } catch (err) {
      setErrors(getFieldErrors(err));
      toast.error('Could not save settings', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const languageSelectValue = customLanguage ? '__custom' : draft.language;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Basics" description="How this chatbot is identified in the dashboard." />
          <CardBody className="space-y-5">
            <Input label="Chatbot name" required maxLength={100} value={draft.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} />
            <Textarea
              label="Description"
              rows={3}
              maxLength={1000}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              error={errors.description}
              aside={`${draft.description.length}/1000`}
              hint="Internal note — visitors never see it."
            />
            <Input
              label="Identifier"
              maxLength={64}
              value={draft.identifier}
              onChange={(e) => patch({ identifier: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              error={errors.identifier}
              className="font-mono"
              hint="A unique slug for your own reference (lowercase letters, numbers and hyphens). The widget uses the public ID instead."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Conversation" description="What visitors see when they open the widget." />
          <CardBody className="space-y-5">
            <Textarea
              label="Welcome message"
              rows={2}
              maxLength={1000}
              value={draft.welcomeMessage}
              onChange={(e) => patch({ welcomeMessage: e.target.value })}
              error={errors.welcomeMessage}
              aside={`${draft.welcomeMessage.length}/1000`}
            />
            <Input
              label="Input placeholder"
              maxLength={120}
              value={draft.placeholder}
              onChange={(e) => patch({ placeholder: e.target.value })}
              error={errors.placeholder}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Response language"
                value={languageSelectValue}
                onChange={(e) => {
                  if (e.target.value === '__custom') {
                    setCustomLanguage(true);
                    patch({ language: '' });
                  } else {
                    setCustomLanguage(false);
                    patch({ language: e.target.value });
                  }
                }}
                error={!customLanguage ? errors.language : undefined}
                hint={draft.language === 'auto' ? 'Replies in the language the visitor writes in.' : undefined}
              >
                <option value="auto">Auto-detect (match the visitor)</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="__custom">Other…</option>
              </Select>
              {customLanguage && (
                <Input
                  label="Language name"
                  maxLength={40}
                  value={draft.language}
                  placeholder="e.g. Tamil"
                  onChange={(e) => patch({ language: e.target.value })}
                  error={errors.language}
                />
              )}
            </div>
            <Textarea
              label="Fallback message"
              required
              rows={2}
              maxLength={1000}
              value={draft.fallbackMessage}
              onChange={(e) => patch({ fallbackMessage: e.target.value })}
              error={errors.fallbackMessage}
              hint="Used when the bot has no grounded answer or the model returns nothing."
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Status" />
          <CardBody>
            <Switch
              checked={draft.status === 'active'}
              onChange={(v) => patch({ status: v ? 'active' : 'inactive' })}
              label={draft.status === 'active' ? 'Active' : 'Inactive'}
              description="Inactive chatbots stay configured, but the embedded widget will not answer visitors."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Created</dt>
                <dd className="text-zinc-800">{formatDateTime(chatbot.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Last updated</dt>
                <dd className="text-zinc-800">{formatDateTime(chatbot.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Public ID</dt>
                <dd className="truncate font-mono text-xs text-zinc-800">{chatbot.publicId}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card className="border-red-200">
          <CardHeader title="Manage" description="Copy this chatbot or remove it permanently." />
          <CardBody className="flex flex-col gap-2">
            <Button icon={<Copy size={15} />} onClick={() => setDuplicateOpen(true)}>
              Duplicate chatbot
            </Button>
            <Button variant="danger-ghost" className="border border-red-200" icon={<Trash size={15} />} onClick={() => setDeleteOpen(true)}>
              Delete chatbot
            </Button>
          </CardBody>
        </Card>
      </div>

      <div className="xl:col-span-2">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { reset(); setErrors({}); }} />
      </div>

      <DuplicateChatbotModal
        chatbot={chatbot}
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        onDuplicated={(copy) => leave(`/chatbots/${copy.id}`)}
      />
      <DeleteChatbotDialog chatbot={chatbot} open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={() => leave('/chatbots')} />
    </div>
  );
}
