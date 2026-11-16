import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const KNOWLEDGE_FILE_TYPES = ['pdf', 'txt', 'docx', 'csv', 'json', 'xlsx'] as const;
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number];
export const PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

const knowledgeFileSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatbotId: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    fileType: { type: String, enum: KNOWLEDGE_FILE_TYPES, required: true },
    mimeType: { type: String, maxlength: 200 },
    size: { type: Number, required: true },
    checksum: { type: String },
    /** Internal storage location. Never returned by the API. */
    storagePath: { type: String, required: true, select: false },
    processingStatus: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
    error: { type: String, maxlength: 1000 },
    /** Non-fatal problem (e.g. embeddings unavailable → keyword search only). */
    warning: { type: String, maxlength: 1000 },
    chunkCount: { type: Number, default: 0 },
    characterCount: { type: Number, default: 0 },
    embeddedChunkCount: { type: Number, default: 0 },
    embeddingModel: { type: String },
    source: { type: String, enum: ['upload', 'text'], default: 'upload' },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

knowledgeFileSchema.index({ chatbotId: 1, createdAt: -1 });
knowledgeFileSchema.index({ ownerId: 1, createdAt: -1 });

export type KnowledgeFileAttrs = InferSchemaType<typeof knowledgeFileSchema>;
export type KnowledgeFileDoc = HydratedDocument<KnowledgeFileAttrs>;
export const KnowledgeFile = model('KnowledgeFile', knowledgeFileSchema);
