import { Plus, Trash } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Field';

export interface KeyValueRow {
  key: string;
  value: string;
  /** Existing entry whose value is write-only (not returned by the API). */
  locked?: boolean;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Name',
  valuePlaceholder = 'Value',
  addLabel = 'Add field',
  max = 30,
  errors,
  valueType = 'text',
  lockedValuePlaceholder = 'Saved — enter a new value to replace',
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  max?: number;
  errors?: Record<number, string>;
  valueType?: 'text' | 'password';
  lockedValuePlaceholder?: string;
}) {
  const update = (index: number, patch: Partial<KeyValueRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i}>
          <div className="flex items-start gap-2">
            <Input
              containerClassName="flex-1"
              placeholder={keyPlaceholder}
              value={row.key}
              aria-label={`${keyPlaceholder} ${i + 1}`}
              onChange={(e) => update(i, { key: e.target.value })}
              error={errors?.[i] ? ' ' : undefined}
            />
            <Input
              containerClassName="flex-[1.4]"
              type={valueType}
              autoComplete="off"
              placeholder={row.locked ? lockedValuePlaceholder : valuePlaceholder}
              value={row.value}
              aria-label={`${valuePlaceholder} ${i + 1}`}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <Button variant="ghost" iconOnly aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash size={15} />
            </Button>
          </div>
          {errors?.[i] && <p className="mt-1 text-xs font-medium text-red-600">{errors[i]}</p>}
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={15} />} disabled={rows.length >= max} onClick={() => onChange([...rows, { key: '', value: '' }])}>
        {addLabel}
      </Button>
    </div>
  );
}
