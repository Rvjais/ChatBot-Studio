import multer from 'multer';
import { env } from '../config/env.js';

/**
 * Uploads are buffered in memory (bounded by size/count limits), validated by content
 * signature, and only then written to private storage with server-generated names.
 */
export const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: env.MAX_FILES_PER_UPLOAD,
    fields: 10,
    parts: env.MAX_FILES_PER_UPLOAD + 10,
  },
});

export const productUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_PRODUCT_IMPORT_MB * 1024 * 1024, files: 1, fields: 5 },
});
