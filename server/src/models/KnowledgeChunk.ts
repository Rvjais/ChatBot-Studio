import { Schema, model, type InferSchemaType } from 'mongoose';

const knowledgeChunkSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatbotId: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: true },
    fileId: { type: Schema.Types.ObjectId, ref: 'KnowledgeFile', required: true },
    index: { type: Number, required: true },
    content: { type: String, required: true },
    /** Embedding vector (omitted from queries unless explicitly selected). */
    embedding: { type: [Number], select: false, default: undefined },
    embeddingModel: { type: String },
    tokenEstimate: { type: Number },
    metadata: {
      fileName: { type: String },
      page: { type: Number },
      sheet: { type: String },
      rows: { type: String },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

knowledgeChunkSchema.index({ chatbotId: 1, fileId: 1, index: 1 });
knowledgeChunkSchema.index({ chatbotId: 1, embeddingModel: 1 });
// Compound text index: every $text query must include an equality match on chatbotId,
// which enforces per-chatbot isolation at the index level.
knowledgeChunkSchema.index({ chatbotId: 1, content: 'text' }, { name: 'chunk_text', default_language: 'english' });

export type KnowledgeChunkAttrs = InferSchemaType<typeof knowledgeChunkSchema>;
export const KnowledgeChunk = model('KnowledgeChunk', knowledgeChunkSchema);
