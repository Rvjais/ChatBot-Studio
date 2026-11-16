import { slugify } from '../../utils/text.js';

/** Canonical product shape used by imports, the sync API, manual edits and browser-supplied data. */
export interface ProductInput {
  productId: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  category?: string;
  productUrl?: string;
  imageUrl?: string;
  additionalFields?: Record<string, string | number | boolean>;
}

export interface NormalizeLimits {
  maxDescription: number;
  maxAdditionalFields: number;
  maxFieldValue: number;
}

export const DEFAULT_LIMITS: NormalizeLimits = { maxDescription: 5000, maxAdditionalFields: 30, maxFieldValue: 1000 };
export const BROWSER_LIMITS: NormalizeLimits = { maxDescription: 1000, maxAdditionalFields: 10, maxFieldValue: 300 };

const ALIASES: Record<keyof Omit<ProductInput, 'additionalFields'>, string[]> = {
  productId: ['productid', 'id', 'sku', 'productcode', 'code', 'itemid', 'itemcode', 'variantid'],
  name: ['name', 'title', 'productname', 'product', 'itemname', 'producttitle'],
  price: ['price', 'saleprice', 'sellingprice', 'currentprice', 'amount', 'cost', 'mrp', 'listprice'],
  currency: ['currency', 'currencycode', 'curr'],
  description: ['description', 'desc', 'details', 'summary', 'shortdescription', 'bodyhtml', 'body'],
  availability: ['availability', 'stockstatus', 'instock', 'stock', 'inventory', 'available', 'status', 'quantity', 'qty'],
  category: ['category', 'categories', 'type', 'producttype', 'collection', 'department'],
  productUrl: ['producturl', 'url', 'link', 'productlink', 'permalink', 'href'],
  imageUrl: ['imageurl', 'image', 'img', 'thumbnail', 'picture', 'imagelink', 'featuredimage'],
};

const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Fields the API adds to products it returns; ignored on input so a fetched product can be sent back as-is. */
const OUTPUT_ONLY_KEYS = new Set(['_id', '__v', 'ownerId', 'chatbotId', 'productIdLower', 'source', 'createdAt', 'updatedAt']);
/** Nested objects whose primitive entries become additional fields. */
const NESTED_ATTRIBUTE_KEYS = new Set(['additionalfields', 'attributes']);

const CURRENCY_SYMBOLS: [RegExp, string][] = [
  [/₹|\brs\.?|\binr\b|rupee/i, 'INR'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
  [/¥|\bjpy\b/i, 'JPY'],
  [/\$|\busd\b/i, 'USD'],
];

/** Parses "₹2,499.00", "2499", "$1,299.99", "1.299,99" into a number. */
export function parsePrice(value: unknown): { price?: number; currency?: string; error?: string } {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value < 1e12 ? { price: value } : { error: 'price must be a non-negative number' };
  }
  if (typeof value !== 'string') return { error: 'price must be a number' };
  const raw = value.trim();
  const currency = CURRENCY_SYMBOLS.find(([re]) => re.test(raw))?.[1];
  let num = raw.replace(/[^0-9.,-]/g, '');
  if (!num || /-/.test(num)) return { error: `invalid price "${raw.slice(0, 30)}"` };
  const lastComma = num.lastIndexOf(',');
  const lastDot = num.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    num = lastComma > lastDot ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  } else if (lastComma > -1) {
    num = /^\d{1,3}(,\d{2,3})+$/.test(num) ? num.replace(/,/g, '') : num.replace(',', '.');
  }
  const price = Number(num);
  if (!Number.isFinite(price) || price < 0 || price >= 1e12) return { error: `invalid price "${raw.slice(0, 30)}"` };
  return { price, currency };
}

function availabilityFrom(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'In Stock' : 'Out of Stock';
  if (typeof value === 'number') return value > 0 ? `In Stock (${value})` : 'Out of Stock';
  const s = String(value).trim();
  if (/^(true|yes|y|1|instock|in_stock)$/i.test(s)) return 'In Stock';
  if (/^(false|no|n|0|outofstock|out_of_stock)$/i.test(s)) return 'Out of Stock';
  // Stock counts from CSV/XLSX arrive as strings ("12").
  if (/^\d+$/.test(s)) return Number(s) > 0 ? `In Stock (${Number(s)})` : 'Out of Stock';
  return s.slice(0, 100);
}

/** Only absolute http(s) URLs are kept — blocks javascript:, data: and other dangerous schemes. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().slice(0, 2000) : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown, max: number) => (v === null || v === undefined ? undefined : String(v).trim().slice(0, max) || undefined);

export interface NormalizeResult {
  product?: ProductInput;
  error?: string;
  warnings: string[];
}

/** Maps an arbitrary record (any common field naming) to a validated ProductInput. */
export function normalizeProduct(record: unknown, limits: NormalizeLimits = DEFAULT_LIMITS): NormalizeResult {
  const warnings: string[] = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { error: 'record must be an object', warnings };

  const entries = Object.entries(record as Record<string, unknown>).filter(([k]) => !k.startsWith('$') && !k.includes('.'));
  const byKey = new Map(entries.map(([k, v]) => [keyOf(k), { original: k, value: v }]));
  const used = new Set<string>();
  const pick = (field: keyof typeof ALIASES) => {
    for (const alias of ALIASES[field]) {
      const hit = byKey.get(alias);
      if (hit && hit.value !== null && hit.value !== undefined && hit.value !== '') {
        used.add(hit.original);
        return hit.value;
      }
    }
    return undefined;
  };

  const name = str(pick('name'), 300);
  if (!name) return { error: 'missing product name', warnings };

  let productId = str(pick('productId'), 128);
  if (!productId) {
    productId = slugify(name, 64) || undefined;
    if (!productId) return { error: 'missing product id', warnings };
    warnings.push(`no id for "${name}" — generated "${productId}"`);
  }

  const priceRaw = pick('price');
  const parsedPrice = parsePrice(priceRaw);
  if (parsedPrice.error) return { error: parsedPrice.error, warnings };

  const currencyRaw = str(pick('currency'), 10);
  const currency = (currencyRaw && /^[A-Za-z]{3}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : undefined) ?? parsedPrice.currency;
  if (currencyRaw && !/^[A-Za-z]{3}$/.test(currencyRaw)) warnings.push(`unrecognised currency "${currencyRaw}" for ${productId}`);

  const urlRaw = pick('productUrl');
  const productUrl = safeUrl(urlRaw);
  if (urlRaw && !productUrl) warnings.push(`ignored non-http(s) url for ${productId}`);
  const imageUrl = safeUrl(pick('imageUrl'));

  const description = str(pick('description'), limits.maxDescription)?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const categoryRaw = pick('category');
  const category = Array.isArray(categoryRaw) ? str(categoryRaw.join(', '), 200) : str(categoryRaw, 200);
  // Every standard field must be picked BEFORE collecting leftovers into additionalFields.
  const availability = availabilityFrom(pick('availability'));

  const additionalFields: Record<string, string | number | boolean> = {};
  const addField = (k: string, v: unknown) => {
    if (Object.keys(additionalFields).length >= limits.maxAdditionalFields) return;
    if (v === null || v === undefined || v === '' || k.startsWith('$') || k.includes('.') || OUTPUT_ONLY_KEYS.has(k)) return;
    const key = k.slice(0, 64);
    if (typeof v === 'number' || typeof v === 'boolean') additionalFields[key] = v;
    else additionalFields[key] = (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, limits.maxFieldValue);
  };
  for (const [k, v] of entries) {
    if (used.has(k) || OUTPUT_ONLY_KEYS.has(k)) continue;
    // A leftover "id" next to "productId" is a database id (e.g. from the API's own product shape), not an attribute.
    if (keyOf(k) === 'id') continue;
    // Nested attribute objects (including the API's own "additionalFields") are merged, not stringified.
    if (NESTED_ATTRIBUTE_KEYS.has(keyOf(k)) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) addField(nk, nv);
      continue;
    }
    addField(k, v);
  }

  return {
    product: {
      productId,
      name,
      description,
      price: parsedPrice.price,
      currency,
      availability,
      category,
      productUrl,
      imageUrl,
      additionalFields,
    },
    warnings,
  };
}
