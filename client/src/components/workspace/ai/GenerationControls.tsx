import type { Effort, GenerationSettings, ParamRange, ProviderDefinition } from '../../../types/api';
import { formatNumber } from '../../../utils/format';
import { NumberInput, Select } from '../../ui/Field';
import { RangeInput } from '../../ui/Misc';
import { Callout } from '../../ui/States';
import { Switch } from '../../ui/Switch';

type SamplingKey = 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty';

const PARAMS: { key: SamplingKey; label: string; help: string }[] = [
  { key: 'temperature', label: 'Temperature', help: 'Higher values make answers more varied; lower values more focused and deterministic.' },
  { key: 'topP', label: 'Top P', help: 'Nucleus sampling: only tokens within this cumulative probability are considered.' },
  { key: 'frequencyPenalty', label: 'Frequency penalty', help: 'Positive values discourage repeating the same words.' },
  { key: 'presencePenalty', label: 'Presence penalty', help: 'Positive values encourage introducing new topics.' },
];

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low — fastest, cheapest',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max — most thorough',
};

function SamplingRow({
  label,
  help,
  range,
  value,
  onChange,
}: {
  label: string;
  help: string;
  range: ParamRange;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const fallback = range.default ?? range.min;
  const decimals = range.step < 0.1 ? 2 : 1;
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <Switch
        size="sm"
        checked={value !== null}
        onChange={(on) => onChange(on ? fallback : null)}
        label={label}
        description={value === null ? `Provider default${range.default !== undefined ? ` (${range.default})` : ''}. ${help}` : help}
      />
      {value !== null && (
        <div className="mt-3">
          <RangeInput label={<span className="sr-only">{label} value</span>} value={value} min={range.min} max={range.max} step={range.step} onChange={onChange} format={(v) => v.toFixed(decimals)} />
        </div>
      )}
    </div>
  );
}

/** Renders only the parameters the selected provider accepts, using its ranges. */
export function GenerationControls({
  provider,
  value,
  onChange,
  refusalFallback,
  onRefusalFallbackChange,
  modelMaxOutput,
  errors,
}: {
  provider: ProviderDefinition;
  value: GenerationSettings;
  onChange: (patch: Partial<GenerationSettings>) => void;
  refusalFallback: boolean;
  onRefusalFallbackChange: (v: boolean) => void;
  modelMaxOutput?: number;
  errors: Record<string, string>;
}) {
  const limit = Math.min(provider.maxOutputTokensLimit, modelMaxOutput ?? Infinity, 128_000);
  const sampling = PARAMS.filter((p) => provider.supports[p.key]);
  const unsupported = PARAMS.filter((p) => !provider.supports[p.key]).map((p) => p.label.toLowerCase());

  return (
    <div className="space-y-5">
      <NumberInput
        label="Max output tokens"
        min={16}
        max={limit}
        step={1}
        value={value.maxOutputTokens}
        onValueChange={(v) => onChange({ maxOutputTokens: v ?? 16 })}
        error={errors['generation.maxOutputTokens']}
        hint={`Upper limit for each answer (16 – ${formatNumber(limit)}${modelMaxOutput ? ', limited by the selected model' : ` for ${provider.name}`}).`}
        containerClassName="max-w-xs"
      />

      {sampling.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {sampling.map((p) => (
            <SamplingRow
              key={p.key}
              label={p.label}
              help={p.help}
              range={provider.supports[p.key]!}
              value={value[p.key]}
              onChange={(v) => onChange({ [p.key]: v } as Partial<GenerationSettings>)}
            />
          ))}
        </div>
      )}

      {provider.supports.effort && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Select
            label="Effort"
            value={value.effort ?? ''}
            onChange={(e) => onChange({ effort: (e.target.value || null) as Effort | null })}
            hint="Controls how much thinking and detail Claude puts into each answer."
          >
            <option value="">Provider default</option>
            {provider.supports.effort.map((level) => (
              <option key={level} value={level}>
                {EFFORT_LABELS[level] ?? level}
              </option>
            ))}
          </Select>
          <div className="rounded-lg border border-zinc-200 p-4">
            <Switch
              size="sm"
              checked={refusalFallback}
              onChange={onRefusalFallbackChange}
              label="Refusal fallback"
              description="If the model declines a request, let the API retry it once on a fallback model."
            />
          </div>
        </div>
      )}

      {unsupported.length > 0 && (
        <Callout tone="neutral">
          {provider.id === 'anthropic'
            ? "Anthropic's current Messages API does not accept temperature or top-p — response depth is controlled with Effort instead."
            : `${provider.name} does not support ${unsupported.join(', ')}, so ${unsupported.length > 1 ? 'they are' : 'it is'} hidden.`}
        </Callout>
      )}
    </div>
  );
}
