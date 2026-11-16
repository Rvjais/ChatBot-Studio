import { Schema, model, type InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatbotId: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: true },
    /** References Conversation._id. */
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    /** "preview" = dashboard test chat; excluded from visitor analytics but counted in token spend. */
    channel: { type: String, enum: ['widget', 'preview'], default: 'widget' },
    content: { type: String, required: true, maxlength: 100_000 },
    timestamp: { type: Date, default: () => new Date() },
    /** Token usage exactly as reported by the provider (absent when not reported). */
    tokenUsage: {
      inputTokens: { type: Number },
      outputTokens: { type: Number },
      totalTokens: { type: Number },
    },
    metadata: {
      provider: { type: String },
      model: { type: String },
      latencyMs: { type: Number },
      finishReason: { type: String },
      /** Cost in USD: provider-reported, or computed from known pricing. Absent when unknown. */
      costUsd: { type: Number },
      costSource: { type: String, enum: ['provider', 'catalog', 'chatbot'] },
      sources: [
        {
          _id: false,
          fileId: { type: Schema.Types.ObjectId },
          fileName: { type: String },
          chunkId: { type: Schema.Types.ObjectId },
          score: { type: Number },
          page: { type: Number },
        },
      ],
      productIds: { type: [String], default: undefined },
      browserProductIds: { type: [String], default: undefined },
      priceCheck: {
        passed: { type: Boolean },
        unverifiedAmounts: { type: [String], default: undefined },
      },
      error: {
        code: { type: String },
        message: { type: String },
      },
      streamed: { type: Boolean },
    },
  },
  { timestamps: false },
);

messageSchema.index({ conversationId: 1, timestamp: 1 });
messageSchema.index({ chatbotId: 1, timestamp: -1 });
messageSchema.index({ ownerId: 1, timestamp: -1 });
messageSchema.index({ ownerId: 1, content: 'text' }, { name: 'message_text' });

export type MessageAttrs = InferSchemaType<typeof messageSchema>;
export const Message = model('Message', messageSchema);
