import { Router, type Request, type Response } from 'express';
import * as ai from '../controllers/ai.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as chatbots from '../controllers/chatbot.controller.js';
import * as conversations from '../controllers/conversation.controller.js';
import * as knowledge from '../controllers/knowledge.controller.js';
import * as products from '../controllers/product.controller.js';
import * as sync from '../controllers/sync.controller.js';
import * as widget from '../controllers/widget.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadOwnedChatbot, objectIdParam } from '../middleware/ownership.js';
import { authLimiter, providerTestLimiter, syncLimiter, widgetChatLimiter, widgetConfigLimiter } from '../middleware/rate-limit.js';
import { knowledgeUpload, productUpload } from '../middleware/upload.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { chatbotAnalytics, overviewAnalytics } from '../services/analytics/analytics.service.js';
import { MAX_FILES_PER_CHATBOT } from '../services/knowledge/knowledge.service.js';
import * as s from '../validators/schemas.js';

/** Authenticated dashboard API (mounted at /api). */
export function dashboardRouter(): Router {
  const r = Router();

  // ── Auth ──────────────────────────────────────────────────────────────
  r.post('/auth/register', authLimiter, validateBody(s.registerSchema), auth.register);
  r.post('/auth/login', authLimiter, validateBody(s.loginSchema), auth.login);
  r.get('/auth/me', requireAuth, auth.me);
  r.put('/auth/me', requireAuth, validateBody(s.updateProfileSchema), auth.updateProfile);
  r.put('/auth/password', requireAuth, authLimiter, validateBody(s.changePasswordSchema), auth.changePassword);
  r.post('/auth/logout', requireAuth, auth.logout);

  // ── Platform limits (so the dashboard validates against the configured values) ──
  r.get('/platform/limits', requireAuth, (_req: Request, res: Response) => {
    res.json({
      limits: {
        maxUploadMb: env.MAX_UPLOAD_MB,
        maxFilesPerUpload: env.MAX_FILES_PER_UPLOAD,
        maxKnowledgeFilesPerChatbot: MAX_FILES_PER_CHATBOT,
        maxProductImportMb: env.MAX_PRODUCT_IMPORT_MB,
        maxProductsPerChatbot: env.MAX_PRODUCTS_PER_CHATBOT,
        maxChatbotsPerUser: env.MAX_CHATBOTS_PER_USER,
        widget: {
          maxMessageChars: env.WIDGET_MAX_MESSAGE_CHARS,
          maxProducts: env.WIDGET_MAX_PRODUCTS,
          maxProductsBytes: env.WIDGET_MAX_PRODUCTS_BYTES,
        },
      },
    });
  });

  // ── AI catalog ────────────────────────────────────────────────────────
  r.get('/ai/providers', requireAuth, ai.getProviders);
  r.get('/ai/models', requireAuth, ai.getModels);

  // ── Chatbots ──────────────────────────────────────────────────────────
  r.get('/chatbots', requireAuth, validateQuery(s.listChatbotsQuery), chatbots.listChatbots);
  r.post('/chatbots', requireAuth, validateBody(s.createChatbotSchema), chatbots.createChatbot);

  const owned = Router({ mergeParams: true });
  owned.use(requireAuth, loadOwnedChatbot());
  owned.get('/', chatbots.getChatbot);
  owned.put('/', validateBody(s.updateChatbotSchema), chatbots.updateChatbot);
  owned.delete('/', chatbots.deleteChatbot);
  owned.post('/duplicate', validateBody(s.duplicateSchema), chatbots.duplicate);
  owned.patch('/status', validateBody(s.statusSchema), chatbots.setStatus);
  owned.put('/ai-config', validateBody(s.aiConfigSchema), chatbots.updateAiConfig);
  owned.post('/test-provider', providerTestLimiter, validateBody(s.testProviderSchema), ai.testProvider);
  owned.post('/models', providerTestLimiter, validateBody(s.listModelsSchema), ai.listLiveModels);
  owned.post('/preview-chat', validateBody(s.previewChatSchema), ai.previewChat);
  owned.get('/embed', chatbots.getEmbed);
  owned.post('/sync-key', chatbots.createSyncKey);
  owned.delete('/sync-key', chatbots.deleteSyncKey);
  owned.get('/analytics', validateQuery(s.analyticsQuery), async (req: Request, res: Response) => {
    res.json(await chatbotAnalytics(req.chatbot!._id, req.validatedQuery!.days));
  });

  // Knowledge base
  owned.post('/knowledge/upload', knowledgeUpload.array('files'), knowledge.upload);
  owned.post('/knowledge/text', validateBody(s.textKnowledgeSchema), knowledge.addText);
  owned.get('/knowledge', knowledge.listForChatbot);
  owned.post('/knowledge/search', validateBody(s.knowledgeSearchSchema), knowledge.searchTest);
  owned.post('/knowledge/reprocess-all', knowledge.reprocessAll);
  owned.get('/knowledge/:fileId/chunks', objectIdParam('fileId', 'Knowledge file'), knowledge.chunks);
  owned.delete('/knowledge/:fileId', objectIdParam('fileId', 'Knowledge file'), knowledge.remove);
  owned.post('/knowledge/:fileId/reprocess', objectIdParam('fileId', 'Knowledge file'), knowledge.reprocess);

  // Products
  owned.get('/products', validateQuery(s.listProductsQuery), products.list);
  owned.post('/products', validateBody(s.productBodySchema), products.create);
  owned.post('/products/import', productUpload.single('file'), products.importFile);
  owned.get('/products/categories', products.categories);
  owned.post('/products/search-test', validateBody(s.productSearchTestSchema), products.searchTest);
  owned.delete('/products', validateBody(s.deleteAllProductsSchema), products.removeAll);
  owned.put('/products/:productId', objectIdParam('productId', 'Product'), validateBody(s.productBodySchema), products.update);
  owned.delete('/products/:productId', objectIdParam('productId', 'Product'), products.remove);

  r.use('/chatbots/:id', owned);

  // ── Knowledge (all chatbots) ──────────────────────────────────────────
  r.get('/knowledge', requireAuth, validateQuery(s.listKnowledgeQuery), knowledge.listAll);

  // ── Conversations ─────────────────────────────────────────────────────
  r.get('/conversations', requireAuth, validateQuery(s.listConversationsQuery), conversations.list);
  r.get('/conversations/:id', requireAuth, objectIdParam('id', 'Conversation'), conversations.get);
  r.delete('/conversations/:id', requireAuth, objectIdParam('id', 'Conversation'), conversations.remove);

  // ── Analytics ─────────────────────────────────────────────────────────
  r.get('/analytics/overview', requireAuth, async (req: Request, res: Response) => {
    res.json(await overviewAnalytics(req.user!.id));
  });
  r.get('/analytics/chatbots/:id', requireAuth, loadOwnedChatbot(), validateQuery(s.analyticsQuery), async (req: Request, res: Response) => {
    res.json(await chatbotAnalytics(req.chatbot!._id, req.validatedQuery!.days));
  });

  return r;
}

/** Public widget API (mounted at /api/widget). Exposes only what the widget needs. */
export function widgetRouter(): Router {
  const r = Router();
  r.get('/config/:publicId', widgetConfigLimiter, widget.getConfig);
  r.post('/chat', widgetChatLimiter, validateBody(s.widgetChatSchema), widget.chat);
  r.get('/conversations/:conversationId', widgetConfigLimiter, validateQuery(s.widgetConversationQuery), widget.getConversation);
  return r;
}

/** Server-to-server product synchronization (mounted at /api/v1/sync). */
export function syncRouter(): Router {
  const r = Router();
  r.use(syncLimiter, sync.requireSyncKey);
  r.get('/products', sync.listSyncedProducts);
  r.post('/products', validateBody(s.syncProductsSchema), sync.syncProducts);
  r.delete('/products/:productId', sync.deleteSyncedProduct);
  return r;
}
