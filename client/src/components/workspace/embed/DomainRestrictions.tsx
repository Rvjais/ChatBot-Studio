import { useEffect, useState, type FormEvent } from 'react';
import { Globe, Plus, ShieldCheck, X } from 'lucide-react';
import { chatbotsApi } from '../../../services/chatbots';
import { toast } from '../../../stores/toast';
import type { Chatbot } from '../../../types/api';
import { getErrorMessage, getFieldErrors } from '../../../utils/errors';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '../../ui/Card';
import { Input } from '../../ui/Field';
import { Callout } from '../../ui/States';
import { Switch } from '../../ui/Switch';

/** Mirrors the server's normalizeDomainEntry(): strips scheme/path, lowercases, validates. */
export function normalizeDomain(entry: string): string | null {
  let v = entry.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '');
  if (!/^(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/.test(v)) return null;
  if (v.startsWith('.') || v.endsWith('.') || v.includes('..')) return null;
  return v;
}

export function DomainRestrictions({ chatbot, onSaved }: { chatbot: Chatbot; onSaved: (c: Chatbot) => void }) {
  const [enabled, setEnabled] = useState(chatbot.domainRestrictionEnabled);
  const [domains, setDomains] = useState<string[]>(chatbot.allowedDomains);
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(chatbot.domainRestrictionEnabled);
    setDomains(chatbot.allowedDomains);
  }, [chatbot.domainRestrictionEnabled, chatbot.allowedDomains]);

  const dirty = enabled !== chatbot.domainRestrictionEnabled || JSON.stringify(domains) !== JSON.stringify(chatbot.allowedDomains);

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const parts = entry.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return;
    const next = [...domains];
    for (const p of parts) {
      const d = normalizeDomain(p);
      if (!d) {
        setEntryError(`"${p}" is not a valid domain. Use formats like example.com, *.example.com or localhost:3000.`);
        return;
      }
      if (!next.includes(d)) next.push(d);
    }
    if (next.length > 50) {
      setEntryError('At most 50 domains');
      return;
    }
    setDomains(next);
    setEntry('');
    setEntryError(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await chatbotsApi.update(chatbot.id, { domainRestrictionEnabled: enabled, allowedDomains: domains });
      onSaved(updated);
      toast.success('Domain restrictions saved');
    } catch (err) {
      const fe = getFieldErrors(err);
      toast.error('Could not save domain restrictions', fe.allowedDomains ?? getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="domains">
      <CardHeader icon={<ShieldCheck size={16} />} title="Website domain restrictions" description="Limit which websites may load and use this chatbot." />
      <CardBody className="space-y-5">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Only allow listed domains"
          description="When on, widget requests from other sites are rejected."
        />
        <div className="space-y-3">
          <form onSubmit={add} className="flex items-start gap-2">
            <Input
              containerClassName="flex-1"
              value={entry}
              onChange={(e) => {
                setEntry(e.target.value);
                setEntryError(null);
              }}
              placeholder="example.com, *.example.com, shop.example.com, localhost:3000"
              leading={<Globe size={15} />}
              error={entryError ?? undefined}
              aria-label="Domain to allow"
            />
            <Button type="submit" icon={<Plus size={15} />} disabled={!entry.trim()}>
              Add
            </Button>
          </form>
          {domains.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {domains.map((d) => (
                <li key={d} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pr-1 pl-2.5 font-mono text-xs text-zinc-800">
                  {d}
                  <button
                    type="button"
                    onClick={() => setDomains(domains.filter((x) => x !== d))}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                    aria-label={`Remove ${d}`}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No domains added.</p>
          )}
        </div>
        {enabled && domains.length === 0 && (
          <Callout tone="error" title="All websites will be blocked">
            Restriction is on but the list is empty, so the widget will not work on any site. Add at least one domain.
          </Callout>
        )}
        <div className="grid gap-3 text-xs leading-relaxed text-zinc-600 sm:grid-cols-2">
          <ul className="space-y-1">
            <li>
              <code className="font-mono text-zinc-800">example.com</code> — also matches www.example.com
            </li>
            <li>
              <code className="font-mono text-zinc-800">*.example.com</code> — any subdomain (and the apex)
            </li>
            <li>
              <code className="font-mono text-zinc-800">shop.example.com</code> — that exact host
            </li>
            <li>
              <code className="font-mono text-zinc-800">localhost:3000</code> — host with a specific port
            </li>
          </ul>
          <p className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            Restrictions rely on the browser's <code className="font-mono">Origin</code> header. They stop other websites from embedding your chatbot, but non-browser
            scripts can forge headers — rate limits remain the backstop against abuse.
          </p>
        </div>
      </CardBody>
      {dirty && (
        <CardFooter>
          <Button
            size="sm"
            onClick={() => {
              setEnabled(chatbot.domainRestrictionEnabled);
              setDomains(chatbot.allowedDomains);
            }}
            disabled={saving}
          >
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={save} loading={saving}>
            Save restrictions
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
