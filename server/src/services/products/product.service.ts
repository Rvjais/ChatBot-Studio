import path from 'node:path';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { Chatbot } from '../../models/Chatbot.js';
import { Product } from '../../models/Product.js';
import { badRequest, unprocessable } from '../../utils/errors.js';
import { readCsv, readXlsx } from '../../utils/spreadsheet.js';
import { escapeRegex } from '../../utils/text.js';
import { detectFileType } from '../knowledge/file-validation.js';
import { normalizeProduct, type ProductInput } from './normalizer.js';

export type ProductSource = 'upload' | 'manual' | 'sync';

export interface ImportReport {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  removed: number;
  errors: { row: number; message: string }[];
  warnings: string[];
}

const MAX_REPORTED = 100;

export function serializeProduct(p: InstanceType<typeof Product> | Record<string, any>) {
  return {
    id: String(p._id),
    productId: p.productId,
    name: p.name,
    description: p.description ?? '',
    price: p.price ?? null,
    currency: p.currency ?? null,
    availability: p.availability ?? null,
    category: p.category ?? null,
    productUrl: p.productUrl ?? null,
    imageUrl: p.imageUrl ?? null,
    additionalFields: p.additionalFields ?? {},
    source: p.source,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toDoc(input: ProductInput) {
  return {
    productId: input.productId,
    productIdLower: input.productId.toLowerCase(),
    name: input.name,
    description: input.description ?? '',
    price: input.price,
    currency: input.currency,
    availability: input.availability,
    category: input.category,
    productUrl: input.productUrl,
    imageUrl: input.imageUrl,
    additionalFields: input.additionalFields ?? {},
  };
}

async function bumpVersion(chatbotId: Types.ObjectId) {
  await Chatbot.updateOne({ _id: chatbotId }, { $inc: { productsVersion: 1 } });
}

/** Extracts raw records from an uploaded JSON / CSV / XLSX product file. */
export async function parseProductFile(originalName: string, buffer: Buffer): Promise<unknown[]> {
  const type = detectFileType(originalName, buffer, ['json', 'csv', 'xlsx']);
  if (type === 'json') {
    const data: unknown = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (const key of ['products', 'items', 'data', 'records']) {
        const v = (data as Record<string, unknown>)[key];
        if (Array.isArray(v)) return v;
      }
    }
    throw badRequest('JSON must be an array of products, or an object with a "products" array');
  }
  if (type === 'csv') return readCsv(buffer.toString('utf8')).rows;
  const sheets = await readXlsx(buffer);
  if (!sheets.length) throw badRequest('The spreadsheet has no data');
  return sheets.flatMap((s) => s.rows);
}

/**
 * Validates and upserts product records for a chatbot. `replace` mode removes every
 * existing product of the chatbot that is not present in this import.
 */
export async function importProducts(
  ownerId: Types.ObjectId,
  chatbotId: Types.ObjectId,
  records: unknown[],
  opts: { mode: 'upsert' | 'replace'; source: ProductSource },
): Promise<ImportReport> {
  const report: ImportReport = { total: records.length, inserted: 0, updated: 0, failed: 0, removed: 0, errors: [], warnings: [] };
  const valid = new Map<string, ProductInput>();

  records.forEach((record, i) => {
    const { product, error, warnings } = normalizeProduct(record);
    if (warnings.length && report.warnings.length < MAX_REPORTED) report.warnings.push(...warnings.slice(0, MAX_REPORTED - report.warnings.length));
    if (!product) {
      report.failed++;
      if (report.errors.length < MAX_REPORTED) report.errors.push({ row: i + 1, message: error ?? 'invalid record' });
      return;
    }
    const key = product.productId.toLowerCase();
    if (valid.has(key) && report.warnings.length < MAX_REPORTED) report.warnings.push(`duplicate id "${product.productId}" — last occurrence kept`);
    valid.set(key, product);
  });

  if (!valid.size) return report;

  const existing = opts.mode === 'replace' ? 0 : await Product.countDocuments({ chatbotId });
  if (existing + valid.size > env.MAX_PRODUCTS_PER_CHATBOT) {
    const knownIds = await Product.countDocuments({ chatbotId, productIdLower: { $in: [...valid.keys()] } });
    if (existing + valid.size - knownIds > env.MAX_PRODUCTS_PER_CHATBOT) {
      throw unprocessable(`This import would exceed the limit of ${env.MAX_PRODUCTS_PER_CHATBOT} products per chatbot`);
    }
  }

  const items = [...valid.values()];
  for (let i = 0; i < items.length; i += 1000) {
    const ops = items.slice(i, i + 1000).map((p) => ({
      updateOne: {
        filter: { chatbotId, productIdLower: p.productId.toLowerCase() },
        update: { $set: { ...toDoc(p), source: opts.source }, $setOnInsert: { ownerId, chatbotId } },
        upsert: true,
      },
    }));
    const res = await Product.bulkWrite(ops, { ordered: false });
    report.inserted += res.upsertedCount;
    report.updated += res.matchedCount;
  }

  if (opts.mode === 'replace') {
    const del = await Product.deleteMany({ chatbotId, productIdLower: { $nin: [...valid.keys()] } });
    report.removed = del.deletedCount;
  }
  await bumpVersion(chatbotId);
  return report;
}

export async function importProductFile(
  ownerId: Types.ObjectId,
  chatbotId: Types.ObjectId,
  file: { originalname: string; buffer: Buffer },
  mode: 'upsert' | 'replace',
): Promise<ImportReport> {
  let records: unknown[];
  try {
    records = await parseProductFile(path.basename(file.originalname), file.buffer);
  } catch (err) {
    if (err instanceof Error && 'status' in err) throw err;
    throw badRequest(`Could not parse product file: ${(err as Error).message}`.slice(0, 300));
  }
  if (!records.length) throw badRequest('No product records found in the file');
  return importProducts(ownerId, chatbotId, records, { mode, source: 'upload' });
}

export async function createProduct(ownerId: Types.ObjectId, chatbotId: Types.ObjectId, input: unknown) {
  const { product, error } = normalizeProduct(input);
  if (!product) throw badRequest(error ?? 'Invalid product');
  if ((await Product.countDocuments({ chatbotId })) >= env.MAX_PRODUCTS_PER_CHATBOT) {
    throw unprocessable(`Product limit of ${env.MAX_PRODUCTS_PER_CHATBOT} reached`);
  }
  const doc = await Product.create({ ...toDoc(product), ownerId, chatbotId, source: 'manual' });
  await bumpVersion(chatbotId);
  return doc;
}

export async function updateProduct(chatbotId: Types.ObjectId, id: string, input: unknown) {
  const { product, error } = normalizeProduct(input);
  if (!product) throw badRequest(error ?? 'Invalid product');
  // PUT replaces the product: optional fields left out of the request are removed, not kept.
  const fields = toDoc(product) as Record<string, unknown>;
  const $set: Record<string, unknown> = { source: 'manual' };
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) $unset[key] = 1;
    else $set[key] = value;
  }
  const doc = await Product.findOneAndUpdate(
    { _id: id, chatbotId },
    { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
    { new: true, runValidators: true },
  );
  if (doc) await bumpVersion(chatbotId);
  return doc;
}

export async function deleteProduct(chatbotId: Types.ObjectId, id: string) {
  const res = await Product.deleteOne({ _id: id, chatbotId });
  if (res.deletedCount) await bumpVersion(chatbotId);
  return res.deletedCount > 0;
}

export async function deleteProductByBusinessId(chatbotId: Types.ObjectId, productId: string) {
  const res = await Product.deleteOne({ chatbotId, productIdLower: productId.toLowerCase() });
  if (res.deletedCount) await bumpVersion(chatbotId);
  return res.deletedCount > 0;
}

export async function deleteAllProducts(chatbotId: Types.ObjectId) {
  const res = await Product.deleteMany({ chatbotId });
  await bumpVersion(chatbotId);
  return res.deletedCount;
}

export async function listProducts(
  chatbotId: Types.ObjectId,
  q: { search?: string; category?: string; page: number; limit: number },
) {
  const filter: Record<string, unknown> = { chatbotId };
  if (q.category) filter.category = q.category;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search.slice(0, 100)), 'i');
    filter.$or = [{ name: re }, { productId: re }, { category: re }];
  }
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ updatedAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items: items.map(serializeProduct), total };
}

export async function productCategories(chatbotId: Types.ObjectId): Promise<string[]> {
  const cats = await Product.distinct('category', { chatbotId, category: { $nin: [null, ''] } });
  return (cats as string[]).sort((a, b) => a.localeCompare(b));
}
