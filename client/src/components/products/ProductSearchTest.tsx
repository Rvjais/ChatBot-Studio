import { useState, type FormEvent } from 'react';
import { ChevronDown, FlaskConical, Search } from 'lucide-react';
import { productsApi } from '../../services/products';
import type { ContextProduct, ProductSearchTestResult } from '../../types/api';
import { getErrorMessage } from '../../utils/errors';
import { formatPrice } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input, Textarea } from '../ui/Field';
import { Callout } from '../ui/States';

function ProductList({ items, tone }: { items: ContextProduct[]; tone: 'green' | 'amber' }) {
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {items.map((p) => (
        <li key={`${p.source}-${p.productId}`} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
            <p className="truncate text-xs text-zinc-500">
              <span className="font-mono">{p.productId}</span>
              {p.category ? ` · ${p.category}` : ''}
              {p.availability ? ` · ${p.availability}` : ''}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="tabular text-sm font-medium text-zinc-900">{formatPrice(p.price, p.currency)}</span>
            <Badge tone={tone}>{p.source === 'verified' ? 'Verified' : 'Page'}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

const SAMPLE_PAGE_PRODUCTS = `[
  { "id": "PAGE-1", "name": "Demo Travel Mug", "price": 799, "currency": "INR", "category": "Kitchen" }
]`;

export function ProductSearchTest({ chatbotId }: { chatbotId: string }) {
  const [query, setQuery] = useState('');
  const [showPage, setShowPage] = useState(false);
  const [pageJson, setPageJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [result, setResult] = useState<ProductSearchTestResult | null>(null);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    let pageProducts: unknown[] | undefined;
    setJsonError(null);
    if (showPage && pageJson.trim()) {
      try {
        const parsed: unknown = JSON.parse(pageJson);
        if (!Array.isArray(parsed)) throw new Error('Page products must be a JSON array');
        pageProducts = parsed;
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await productsApi.searchTest(chatbotId, query.trim(), pageProducts));
    } catch (err) {
      setError(getErrorMessage(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const q = result?.interpretedQuery;
  const range = result?.summary.priceRange;

  return (
    <Card>
      <CardHeader icon={<FlaskConical size={16} />} title="Test product retrieval" description="See which product records a question would put in front of the model." />
      <CardBody className="space-y-4">
        <form onSubmit={run} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              containerClassName="flex-1"
              value={query}
              maxLength={1000}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. headphones under 3000"
              leading={<Search size={15} />}
              aria-label="Test question"
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!query.trim()}>
              Test
            </Button>
          </div>
          <button type="button" onClick={() => setShowPage((s) => !s)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            <ChevronDown size={14} className={showPage ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {showPage ? 'Hide' : 'Add'} page-provided products (optional)
          </button>
          {showPage && (
            <Textarea
              rows={5}
              value={pageJson}
              onChange={(e) => setPageJson(e.target.value)}
              placeholder={SAMPLE_PAGE_PRODUCTS}
              className="font-mono text-xs"
              error={jsonError ?? undefined}
              hint="Simulates window.AIChatbotConfig.products on a page (a JSON array)."
            />
          )}
        </form>
        {error && <Callout tone="error">{error}</Callout>}
        {result && q && (
          <div className="space-y-4">
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200 ring-inset">
              <p className="mb-1.5 font-medium text-zinc-800">Interpreted query</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={q.productIntent ? 'green' : 'gray'}>{q.productIntent ? 'Product question' : 'No product intent'}</Badge>
                {(q.priceMin !== undefined || q.priceMax !== undefined) && (
                  <Badge tone="blue">
                    Price {q.priceMin !== undefined ? `≥ ${q.priceMin}` : ''}
                    {q.priceMin !== undefined && q.priceMax !== undefined ? ' and ' : ''}
                    {q.priceMax !== undefined ? `≤ ${q.priceMax}` : ''}
                  </Badge>
                )}
                {q.sort && <Badge tone="blue">{q.sort === 'price_asc' ? 'Cheapest first' : 'Most expensive first'}</Badge>}
                {q.categories.map((c) => (
                  <Badge key={c} tone="violet">
                    Category: {c}
                  </Badge>
                ))}
                {q.idCandidates.map((c) => (
                  <Badge key={c} tone="gray">
                    ID: {c}
                  </Badge>
                ))}
                {q.terms.length > 0 && <Badge tone="gray">Terms: {q.terms.join(', ')}</Badge>}
              </div>
              <p className="mt-2">
                Catalog: {result.summary.totalProducts} products · {result.summary.categories.length} categories
                {range ? ` · prices ${formatPrice(range.min, range.currency)} – ${formatPrice(range.max, range.currency)}` : ''}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-800">Verified matches ({result.verified.length})</p>
              {result.verified.length ? (
                <ProductList items={result.verified} tone="green" />
              ) : (
                <p className="rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500">No catalog products match this question.</p>
              )}
            </div>
            {(showPage || result.page.length > 0) && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-zinc-800">Page matches ({result.page.length})</p>
                {result.page.length ? (
                  <ProductList items={result.page} tone="amber" />
                ) : (
                  <p className="rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500">No page-provided products match.</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
