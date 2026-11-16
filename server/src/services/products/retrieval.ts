import type { Types } from 'mongoose';
import type { ChatbotDoc } from '../../models/Chatbot.js';
import { Product } from '../../models/Product.js';
import { keywords } from '../../utils/text.js';
import type { ProductInput } from './normalizer.js';

export interface ProductQuery {
  idCandidates: string[];
  priceMin?: number;
  priceMax?: number;
  sort?: 'price_asc' | 'price_desc';
  terms: string[];
  categories: string[];
  productIntent: boolean;
}

/** Product record handed to the model. `source` distinguishes verified DB data from page data. */
export interface ContextProduct extends ProductInput {
  source: 'verified' | 'page';
}

export interface CatalogSummary {
  totalProducts: number;
  categories: string[];
  priceRange?: { min: number; max: number; currency?: string };
}

const PRODUCT_WORDS = new Set([
  'product', 'products', 'item', 'items', 'category', 'categories', 'available', 'availability', 'stock',
  'buy', 'sell', 'sells', 'selling', 'offer', 'offers', 'have', 'got', 'catalog', 'catalogue', 'range',
  'cheap', 'cheapest', 'cheaper', 'expensive', 'costly', 'priciest', 'affordable', 'budget', 'rs', 'inr',
  'usd', 'eur', 'gbp', 'rupees', 'rupee', 'dollars', 'dollar', 'less', 'more', 'than', 'under', 'below',
  'above', 'over', 'between', 'lowest', 'highest', 'least', 'most', 'k', 'thousand', 'lakh', 'any', 'similar',
  'detail', 'details', 'info', 'information', 'specs', 'specifications',
]);

const INTENT = /\b(products?|items?|sell|buy|purchase|price|prices|cost|costs|stock|availab|catalog|categor|offer|recommend|cheap|expensive|afford|budget|deal|model|brand|sku)\b|[₹$€£]/i;

/** Any currency word or Unicode currency symbol (₹ $ € £ ¥ …) before an amount. */
const CUR = String.raw`(?:rs\.?|inr|usd|eur|gbp|jpy|aed|\p{Sc})?\s*`;
const NUM = String.raw`(\d{1,3}(?:[,\s]\d{2,3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|m|million)?\b`;

function toNumber(digits: string, mult?: string): number {
  const n = Number(digits.replace(/[,\s]/g, ''));
  const m = mult?.toLowerCase();
  if (!m) return n;
  if (m === 'k' || m === 'thousand') return n * 1_000;
  if (m.startsWith('lakh') || m.startsWith('lac')) return n * 100_000;
  if (m === 'm' || m === 'million') return n * 1_000_000;
  return n;
}

/** Turns a natural-language question into structured product filters. */
export function parseProductQuery(text: string): ProductQuery {
  const lower = text.toLowerCase();
  const q: ProductQuery = { idCandidates: [], terms: [], categories: [], productIntent: INTENT.test(text) };

  const between = new RegExp(String.raw`between\s*${CUR}${NUM}\s*(?:and|to|-|–)\s*${CUR}${NUM}`, 'iu').exec(lower);
  if (between) {
    const a = toNumber(between[1]!, between[2]);
    const b = toNumber(between[3]!, between[4]);
    q.priceMin = Math.min(a, b);
    q.priceMax = Math.max(a, b);
  } else {
    const max =
      new RegExp(String.raw`(?:under|below|less than|cheaper than|lower than|within|up ?to|at most|max(?:imum)?|not more than|no more than|<=?)\s*(?:of\s*)?${CUR}${NUM}`, 'iu').exec(lower) ??
      new RegExp(String.raw`${CUR}${NUM}\s*(?:or less|or below|or under|and below|and under|max)`, 'iu').exec(lower);
    if (max) q.priceMax = toNumber(max[1]!, max[2]);
    const min =
      new RegExp(String.raw`(?:over|above|more than|greater than|higher than|at least|min(?:imum)?|starting (?:at|from)|>=?)\s*${CUR}${NUM}`, 'iu').exec(lower) ??
      new RegExp(String.raw`${CUR}${NUM}\s*(?:or more|and above|and up|or above|plus|\+)`, 'iu').exec(lower);
    if (min) q.priceMin = toNumber(min[1]!, min[2]);
  }
  if (q.priceMin !== undefined || q.priceMax !== undefined) q.productIntent = true;

  if (/\b(cheapest|lowest[- ]priced?|least expensive|most affordable|lowest price|budget)\b/.test(lower)) q.sort = 'price_asc';
  else if (/\b(most expensive|priciest|highest[- ]priced?|highest price|premium|top[- ]end)\b/.test(lower)) q.sort = 'price_desc';

  // Every token is a potential product ID; exact lookups on an indexed field are cheap.
  const tokens = text.split(/[\s,;:!?()"'[\]{}]+/).map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''));
  q.idCandidates = [...new Set(tokens.filter((t) => t.length >= 2 && t.length <= 128).map((t) => t.toLowerCase()))].slice(0, 40);
  q.terms = keywords(text, 16).filter((t) => !PRODUCT_WORDS.has(t));
  return q;
}

function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && /(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Finds which of the chatbot's categories are mentioned in the question. */
export function matchCategories(text: string, categories: string[]): string[] {
  const words = new Set(keywords(text, 40).flatMap((w) => [w, singular(w)]));
  const lower = text.toLowerCase();
  return categories.filter((cat) => {
    const c = cat.toLowerCase().trim();
    if (!c) return false;
    if (c.includes(' ')) return lower.includes(c) || lower.includes(singular(c));
    return words.has(c) || words.has(singular(c));
  });
}

const summaryCache = new Map<string, { version: number; summary: CatalogSummary }>();

export async function catalogSummary(chatbot: ChatbotDoc): Promise<CatalogSummary> {
  const id = chatbot._id.toString();
  const version = chatbot.productsVersion ?? 0;
  const hit = summaryCache.get(id);
  if (hit && hit.version === version) return hit.summary;
  const chatbotId = chatbot._id as Types.ObjectId;
  const [stats] = await Product.aggregate<{ total: number; min?: number; max?: number; currencies: string[] }>([
    { $match: { chatbotId } },
    { $group: { _id: null, total: { $sum: 1 }, min: { $min: '$price' }, max: { $max: '$price' }, currencies: { $addToSet: '$currency' } } },
  ]);
  const categories = stats?.total
    ? ((await Product.distinct('category', { chatbotId, category: { $nin: [null, ''] } })) as string[]).sort()
    : [];
  const currencies = (stats?.currencies ?? []).filter(Boolean);
  const summary: CatalogSummary = {
    totalProducts: stats?.total ?? 0,
    categories: categories.slice(0, 50),
    priceRange:
      stats && typeof stats.min === 'number' && typeof stats.max === 'number'
        ? { min: stats.min, max: stats.max, currency: currencies.length === 1 ? currencies[0] : undefined }
        : undefined,
  };
  if (summaryCache.size > 2000) summaryCache.clear();
  summaryCache.set(id, { version, summary });
  return summary;
}

function toContext(p: Record<string, any>): ContextProduct {
  return {
    source: 'verified',
    productId: p.productId,
    name: p.name,
    description: p.description || undefined,
    price: p.price ?? undefined,
    currency: p.currency ?? undefined,
    availability: p.availability ?? undefined,
    category: p.category ?? undefined,
    productUrl: p.productUrl ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    additionalFields: p.additionalFields ?? {},
  };
}

export interface ProductRetrieval {
  products: ContextProduct[];
  summary: CatalogSummary;
  query: ProductQuery;
}

/**
 * Structured retrieval from the chatbot's product table. Exact database queries (IDs,
 * price ranges, categories) take precedence over fuzzy text matching; results always come
 * straight from stored records so prices are never paraphrased by retrieval.
 */
export async function retrieveProducts(
  chatbot: ChatbotDoc,
  question: string,
  carryOverIds: string[] = [],
): Promise<ProductRetrieval> {
  const query = parseProductQuery(question);
  const summary = await catalogSummary(chatbot);
  if (!summary.totalProducts) return { products: [], summary, query };

  const chatbotId = chatbot._id as Types.ObjectId;
  const limit = chatbot.productSettings?.maxProductsInContext ?? 12;
  query.categories = matchCategories(question, summary.categories);
  if (query.categories.length) query.productIntent = true;

  const found = new Map<string, Record<string, any>>();
  const add = (docs: Record<string, any>[]) => docs.forEach((d) => found.size < limit * 2 && found.set(d.productIdLower, d));

  // Every query ends with price/_id tie-breakers so results are deterministic (MongoDB does not
  // guarantee an order for equal sort keys, e.g. identical text scores).
  const TIE = { price: 1, _id: 1 } as const;

  // 1. Exact product-ID matches.
  if (query.idCandidates.length) {
    add(await Product.find({ chatbotId, productIdLower: { $in: query.idCandidates } }).sort(TIE).limit(limit).lean());
  }

  const filter: Record<string, unknown> = { chatbotId };
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    filter.price = {
      ...(query.priceMin !== undefined ? { $gte: query.priceMin } : {}),
      ...(query.priceMax !== undefined ? { $lte: query.priceMax } : {}),
    };
  }
  if (query.categories.length) filter.category = { $in: query.categories };
  const sort: Record<string, 1 | -1> | null = query.sort === 'price_asc' ? { price: 1 } : query.sort === 'price_desc' ? { price: -1 } : null;
  const hasConstraints = Boolean(filter.price || filter.category || sort);

  // 2. Keyword (full-text) matches, constrained by any price/category filters.
  if (query.terms.length) {
    const textQuery = Product.find({ ...filter, $text: { $search: query.terms.join(' ') } }, { score: { $meta: 'textScore' } });
    add(await (sort ? textQuery.sort({ ...sort, _id: 1 }) : textQuery.sort({ score: { $meta: 'textScore' }, ...TIE })).limit(limit).lean());
  }

  // 3. Pure structured listing ("under ₹3000", "electronics category", "cheapest").
  if (hasConstraints && found.size < limit) {
    add(await Product.find(filter).sort(sort ? { ...sort, _id: 1 } : TIE).limit(limit).lean());
  }

  // 4. Products discussed in the previous answer (follow-ups like "how much is it?").
  if (carryOverIds.length && found.size < limit) {
    add(await Product.find({ chatbotId, productIdLower: { $in: carryOverIds.map((i) => i.toLowerCase()) } }).sort(TIE).limit(5).lean());
  }

  // 5. Small catalog and a product-related question with no specific match → share the catalog.
  if (!found.size && query.productIntent && summary.totalProducts <= limit) {
    add(await Product.find({ chatbotId }).sort(TIE).limit(limit).lean());
  }

  let products = [...found.values()].map(toContext);
  if (sort) products.sort((a, b) => ((a.price ?? Infinity) - (b.price ?? Infinity)) * (query.sort === 'price_desc' ? -1 : 1));
  products = products.slice(0, limit);
  return { products, summary, query };
}

/** Applies the same query understanding to products supplied by the web page (in memory). */
export function filterPageProducts(pageProducts: ProductInput[], query: ProductQuery, limit: number): ContextProduct[] {
  if (!pageProducts.length) return [];
  const pageCategories = [...new Set(pageProducts.map((p) => p.category).filter((c): c is string => Boolean(c)))];
  const categories = query.categories.length ? query.categories : [];
  const scored = pageProducts
    .map((p) => {
      let score = 0;
      if (query.idCandidates.includes(p.productId.toLowerCase())) score += 100;
      const hay = `${p.name} ${p.category ?? ''}`.toLowerCase();
      const desc = (p.description ?? '').toLowerCase();
      for (const t of query.terms) {
        if (hay.includes(t) || hay.includes(singular(t))) score += 10;
        else if (desc.includes(t)) score += 1;
      }
      const cats = categories.length ? categories : matchCategories(query.terms.join(' '), pageCategories);
      if (cats.length && p.category && cats.some((c) => c.toLowerCase() === p.category!.toLowerCase())) score += 5;
      const inRange =
        (query.priceMin === undefined || (p.price !== undefined && p.price >= query.priceMin)) &&
        (query.priceMax === undefined || (p.price !== undefined && p.price <= query.priceMax));
      const hasPriceFilter = query.priceMin !== undefined || query.priceMax !== undefined;
      if (hasPriceFilter && !inRange) return null;
      if (hasPriceFilter || query.sort) score += 2;
      return { p, score };
    })
    .filter((x): x is { p: ProductInput; score: number } => x !== null);

  let picked = scored.filter((x) => x.score > 0);
  if (!picked.length && query.productIntent && pageProducts.length <= limit) picked = scored;
  picked.sort((a, b) => b.score - a.score);
  let result = picked.map((x) => ({ ...x.p, source: 'page' as const }));
  if (query.sort) result.sort((a, b) => ((a.price ?? Infinity) - (b.price ?? Infinity)) * (query.sort === 'price_desc' ? -1 : 1));
  result = result.slice(0, limit);
  return result;
}
