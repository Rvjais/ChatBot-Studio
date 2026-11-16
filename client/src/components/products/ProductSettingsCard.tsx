import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { chatbotsApi } from '../../services/chatbots';
import { toast } from '../../stores/toast';
import type { Chatbot, PriceGuardMode, ProductSettings } from '../../types/api';
import { getErrorMessage } from '../../utils/errors';
import { Button } from '../ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { RangeInput } from '../ui/Misc';
import { Switch } from '../ui/Switch';

export function ProductSettingsCard({ chatbot, onSaved }: { chatbot: Chatbot; onSaved: (c: Chatbot) => void }) {
  const [draft, setDraft] = useState<ProductSettings>(chatbot.productSettings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(chatbot.productSettings), [chatbot.productSettings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(chatbot.productSettings);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await chatbotsApi.update(chatbot.id, { productSettings: draft });
      onSaved(updated);
      toast.success('Product settings saved');
    } catch (err) {
      toast.error('Could not save product settings', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<Settings size={16} />} title="Product settings" />
      <CardBody className="space-y-5">
        <Switch
          checked={draft.allowBrowserProducts}
          onChange={(v) => setDraft({ ...draft, allowBrowserProducts: v })}
          label="Allow page-provided products"
          description="Use products passed in the embed config (window.AIChatbotConfig.products) as unverified page context."
        />
        <RangeInput
          label="Max products in context"
          value={draft.maxProductsInContext}
          min={1}
          max={50}
          step={1}
          onChange={(v) => setDraft({ ...draft, maxProductsInContext: v })}
          hint="How many matching products are given to the model per question."
        />
        <Select
          label="Price guard"
          value={draft.priceGuard}
          onChange={(e) => setDraft({ ...draft, priceGuard: e.target.value as PriceGuardMode })}
          hint={
            draft.priceGuard === 'append-notice'
              ? 'If an answer mentions a price that is not in any supplied record, a notice asking the visitor to confirm prices is appended.'
              : 'Unverified prices are only flagged in conversation metadata — the answer is not changed.'
          }
          options={[
            { value: 'append-notice', label: 'Append a notice to the answer' },
            { value: 'flag-only', label: 'Flag only (log in metadata)' },
          ]}
        />
      </CardBody>
      {dirty && (
        <CardFooter>
          <Button size="sm" onClick={() => setDraft(chatbot.productSettings)} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={save} loading={saving}>
            Save settings
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
