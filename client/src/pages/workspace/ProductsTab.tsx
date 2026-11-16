import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Globe, Package, Pencil, Plus, ServerCog, Trash, Upload } from 'lucide-react';
import { ImportProductsModal } from '../../components/products/ImportProductsModal';
import { ProductFormModal } from '../../components/products/ProductFormModal';
import { ProductSearchTest } from '../../components/products/ProductSearchTest';
import { ProductSettingsCard } from '../../components/products/ProductSettingsCard';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  SearchInput,
  Select,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '../../components/ui';
import { useWorkspace } from '../../components/workspace/context';
import { useAsync } from '../../hooks/useAsync';
import { useDebouncedValue } from '../../hooks/useDebounce';
import { productsApi } from '../../services/products';
import { toast } from '../../stores/toast';
import type { Product } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatNumber, formatPrice, formatRelative } from '../../utils/format';

const PAGE_SIZE = 25;
const SOURCE_TONE = { upload: 'blue', manual: 'gray', sync: 'violet' } as const;

function availabilityTone(a: string | null): 'green' | 'red' | 'amber' | 'gray' {
  if (!a) return 'gray';
  if (/out of stock|unavailable|sold out/i.test(a)) return 'red';
  if (/in stock|available/i.test(a)) return 'green';
  return 'amber';
}

export function ProductsTab() {
  const { chatbot, updateChatbot } = useWorkspace();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState('');

  const query = useMemo(() => ({ q: q || undefined, category: category || undefined, page, limit: PAGE_SIZE }), [q, category, page]);
  const list = useAsync(() => productsApi.list(chatbot.id, query), [chatbot.id, query]);
  const categories = useAsync(() => productsApi.categories(chatbot.id), [chatbot.id]);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtered = Boolean(q || category);

  const refreshAll = () => {
    void list.reload();
    void categories.reload();
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader
            icon={<Package size={16} />}
            title="Product catalog"
            description={list.data ? `${formatNumber(filtered ? total : total)} ${filtered ? 'matching ' : ''}product${total === 1 ? '' : 's'} — verified data the bot can quote.` : 'Verified product data the bot can quote.'}
            actions={
              <>
                <Button size="sm" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add product
                </Button>
              </>
            }
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search name, ID or description"
              className="w-full sm:w-72"
            />
            <Select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              containerClassName="w-full sm:w-52"
              options={[{ value: '', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c, label: c }))]}
            />
            {total > 0 && !filtered && (
              <Button
                size="sm"
                variant="danger-ghost"
                className="sm:ml-auto"
                icon={<Trash size={14} />}
                onClick={() => {
                  setDeleteAllText('');
                  setDeleteAllOpen(true);
                }}
              >
                Delete all
              </Button>
            )}
          </div>
          {list.loading ? (
            <div className="p-5">
              <SkeletonRows rows={5} />
            </div>
          ) : list.error && !list.data ? (
            <ErrorState error={list.error} onRetry={list.reload} compact />
          ) : items.length === 0 ? (
            filtered ? (
              <EmptyState
                compact
                icon={<Package size={22} />}
                title="No products match"
                description="Try another search term or category."
                action={
                  <Button
                    onClick={() => {
                      setSearch('');
                      setCategory('');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={<Package size={22} />}
                title="No products yet"
                description="Import a JSON, CSV or Excel file, add products by hand, or sync them from your store with the Product Sync API."
                action={
                  <>
                    <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
                      Import file
                    </Button>
                    <Button
                      variant="primary"
                      icon={<Plus size={15} />}
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      Add product
                    </Button>
                  </>
                }
              />
            )
          ) : (
            <div className={cn('transition-opacity', list.refreshing && 'opacity-60')}>
              <Table minWidth={860}>
                <THead>
                  <tr>
                    <TH>Product</TH>
                    <TH>ID</TH>
                    <TH className="text-right">Price</TH>
                    <TH>Availability</TH>
                    <TH>Category</TH>
                    <TH>Source</TH>
                    <TH>Updated</TH>
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((p) => (
                    <TR key={p.id}>
                      <TD className="max-w-[240px]">
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-zinc-200" loading="lazy" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
                              <Package size={16} />
                            </span>
                          )}
                          <div className="min-w-0">
                            {p.productUrl ? (
                              <a href={p.productUrl} target="_blank" rel="noreferrer" className="block truncate font-medium text-zinc-900 hover:text-brand-700" title={p.name}>
                                {p.name}
                              </a>
                            ) : (
                              <p className="truncate font-medium text-zinc-900" title={p.name}>
                                {p.name}
                              </p>
                            )}
                            {p.description && <p className="truncate text-xs text-zinc-500">{p.description}</p>}
                          </div>
                        </div>
                      </TD>
                      <TD className="max-w-[120px] truncate font-mono text-xs text-zinc-600" title={p.productId}>
                        {p.productId}
                      </TD>
                      <TD className="tabular text-right font-medium whitespace-nowrap text-zinc-900">{formatPrice(p.price, p.currency)}</TD>
                      <TD>{p.availability ? <Badge tone={availabilityTone(p.availability)}>{p.availability}</Badge> : <span className="text-zinc-400">—</span>}</TD>
                      <TD className="max-w-[140px] truncate text-zinc-600">{p.category ?? '—'}</TD>
                      <TD>
                        <Badge tone={SOURCE_TONE[p.source] ?? 'gray'}>{p.source}</Badge>
                      </TD>
                      <TD className="text-xs whitespace-nowrap text-zinc-500">{formatRelative(p.updatedAt)}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <Button
                          size="xs"
                          variant="ghost"
                          iconOnly
                          aria-label="Edit product"
                          title="Edit"
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button size="xs" variant="danger-ghost" iconOnly aria-label="Delete product" title="Delete" onClick={() => setDeleting(p)}>
                          <Trash size={14} />
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="border-t border-zinc-100 px-5 py-3">
                <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="products" />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Two ways to give the chatbot product data" description="Both can be used together — verified records always take priority." />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <ServerCog size={16} className="text-brand-600" /> Dashboard upload / Sync API
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                Products imported here or pushed from your server with the <Link to={`/chatbots/${chatbot.id}/embed#sync`} className="font-medium text-brand-600 hover:underline">Product Sync API</Link> are{' '}
                <strong>verified</strong>. Prices, stock and IDs in answers come from these records, and answers mentioning other prices are flagged.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Globe size={16} className="text-amber-600" /> Page-provided (embed config)
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                Pass the products visible on a page in <code className="rounded bg-zinc-100 px-1 font-mono text-xs">window.AIChatbotConfig.products</code>. They are
                treated as <strong>unverified</strong> browser context, limited in count and size — see the{' '}
                <Link to={`/chatbots/${chatbot.id}/embed`} className="font-medium text-brand-600 hover:underline">Embed tab</Link>.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ProductSettingsCard chatbot={chatbot} onSaved={updateChatbot} />
        <ProductSearchTest chatbotId={chatbot.id} />
      </div>

      <ProductFormModal chatbotId={chatbot.id} product={editing} open={formOpen} onClose={() => setFormOpen(false)} onSaved={refreshAll} />
      <ImportProductsModal chatbotId={chatbot.id} open={importOpen} onClose={() => setImportOpen(false)} onImported={refreshAll} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete product?"
        confirmLabel="Delete product"
        description={
          <>
            <strong className="text-zinc-900">{deleting?.name}</strong> ({deleting?.productId}) will be removed from the catalog.
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          await productsApi.remove(chatbot.id, deleting.id);
          toast.success('Product deleted', deleting.name);
          refreshAll();
        }}
      />
      <ConfirmDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title="Delete all products?"
        confirmLabel="Delete all products"
        confirmDisabled={deleteAllText !== 'DELETE'}
        description={<>This removes all {formatNumber(total)} products of this chatbot, including synced ones. This cannot be undone.</>}
        onConfirm={async () => {
          const deleted = await productsApi.removeAll(chatbot.id);
          toast.success('Catalog cleared', `${formatNumber(deleted)} products deleted.`);
          setPage(1);
          refreshAll();
        }}
      >
        <Input label={<>Type <span className="font-mono">DELETE</span> to confirm</>} value={deleteAllText} onChange={(e) => setDeleteAllText(e.target.value)} autoComplete="off" />
      </ConfirmDialog>
    </div>
  );
}
