import { useState } from 'react';
import { KeyRound, RefreshCw, ServerCog, Trash } from 'lucide-react';
import { chatbotsApi } from '../../../services/chatbots';
import { toast } from '../../../stores/toast';
import type { Chatbot } from '../../../types/api';
import { formatDateTime, formatRelative } from '../../../utils/format';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { CodeBlock } from '../../ui/CodeBlock';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyButton } from '../../ui/CopyButton';
import { Modal } from '../../ui/Modal';
import { Callout } from '../../ui/States';

/** Product Sync API key management. The full key is only ever shown once, right after creation. */
export function SyncKeySection({ chatbot, apiBase, onChanged }: { chatbot: Chatbot; apiBase: string; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const key = chatbot.syncKey;

  const create = async () => {
    const result = await chatbotsApi.createSyncKey(chatbot.id);
    setNewKey(result.key);
    onChanged();
  };

  const createNow = async () => {
    setCreating(true);
    try {
      await create();
    } catch (err) {
      toast.error('Could not create a sync key', err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  const curl = `curl -X POST "${apiBase}/api/v1/sync/products" \\
  -H "Authorization: Bearer ${newKey ?? 'cbsk_YOUR_SYNC_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "upsert",
    "products": [
      { "id": "P001", "name": "Wireless Headphones", "price": 2499, "currency": "INR",
        "availability": "In Stock", "category": "Electronics", "url": "https://example.com/headphones" }
    ]
  }'`;

  return (
    <Card id="sync">
      <CardHeader
        icon={<ServerCog size={16} />}
        title="Product Sync API"
        description="For large catalogs, push products from your server instead of the browser. Synced products are verified data."
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3">
          {key ? (
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-medium text-zinc-900">
                <KeyRound size={15} className="text-emerald-600" /> Sync key active <span className="font-mono text-zinc-500">{key.prefix}</span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Created {formatDateTime(key.createdAt)} · {key.lastUsedAt ? `last used ${formatRelative(key.lastUsedAt)}` : 'never used'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No sync key yet. Create one to authenticate server-to-server requests.</p>
          )}
          <div className="flex gap-2">
            {key ? (
              <>
                <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => setConfirmRotate(true)}>
                  Rotate
                </Button>
                <Button size="sm" variant="danger-ghost" icon={<Trash size={14} />} onClick={() => setConfirmRevoke(true)}>
                  Revoke
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" icon={<KeyRound size={14} />} onClick={createNow} loading={creating}>
                Create sync key
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm leading-relaxed text-zinc-600">
          <p>
            <code className="font-mono text-xs">POST /api/v1/sync/products</code> accepts up to 5,000 products (10 MB) per call. Use{' '}
            <code className="font-mono text-xs">"mode": "replace"</code> to make the catalog match exactly what you send, or <code className="font-mono text-xs">"upsert"</code>{' '}
            to add and update. <code className="font-mono text-xs">GET</code> lists synced products and{' '}
            <code className="font-mono text-xs">DELETE /api/v1/sync/products/:productId</code> removes one.
          </p>
          <p>Keep the key on your server — never put it in website code.</p>
        </div>
        <CodeBlock title="Sync products with curl" language="bash" code={curl} />
      </CardBody>

      <Modal
        open={Boolean(newKey)}
        onClose={() => setNewKey(null)}
        title="Your new sync key"
        description="Copy it now — for security it will not be shown again."
        footer={
          <Button variant="primary" onClick={() => setNewKey(null)}>
            I have stored the key
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <code className="min-w-0 flex-1 font-mono text-xs break-all text-zinc-900">{newKey}</code>
            <CopyButton text={newKey ?? ''} />
          </div>
          <Callout tone="warning">Anyone with this key can change this chatbot's product catalog. Store it in your server's secrets, not in client-side code.</Callout>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        tone="primary"
        title="Rotate sync key?"
        confirmLabel="Create new key"
        description="A new key is generated and the current one stops working immediately. Update your integration with the new key."
        onConfirm={create}
      />
      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        title="Revoke sync key?"
        confirmLabel="Revoke key"
        description="Integrations using this key will stop being able to sync products. Existing products are kept."
        onConfirm={async () => {
          await chatbotsApi.revokeSyncKey(chatbot.id);
          toast.success('Sync key revoked');
          onChanged();
        }}
      />
    </Card>
  );
}
