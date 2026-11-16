import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { useCatalogModels, useProviders } from '../../hooks/useProviders';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { AiConfigUpdate, ProviderId } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Callout } from '../ui/States';
import { ModelCombobox } from './ModelCombobox';

export function CreateChatbotModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { providers, byId, loading: providersLoading, error: providersError } = useProviders();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const catalog = useCatalogModels(provider, 'chat');
  const def = byId.get(provider);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setProvider('openai');
      setModel('');
      setApiKey('');
      setBaseUrl('');
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  // Pre-select the recommended catalog model for the chosen provider.
  useEffect(() => {
    const models = catalog.data;
    if (!models) return;
    setModel((current) => {
      if (current && models.some((m) => m.id === current)) return current;
      return (models.find((m) => m.recommended) ?? models[0])?.id ?? '';
    });
  }, [catalog.data]);

  const options = useMemo(() => (catalog.data ?? []).map((m) => ({ ...m, origin: 'catalog' as const })), [catalog.data]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give your chatbot a name';
    if (!model.trim()) errs['ai.model'] = 'Choose or type a model ID';
    if (def?.requiresBaseUrl && !baseUrl.trim()) errs['ai.baseUrl'] = 'This provider needs a base URL';
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const ai: AiConfigUpdate = { provider, model: model.trim() };
    if (apiKey.trim()) ai.apiKey = apiKey.trim();
    if (baseUrl.trim()) ai.baseUrl = baseUrl.trim();
    try {
      const chatbot = await chatbotsApi.create({ name: name.trim(), description: description.trim(), ai });
      toast.success('Chatbot created', 'Next: add instructions and knowledge, then test it.');
      onClose();
      navigate(`/chatbots/${chatbot.id}`);
    } catch (err) {
      setFieldErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Create a chatbot"
      description="You can change every setting later in the chatbot's workspace."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            Create chatbot
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <Input
          label="Name"
          required
          value={name}
          maxLength={100}
          placeholder="e.g. Store assistant"
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          data-autofocus
        />
        <Textarea
          label="Description"
          rows={2}
          maxLength={1000}
          value={description}
          placeholder="What is this chatbot for? (internal note)"
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="AI provider"
            value={provider}
            disabled={providersLoading}
            onChange={(e) => {
              setProvider(e.target.value as ProviderId);
              setModel('');
              setApiKey('');
              setBaseUrl('');
            }}
            error={fieldErrors['ai.provider']}
            hint={providersError ? getErrorMessage(providersError) : def?.description}
            options={
              providers.length
                ? providers.map((p) => ({ value: p.id, label: p.name }))
                : [{ value: provider, label: providersLoading ? 'Loading providers…' : provider }]
            }
          />
          <ModelCombobox value={model} onChange={setModel} options={options} loading={catalog.loading} error={fieldErrors['ai.model']} required />
        </div>
        {def?.requiresBaseUrl && (
          <Input
            label="Base URL"
            required
            type="url"
            value={baseUrl}
            placeholder="https://my-gateway.example.com/v1"
            onChange={(e) => setBaseUrl(e.target.value)}
            error={fieldErrors['ai.baseUrl']}
            hint="The OpenAI-compatible endpoint root (the path before /chat/completions)."
          />
        )}
        <Input
          label="API key"
          type="password"
          autoComplete="off"
          value={apiKey}
          leading={<KeyRound size={15} />}
          placeholder={def?.apiKeyRequired === false ? 'Optional for this provider' : 'Paste your provider API key'}
          onChange={(e) => setApiKey(e.target.value)}
          error={fieldErrors['ai.apiKey']}
          hint={
            <>
              Encrypted at rest and never shown again. You can add it later in AI Settings.
              {def?.apiKeyUrl && (
                <>
                  {' '}
                  <a href={def.apiKeyUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                    Get an API key from {def.name}
                  </a>
                </>
              )}
            </>
          }
        />
        {error && <Callout tone="error">{error}</Callout>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
