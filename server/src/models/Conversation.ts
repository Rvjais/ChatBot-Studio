import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const conversationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatbotId: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: true },
    /** Public, unguessable conversation ID handed to the widget. */
    conversationId: { type: String, required: true, unique: true },
    visitorId: { type: String, required: true, maxlength: 100 },
    channel: { type: String, enum: ['widget', 'preview'], default: 'widget' },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: () => new Date() },
    lastMessagePreview: { type: String, maxlength: 200 },
    origin: { type: String, maxlength: 300 },
    pageUrl: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

conversationSchema.index({ ownerId: 1, lastMessageAt: -1 });
conversationSchema.index({ chatbotId: 1, lastMessageAt: -1 });
conversationSchema.index({ chatbotId: 1, createdAt: -1 });
conversationSchema.index({ ownerId: 1, visitorId: 1 });

export type ConversationAttrs = InferSchemaType<typeof conversationSchema>;
export type ConversationDoc = HydratedDocument<ConversationAttrs>;
export const Conversation = model('Conversation', conversationSchema);
