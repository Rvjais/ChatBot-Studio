import { useMemo, useState } from 'react';
import { Check, Lightbulb, ScrollText, Search, ShieldCheck, Smile } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Modal, NumberInput, RangeInput, Switch, Textarea } from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { SaveBar } from '../../components/workspace/SaveBar';
import { useDraft } from '../../hooks/useDraft';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import { PERSONALITY_TONES, type Chatbot, type ChatbotUpdate, type PersonalityTone } from '../../types/api';
import { cn } from '../../utils/cn';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { formatNumber } from '../../utils/format';

const MAX_PROMPT = 30_000;

const TONE_INFO: Record<PersonalityTone, string> = {
  professional: 'Polished and courteous',
  friendly: 'Warm and approachable',
  casual: 'Relaxed, conversational',
  technical: 'Precise, uses domain terms',
  concise: 'Short, to-the-point answers',
  detailed: 'Thorough explanations',
};

const EXAMPLES = [
  {
    title: 'E-commerce support',
    prompt:
      'You are an intelligent customer support assistant for an e-commerce store. Answer questions about products, pricing, availability, shipping, and returns. Always use the provided product information. Never invent prices or product specifications. If you are unsure, say so and offer to connect the customer with the support team.',
  },
  {
    title: 'SaaS product help desk',
    prompt:
      'You are the help-desk assistant for our software product. Answer questions using the documentation provided in your knowledge base. Give step-by-step instructions where useful and link to the relevant setting or page by name. If the documentation does not cover a question, say that you do not know and suggest contacting support@yourcompany.com.',
  },
  {
    title: 'Lead qualification',
    prompt:
      "You are a friendly sales assistant for our agency. Help visitors understand our services and pricing tiers using only the information provided. Ask one question at a time to learn the visitor's company size, budget and timeline. When the visitor is interested, invite them to book a call.",
  },
  {
    title: 'Restaurant / local business',
    prompt:
      'You are the virtual host for our restaurant. Answer questions about opening hours, location, the menu, dietary options and reservations using the provided information. Keep answers short and welcoming. Never confirm a reservation yourself — direct guests to the booking link.',
  },
];

interface InstructionsDraft {
  systemPrompt: string;
  tones: PersonalityTone[];
  customInstructions: string;
  strictMode: boolean;
  topK: number;
  minScore: number;
  maxContextChars: number;
}

const toDraft = (c: Chatbot): InstructionsDraft => ({
  systemPrompt: c.systemPrompt,
  tones: [...c.personality.tones],
  customInstructions: c.personality.customInstructions,
  strictMode: c.knowledgeSettings.strictMode,
  topK: c.knowledgeSettings.topK,
  minScore: c.knowledgeSettings.minScore,
  maxContextChars: c.knowledgeSettings.maxContextChars,
});

export function InstructionsTab() {
  const { chatbot, updateChatbot } = useWorkspace();
  const source = useMemo(() => toDraft(chatbot), [chatbot]);
  const { draft, setDraft, patch, dirty, reset } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [examplesOpen, setExamplesOpen] = useState(false);

  const promptLength = draft.systemPrompt.length;
  const overLimit = promptLength > MAX_PROMPT;

  const toggleTone = (tone: PersonalityTone) =>
    patch({ tones: draft.tones.includes(tone) ? draft.tones.filter((t) => t !== tone) : PERSONALITY_TONES.filter((t) => t === tone || draft.tones.includes(t)) });

  const save = async () => {
    const e: Record<string, string> = {};
    if (overLimit) e.systemPrompt = `The system prompt is ${formatNumber(promptLength - MAX_PROMPT)} characters over the limit`;
    if (draft.customInstructions.length > 5000) e['personality.customInstructions'] = 'Custom instructions are limited to 5,000 characters';
    if (draft.maxContextChars < 1000 || draft.maxContextChars > 100_000) e['knowledgeSettings.maxContextChars'] = 'Must be between 1,000 and 100,000';
    setErrors(e);
    if (Object.keys(e).length) return;

    const body: ChatbotUpdate = {};
    if (draft.systemPrompt !== source.systemPrompt) body.systemPrompt = draft.systemPrompt;
    if (JSON.stringify(draft.tones) !== JSON.stringify(source.tones) || draft.customInstructions !== source.customInstructions) {
      body.personality = { tones: draft.tones, customInstructions: draft.customInstructions };
    }
    if (draft.strictMode !== source.strictMode || draft.topK !== source.topK || draft.minScore !== source.minScore || draft.maxContextChars !== source.maxContextChars) {
      body.knowledgeSettings = { strictMode: draft.strictMode, topK: draft.topK, minScore: draft.minScore, maxContextChars: draft.maxContextChars };
    }
    setSaving(true);
    try {
      const updated = await chatbotsApi.update(chatbot.id, body);
      updateChatbot(updated);
      setDraft(toDraft(updated));
      toast.success('Instructions saved');
    } catch (err) {
      setErrors(getFieldErrors(err));
      toast.error('Could not save instructions', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<ScrollText size={16} />}
          title="System prompt"
          description="The core instructions this chatbot always follows. Knowledge, product data and visitor messages can never override them."
          actions={
            <Button size="sm" icon={<Lightbulb size={15} />} onClick={() => setExamplesOpen(true)}>
              Example prompts
            </Button>
          }
        />
        <CardBody>
          <Textarea
            aria-label="System prompt"
            rows={14}
            value={draft.systemPrompt}
            onChange={(e) => patch({ systemPrompt: e.target.value })}
            placeholder="You are a helpful assistant for… Describe the role, the audience, what to answer, what to avoid and how to respond when information is missing."
            className="min-h-[280px] resize-y font-mono text-[13px]"
            error={errors.systemPrompt}
            hint={
              <span className={cn('tabular', overLimit && 'font-medium text-red-600')}>
                {formatNumber(promptLength)} / {formatNumber(MAX_PROMPT)} characters
              </span>
            }
          />
          <ul className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> State the role and the audience.
            </li>
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Say what to do when information is missing.
            </li>
            <li className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Prices and stock always come from product records.
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Smile size={16} />} title="Personality" description="Optional tone guidance added to the system prompt." />
        <CardBody className="space-y-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tones">
            {PERSONALITY_TONES.map((tone) => {
              const active = draft.tones.includes(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTone(tone)}
                  title={TONE_INFO[tone]}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors',
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                  )}
                >
                  {active && <Check size={14} />}
                  {tone}
                </button>
              );
            })}
          </div>
          <Textarea
            label="Custom instructions"
            rows={4}
            value={draft.customInstructions}
            onChange={(e) => patch({ customInstructions: e.target.value })}
            placeholder="e.g. Address customers by name when they share it. Use metric units. Keep answers under 120 words."
            error={errors['personality.customInstructions']}
            aside={<span className={cn('tabular', draft.customInstructions.length > 5000 && 'text-red-600')}>{formatNumber(draft.customInstructions.length)} / 5,000</span>}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Search size={16} />} title="Knowledge retrieval" description="How much of the knowledge base is put in front of the model for each question." />
        <CardBody className="space-y-6">
          <div className="rounded-lg border border-zinc-200 p-4">
            <Switch
              checked={draft.strictMode}
              onChange={(v) => patch({ strictMode: v })}
              label={
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck size={15} className="text-brand-600" /> Strict mode
                </span>
              }
              description="Only answer business questions from the knowledge base and product data. When nothing relevant is found, the bot replies with the fallback message instead of using general knowledge."
            />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <RangeInput
              label="Chunks per answer (top K)"
              value={draft.topK}
              min={1}
              max={20}
              step={1}
              onChange={(v) => patch({ topK: v })}
              hint="More chunks give more context but cost more tokens."
            />
            <RangeInput
              label="Minimum similarity"
              value={draft.minScore}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => patch({ minScore: Math.round(v * 100) / 100 })}
              format={(v) => v.toFixed(2)}
              hint="Vector matches below this score are ignored."
            />
            <NumberInput
              label="Max context characters"
              min={1000}
              max={100000}
              step={500}
              value={draft.maxContextChars}
              onValueChange={(v) => patch({ maxContextChars: v === null ? 1000 : Math.round(v) })}
              error={errors['knowledgeSettings.maxContextChars']}
              hint="Upper bound on knowledge text added to each request (1,000 – 100,000)."
            />
          </div>
        </CardBody>
      </Card>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { reset(); setErrors({}); }} disabled={overLimit} />

      <Modal open={examplesOpen} onClose={() => setExamplesOpen(false)} size="lg" title="Example system prompts" description="Start from a template and adapt it to your business.">
        <div className="space-y-3">
          {EXAMPLES.map((ex) => (
            <div key={ex.title} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900">{ex.title}</p>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    onClick={() => {
                      patch({ systemPrompt: draft.systemPrompt ? `${draft.systemPrompt.trimEnd()}\n\n${ex.prompt}` : ex.prompt });
                      setExamplesOpen(false);
                    }}
                  >
                    Append
                  </Button>
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={() => {
                      patch({ systemPrompt: ex.prompt });
                      setExamplesOpen(false);
                    }}
                  >
                    Use this
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{ex.prompt}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
