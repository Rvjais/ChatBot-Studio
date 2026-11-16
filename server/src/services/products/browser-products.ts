import { env } from '../../config/env.js';
import { badRequest, tooLarge } from '../../utils/errors.js';
import { BROWSER_LIMITS, normalizeProduct, type ProductInput } from './normalizer.js';

export interface BrowserProductsResult {
  products: ProductInput[];
  received: number;
  rejected: number;
}

/**
 * Validates product data supplied by the embedding web page (window.AIChatbotConfig.products).
 * This data is untrusted: it is size-limited, normalized, stripped of unsafe URLs, and later
 * labelled as "page-provided" so the model never treats it as authoritative.
 */
export function validateBrowserProducts(raw: unknown): BrowserProductsResult {
  if (raw === undefined || raw === null) return { products: [], received: 0, rejected: 0 };
  if (!Array.isArray(raw)) throw badRequest('products must be an array');
  if (raw.length > env.WIDGET_MAX_PRODUCTS) {
    throw tooLarge(`Too many page-provided products (${raw.length}); the limit is ${env.WIDGET_MAX_PRODUCTS}. Use the product sync API for larger catalogs.`);
  }
  const size = Buffer.byteLength(JSON.stringify(raw));
  if (size > env.WIDGET_MAX_PRODUCTS_BYTES) {
    throw tooLarge(`Page-provided products are too large (${size} bytes; limit ${env.WIDGET_MAX_PRODUCTS_BYTES}). Use the product sync API for larger catalogs.`);
  }
  const products: ProductInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const item of raw) {
    const { product } = normalizeProduct(item, BROWSER_LIMITS);
    if (!product || seen.has(product.productId.toLowerCase())) {
      rejected++;
      continue;
    }
    seen.add(product.productId.toLowerCase());
    products.push(product);
  }
  return { products, received: raw.length, rejected };
}
