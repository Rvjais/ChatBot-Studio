import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { validateBrowserProducts } from '../services/products/browser-products.js';
import {
  createProduct,
  deleteAllProducts,
  deleteProduct,
  importProductFile,
  listProducts,
  productCategories,
  serializeProduct,
  updateProduct,
} from '../services/products/product.service.js';
import { filterPageProducts, retrieveProducts } from '../services/products/retrieval.js';
import { badRequest, notFound } from '../utils/errors.js';

const ids = (req: Request) => ({ ownerId: req.chatbot!.ownerId as Types.ObjectId, chatbotId: req.chatbot!._id as Types.ObjectId });

export async function list(req: Request, res: Response) {
  const q = req.validatedQuery as { q?: string; category?: string; page: number; limit: number };
  const { items, total } = await listProducts(ids(req).chatbotId, { search: q.q, category: q.category, page: q.page, limit: q.limit });
  res.json({ items, total, page: q.page, limit: q.limit });
}

export async function create(req: Request, res: Response) {
  const { ownerId, chatbotId } = ids(req);
  const product = await createProduct(ownerId, chatbotId, req.body);
  res.status(201).json({ product: serializeProduct(product) });
}

export async function importFile(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw badRequest('Attach a JSON, CSV or XLSX file in the "file" field');
  const mode = req.body?.mode === 'replace' ? 'replace' : 'upsert';
  const { ownerId, chatbotId } = ids(req);
  const report = await importProductFile(ownerId, chatbotId, file, mode);
  res.json({ report });
}

export async function update(req: Request, res: Response) {
  const doc = await updateProduct(ids(req).chatbotId, String(req.params.productId), req.body);
  if (!doc) throw notFound('Product');
  res.json({ product: serializeProduct(doc) });
}

export async function remove(req: Request, res: Response) {
  if (!(await deleteProduct(ids(req).chatbotId, String(req.params.productId)))) throw notFound('Product');
  res.status(204).end();
}

export async function removeAll(req: Request, res: Response) {
  const deleted = await deleteAllProducts(ids(req).chatbotId);
  res.json({ deleted });
}

export async function categories(req: Request, res: Response) {
  res.json({ categories: await productCategories(ids(req).chatbotId) });
}

/** Shows which products the engine would put in context for a question. */
export async function searchTest(req: Request, res: Response) {
  const { query, pageProducts } = req.body as { query: string; pageProducts?: unknown[] };
  const result = await retrieveProducts(req.chatbot!, query);
  const page = pageProducts?.length
    ? filterPageProducts(validateBrowserProducts(pageProducts).products, result.query, req.chatbot!.productSettings?.maxProductsInContext ?? 12)
    : [];
  res.json({ verified: result.products, page, summary: result.summary, interpretedQuery: result.query });
}
