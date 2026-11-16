import { useEffect, useState } from 'react';
import { productsApi, type ProductInputBody } from '../../services/products';
import { toast } from '../../stores/toast';
import type { Product } from '../../types/api';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { KeyValueEditor, type KeyValueRow } from '../ui/KeyValueEditor';
import { Modal } from '../ui/Modal';
import { Callout } from '../ui/States';

/**
 * Field names the server maps onto standard product fields (case/spacing-insensitive). Custom fields
 * are sent as top-level keys, so they must not collide with these or they would overwrite a standard field.
 */
const RESERVED = new Set(
  [
    'productid id sku productcode code itemid itemcode variantid',
    'name title productname product itemname producttitle',
    'price saleprice sellingprice currentprice amount cost mrp listprice',
    'currency currencycode curr',
    'description desc details summary shortdescription bodyhtml body',
    'availability stockstatus instock stock inventory available status quantity qty',
    'category categories type producttype collection department',
    'producturl url link productlink permalink href',
    'imageurl image img thumbnail picture imagelink featuredimage',
    'additionalfields',
  ]
    .join(' ')
    .split(' '),
);
const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

interface FormState {
  productId: string;
  name: string;
  price: string;
  currency: string;
  availability: string;
  category: string;
  productUrl: string;
  imageUrl: string;
  description: string;
  extra: KeyValueRow[];
}

const empty: FormState = {
  productId: '',
  name: '',
  price: '',
  currency: '',
  availability: '',
  category: '',
  productUrl: '',
  imageUrl: '',
  description: '',
  extra: [],
};

const fromProduct = (p: Product): FormState => ({
  productId: p.productId,
  name: p.name,
  price: p.price === null ? '' : String(p.price),
  currency: p.currency ?? '',
  availability: p.availability ?? '',
  category: p.category ?? '',
  productUrl: p.productUrl ?? '',
  imageUrl: p.imageUrl ?? '',
  description: p.description ?? '',
  // Reserved names duplicate a standard field (the server currently also copies "availability" into
  // additionalFields), so they are not editable here — the standard field above is the source of truth.
  extra: Object.entries(p.additionalFields ?? {})
    .filter(([key]) => !RESERVED.has(normKey(key)))
    .map(([key, value]) => ({ key, value: String(value) })),
});

const coerce = (v: string): string | number | boolean => {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t) && t.length < 16) return Number(t);
  if (t === 'true' || t === 'false') return t === 'true';
  return v;
};

const isHttp = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

export function ProductFormModal({
  chatbotId,
  product,
  open,
  onClose,
  onSaved,
}: {
  chatbotId: string;
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (open) {
      setForm(product ? fromProduct(product) : empty);
      setErrors({});
      setError(null);
    }
  }, [open, product]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.price.trim() && !/\d/.test(form.price)) e.price = 'Enter a number, e.g. 2499 or 19.99';
    if (form.currency.trim() && !/^[A-Za-z]{3}$/.test(form.currency.trim())) e.currency = 'Use a 3-letter code such as USD or INR';
    if (form.productUrl.trim() && !isHttp(form.productUrl.trim())) e.productUrl = 'Must be an http(s) URL';
    if (form.imageUrl.trim() && !isHttp(form.imageUrl.trim())) e.imageUrl = 'Must be an http(s) URL';
    const seen = new Set<string>();
    form.extra.forEach((r, i) => {
      const k = r.key.trim();
      if (!k && !r.value.trim()) return;
      if (!k) e[`extra.${i}`] = 'Enter a field name';
      else if (k.includes('.') || k.startsWith('$')) e[`extra.${i}`] = 'Field names cannot contain "." or start with "$"';
      else if (RESERVED.has(normKey(k))) e[`extra.${i}`] = `"${k}" is reserved for a standard product field — use the field above or another name`;
      else if (seen.has(normKey(k))) e[`extra.${i}`] = 'Duplicate field name';
      seen.add(normKey(k));
    });
    if (form.extra.filter((r) => r.key.trim()).length > 30) e.extra = 'At most 30 additional fields';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: ProductInputBody = { name: form.name.trim() };
    if (form.productId.trim()) body.productId = form.productId.trim();
    if (form.price.trim()) body.price = /^\d+(\.\d+)?$/.test(form.price.trim()) ? Number(form.price.trim()) : form.price.trim();
    if (form.currency.trim()) body.currency = form.currency.trim().toUpperCase();
    if (form.availability.trim()) body.availability = form.availability.trim();
    if (form.category.trim()) body.category = form.category.trim();
    if (form.productUrl.trim()) body.productUrl = form.productUrl.trim();
    if (form.imageUrl.trim()) body.imageUrl = form.imageUrl.trim();
    if (form.description.trim()) body.description = form.description.trim();
    for (const r of form.extra) {
      if (r.key.trim() && r.value.trim()) body[r.key.trim()] = coerce(r.value);
    }
    setBusy(true);
    setError(null);
    try {
      const saved = product ? await productsApi.update(chatbotId, product.id, body) : await productsApi.create(chatbotId, body);
      toast.success(product ? 'Product updated' : 'Product added', saved.name);
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const extraErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('extra.'))
      .map(([k, v]) => [Number(k.slice(6)), v]),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={product ? 'Edit product' : 'Add product'}
      description="Prices, stock and IDs given to the chatbot come only from these records."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {product ? 'Save product' : 'Add product'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Input
            label="Product ID / SKU"
            maxLength={128}
            value={form.productId}
            onChange={(e) => set({ productId: e.target.value })}
            error={errors.productId}
            placeholder="P001"
            hint={product ? undefined : 'Generated from the name if empty.'}
            className="font-mono"
          />
          <Input label="Name" required maxLength={300} value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} placeholder="Wireless Headphones" data-autofocus />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Price" inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} error={errors.price} placeholder="2499" />
          <Input
            label="Currency"
            maxLength={3}
            value={form.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
            error={errors.currency}
            placeholder="INR"
            className="uppercase"
          />
          <Input
            label="Availability"
            list="availability-options"
            maxLength={100}
            value={form.availability}
            onChange={(e) => set({ availability: e.target.value })}
            error={errors.availability}
            placeholder="In Stock"
          />
          <datalist id="availability-options">
            <option value="In Stock" />
            <option value="Out of Stock" />
            <option value="Pre-order" />
            <option value="Only a few left" />
          </datalist>
        </div>
        <Input label="Category" maxLength={200} value={form.category} onChange={(e) => set({ category: e.target.value })} error={errors.category} placeholder="Electronics" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Product URL" type="url" value={form.productUrl} onChange={(e) => set({ productUrl: e.target.value })} error={errors.productUrl} placeholder="https://example.com/headphones" />
          <Input label="Image URL" type="url" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} error={errors.imageUrl} placeholder="https://example.com/headphones.jpg" />
        </div>
        <Textarea label="Description" rows={3} maxLength={5000} value={form.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />
        <Field label="Additional fields" hint="Extra attributes such as color, warranty or brand. They are shown to the chatbot with the product." error={errors.extra}>
          <KeyValueEditor rows={form.extra} onChange={(extra) => set({ extra })} keyPlaceholder="Field (e.g. color)" valuePlaceholder="Value" errors={extraErrors} max={30} />
        </Field>
        {error && <Callout tone="error">{error}</Callout>}
      </div>
    </Modal>
  );
}
