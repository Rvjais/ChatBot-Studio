import { useState, type FormEvent } from 'react';
import { FlaskConical, Search } from 'lucide-react';
import { knowledgeApi } from '../../services/knowledge';
import type { KnowledgeSearchResult } from '../../types/api';
import { getErrorMessage } from '../../utils/errors';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/Field';
import { Callout } from '../ui/States';

const MODE_LABEL: Record<KnowledgeSearchResult['mode'], string> = {
  hybrid: 'Hybrid (vector + keyword)',
  keyword: 'Keyword only',
  none: 'No retrieval',
};

/** Runs retrieval exactly as a chat would, so owners can see what the bot will "read". */
export function RetrievalTest({ chatbotId }: { chatbotId: string }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await knowledgeApi.search(chatbotId, query.trim()));
    } catch (err) {
      setError(getErrorMessage(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<FlaskConical size={16} />} title="Test retrieval" description="Ask a question to see which chunks would be given to the model." />
      <CardBody className="space-y-4">
        <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
          <Input
            containerClassName="flex-1"
            value={query}
            maxLength={1000}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What is your return policy?"
            leading={<Search size={15} />}
            aria-label="Test question"
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!query.trim()}>
            Search
          </Button>
        </form>
        {error && <Callout tone="error">{error}</Callout>}
        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <Badge tone={result.mode === 'hybrid' ? 'green' : result.mode === 'keyword' ? 'amber' : 'gray'}>{MODE_LABEL[result.mode]}</Badge>
              <span>
                {result.chunks.length} matching chunk{result.chunks.length === 1 ? '' : 's'}
              </span>
            </div>
            {result.warning && <Callout tone="warning">{result.warning}</Callout>}
            {result.chunks.length === 0 ? (
              <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                Nothing relevant found. The bot would answer from its instructions (or the fallback message in strict mode).
              </p>
            ) : (
              <ol className="space-y-2">
                {result.chunks.map((c, i) => (
                  <li key={c.chunkId} className="rounded-lg border border-zinc-200">
                    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50/70 px-3 py-1.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">#{i + 1}</span>
                      <span className="max-w-[260px] truncate font-medium text-zinc-800" title={c.fileName}>
                        {c.fileName ?? 'Unknown source'}
                      </span>
                      {c.page !== undefined && c.page !== null && <span>Page {c.page}</span>}
                      {c.sheet && <span>Sheet {c.sheet}</span>}
                      <span className="ml-auto flex items-center gap-1.5">
                        {typeof c.similarity === 'number' && <span className="tabular">similarity {c.similarity.toFixed(3)}</span>}
                        {c.via.map((v) => (
                          <Badge key={v} tone={v === 'vector' ? 'violet' : 'blue'}>
                            {v}
                          </Badge>
                        ))}
                      </span>
                    </div>
                    <p className="chat-text max-h-40 overflow-y-auto px-3 py-2 text-[13px] leading-relaxed text-zinc-700">{c.content}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
