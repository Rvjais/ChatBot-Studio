import { useMemo, useState } from 'react';
import { Eye, Palette, Plus, Trash } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ColorInput,
  Field,
  HEX_COLOR,
  Input,
  RangeInput,
  SegmentedControl,
  Switch,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { SaveBar } from '../../components/workspace/SaveBar';
import { WidgetPreview } from '../../components/workspace/WidgetPreview';
import { useDraft } from '../../hooks/useDraft';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { Chatbot, WidgetPosition, WidgetSettings, WidgetSize, WidgetTheme } from '../../types/api';
import { contrastRatio } from '../../utils/color';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

const toDraft = (c: Chatbot): WidgetSettings => {
  const w = c.widget;
  return {
    title: w.title ?? c.name,
    subtitle: w.subtitle ?? '',
    primaryColor: w.primaryColor ?? '#4f46e5',
    secondaryColor: w.secondaryColor ?? '#eef2ff',
    headerBackground: w.headerBackground ?? '#4f46e5',
    headerTextColor: w.headerTextColor ?? '#ffffff',
    position: w.position ?? 'bottom-right',
    avatarUrl: w.avatarUrl ?? '',
    borderRadius: w.borderRadius ?? 16,
    theme: w.theme ?? 'light',
    size: w.size ?? 'medium',
    launcherText: w.launcherText ?? '',
    showBranding: w.showBranding ?? true,
    autoOpen: w.autoOpen ?? false,
    suggestedQuestions: [...(w.suggestedQuestions ?? [])],
  };
};

const isHttp = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

export function AppearanceTab() {
  const { chatbot, updateChatbot } = useWorkspace();
  const source = useMemo(() => toDraft(chatbot), [chatbot]);
  const { draft: w, setDraft, patch, dirty, reset } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewDark, setPreviewDark] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const dark = w.theme === 'dark' || (w.theme === 'auto' && previewDark);
  const headerContrast = HEX_COLOR.test(w.headerBackground) && HEX_COLOR.test(w.headerTextColor) ? contrastRatio(w.headerBackground, w.headerTextColor) : 21;

  const validate = () => {
    const e: Record<string, string> = {};
    (['primaryColor', 'secondaryColor', 'headerBackground', 'headerTextColor'] as const).forEach((k) => {
      if (!HEX_COLOR.test(w[k])) e[`widget.${k}`] = 'Use a hex color such as #4f46e5';
    });
    if (w.avatarUrl.trim() && !isHttp(w.avatarUrl.trim())) e['widget.avatarUrl'] = 'Must be an http(s) URL';
    w.suggestedQuestions.forEach((q, i) => {
      if (!q.trim()) e[`widget.suggestedQuestions.${i}`] = 'Enter a question or remove this row';
      else if (q.length > 120) e[`widget.suggestedQuestions.${i}`] = 'Max 120 characters';
    });
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const widget: WidgetSettings = {
        ...w,
        title: w.title.trim(),
        subtitle: w.subtitle.trim(),
        avatarUrl: w.avatarUrl.trim(),
        launcherText: w.launcherText.trim(),
        suggestedQuestions: w.suggestedQuestions.map((q) => q.trim()).filter(Boolean),
      };
      const updated = await chatbotsApi.update(chatbot.id, { widget });
      updateChatbot(updated);
      setDraft(toDraft(updated));
      toast.success('Appearance saved', 'Embedded widgets pick up the new look on their next page load.');
    } catch (err) {
      setErrors(getFieldErrors(err));
      toast.error('Could not save appearance', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setQuestion = (i: number, v: string) => patch({ suggestedQuestions: w.suggestedQuestions.map((q, j) => (j === i ? v : q)) });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader icon={<Palette size={16} />} title="Branding" />
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Widget title" maxLength={80} value={w.title} onChange={(e) => patch({ title: e.target.value })} error={errors['widget.title']} placeholder={chatbot.name} />
              <Input label="Subtitle" maxLength={120} value={w.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} error={errors['widget.subtitle']} placeholder="We typically reply instantly" />
            </div>
            <Input
              label="Avatar / logo URL"
              type="url"
              value={w.avatarUrl}
              onChange={(e) => patch({ avatarUrl: e.target.value })}
              error={errors['widget.avatarUrl']}
              placeholder="https://example.com/logo.png"
              hint="Square image shown in the header. Leave empty to show the title's first letter."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorInput label="Primary color" value={w.primaryColor} onChange={(v) => patch({ primaryColor: v })} error={errors['widget.primaryColor']} />
              <ColorInput label="Secondary color" value={w.secondaryColor} onChange={(v) => patch({ secondaryColor: v })} error={errors['widget.secondaryColor']} />
              <ColorInput label="Header background" value={w.headerBackground} onChange={(v) => patch({ headerBackground: v })} error={errors['widget.headerBackground']} />
              <ColorInput label="Header text" value={w.headerTextColor} onChange={(v) => patch({ headerTextColor: v })} error={errors['widget.headerTextColor']} />
            </div>
            {headerContrast < 3 && (
              <p className="text-xs text-amber-700">Header text contrast is low ({headerContrast.toFixed(1)}:1). Aim for at least 4.5:1 so visitors can read the title.</p>
            )}
            <p className="text-xs text-zinc-500">Primary is used for the launcher, visitor messages and the send button; secondary highlights suggested questions.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Layout & behaviour" />
          <CardBody className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Position">
                <SegmentedControl<WidgetPosition>
                  aria-label="Position"
                  value={w.position}
                  onChange={(position) => patch({ position })}
                  options={[
                    { value: 'bottom-left', label: 'Bottom left' },
                    { value: 'bottom-right', label: 'Bottom right' },
                  ]}
                />
              </Field>
              <Field label="Size">
                <SegmentedControl<WidgetSize>
                  aria-label="Size"
                  value={w.size}
                  onChange={(size) => patch({ size })}
                  options={[
                    { value: 'small', label: 'Small' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                  ]}
                />
              </Field>
              <Field label="Theme">
                <SegmentedControl<WidgetTheme>
                  aria-label="Theme"
                  value={w.theme}
                  onChange={(theme) => patch({ theme })}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'auto', label: 'Auto' },
                  ]}
                />
              </Field>
              <RangeInput label="Corner radius" value={w.borderRadius} min={0} max={32} step={1} onChange={(v) => patch({ borderRadius: v })} format={(v) => `${v}px`} />
            </div>
            <Input
              label="Launcher text"
              maxLength={40}
              value={w.launcherText}
              onChange={(e) => patch({ launcherText: e.target.value })}
              error={errors['widget.launcherText']}
              placeholder="e.g. Chat with us"
              hint="Optional label next to the chat icon. Leave empty for an icon-only button."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 p-4">
                <Switch size="sm" checked={w.autoOpen} onChange={(autoOpen) => patch({ autoOpen })} label="Open automatically" description="Opens the chat window when the page loads." />
              </div>
              <div className="rounded-lg border border-zinc-200 p-4">
                <Switch size="sm" checked={w.showBranding} onChange={(showBranding) => patch({ showBranding })} label="Show branding" description='Shows "Powered by" under the input.' />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Suggested questions" description="Up to 6 one-tap questions shown under the welcome message." />
          <CardBody className="space-y-2">
            {w.suggestedQuestions.length === 0 && <p className="text-sm text-zinc-500">No suggested questions yet.</p>}
            {w.suggestedQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  containerClassName="flex-1"
                  value={q}
                  maxLength={120}
                  onChange={(e) => setQuestion(i, e.target.value)}
                  error={errors[`widget.suggestedQuestions.${i}`]}
                  placeholder="e.g. What are your shipping options?"
                  aria-label={`Suggested question ${i + 1}`}
                />
                <Button variant="ghost" iconOnly aria-label="Remove question" onClick={() => patch({ suggestedQuestions: w.suggestedQuestions.filter((_, j) => j !== i) })}>
                  <Trash size={15} />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={15} />}
              disabled={w.suggestedQuestions.length >= 6}
              onClick={() => patch({ suggestedQuestions: [...w.suggestedQuestions, ''] })}
            >
              Add question {w.suggestedQuestions.length >= 6 && '(max 6)'}
            </Button>
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0">
        <div className="lg:sticky lg:top-6">
          <Card>
            <CardHeader
              icon={<Eye size={16} />}
              title="Live preview"
              actions={
                <div className="flex flex-wrap gap-2">
                  {w.theme === 'auto' && (
                    <SegmentedControl
                      size="sm"
                      aria-label="Preview theme"
                      value={previewDark ? 'dark' : 'light'}
                      onChange={(v) => setPreviewDark(v === 'dark')}
                      options={[
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                      ]}
                    />
                  )}
                  <SegmentedControl
                    size="sm"
                    aria-label="Preview state"
                    value={previewOpen ? 'open' : 'closed'}
                    onChange={(v) => setPreviewOpen(v === 'open')}
                    options={[
                      { value: 'open', label: 'Open' },
                      { value: 'closed', label: 'Closed' },
                    ]}
                  />
                </div>
              }
            />
            <CardBody>
              <WidgetPreview settings={w} name={chatbot.name} welcomeMessage={chatbot.welcomeMessage} placeholder={chatbot.placeholder} dark={dark} open={previewOpen} />
              <p className="mt-3 text-xs text-zinc-500">
                {w.theme === 'auto' ? 'Auto follows the visitor’s system theme. ' : ''}Welcome message and placeholder are edited in the General tab. The sample
                exchange is illustrative.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="lg:col-span-2">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { reset(); setErrors({}); }} />
      </div>
    </div>
  );
}
