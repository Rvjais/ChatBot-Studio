import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const productSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatbotId: { type: Schema.Types.ObjectId, ref: 'Chatbot', required: true },
    productId: { type: String, required: true, trim: true, maxlength: 128 },
    /** Lower-cased productId for case-insensitive exact lookups. */
    productIdLower: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, maxlength: 5000, default: '' },
    price: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true, maxlength: 10 },
    availability: { type: String, trim: true, maxlength: 100 },
    category: { type: String, trim: true, maxlength: 200 },
    productUrl: { type: String, trim: true, maxlength: 2000 },
    imageUrl: { type: String, trim: true, maxlength: 2000 },
    additionalFields: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, enum: ['upload', 'manual', 'sync'], default: 'manual' },
  },
  { timestamps: true, minimize: false },
);

productSchema.index({ chatbotId: 1, productIdLower: 1 }, { unique: true });
productSchema.index({ chatbotId: 1, category: 1, price: 1 });
productSchema.index({ chatbotId: 1, price: 1 });
productSchema.index({ chatbotId: 1, updatedAt: -1 });
productSchema.index(
  { chatbotId: 1, name: 'text', category: 'text', description: 'text', productId: 'text' },
  { name: 'product_text', weights: { name: 10, productId: 8, category: 5, description: 1 } },
);

export type ProductAttrs = InferSchemaType<typeof productSchema>;
export type ProductDoc = HydratedDocument<ProductAttrs>;
export const Product = model('Product', productSchema);
