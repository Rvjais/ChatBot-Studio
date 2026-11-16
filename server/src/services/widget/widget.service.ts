import { env } from '../../config/env.js';
import { Chatbot, type ChatbotDoc } from '../../models/Chatbot.js';
import { hostFromOrigin, isHostAllowed } from '../../utils/domains.js';
import { AppError } from '../../utils/errors.js';
import { CHATBOT_SECRET_FIELDS } from '../ai/ai.service.js';

const PLATFORM_HOST = hostFromOrigin(env.PUBLIC_API_URL);

/**
 * Loads an active chatbot by its public ID. Unknown IDs and inactive chatbots get the
 * same generic 404 so the endpoint cannot be used to probe chatbot state.
 */
export async function loadPublicChatbot(publicId: string, withSecrets = false): Promise<ChatbotDoc> {
  if (!/^cb_[A-Za-z0-9]{20}$/.test(publicId)) throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found');
  const query = Chatbot.findOne({ publicId });
  const chatbot = (await (withSecrets ? query.select(CHATBOT_SECRET_FIELDS) : query)) as ChatbotDoc | null;
  if (!chatbot || chatbot.status !== 'active') throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found or inactive');
  return chatbot;
}

/** Enforces the optional allowed-domain list using the browser's Origin (or Referer) header. */
export function assertOriginAllowed(chatbot: ChatbotDoc, origin?: string, referer?: string): void {
  if (!chatbot.domainRestrictionEnabled) return;
  const host = hostFromOrigin(origin) ?? hostFromOrigin(referer);
  if (host && env.ALLOW_PLATFORM_PREVIEW_ORIGIN && host === PLATFORM_HOST) return;
  if (!host || !isHostAllowed(host, chatbot.allowedDomains ?? [])) {
    throw new AppError(403, 'DOMAIN_NOT_ALLOWED', 'This chatbot is not enabled for this website.');
  }
}

/** The only chatbot data the public widget receives — no prompts, keys or internal settings. */
export function publicWidgetConfig(chatbot: ChatbotDoc) {
  const w = chatbot.widget ?? ({} as NonNullable<ChatbotDoc['widget']>);
  return {
    publicId: chatbot.publicId,
    name: chatbot.name,
    welcomeMessage: chatbot.welcomeMessage,
    placeholder: chatbot.placeholder,
    language: chatbot.language,
    widget: {
      title: w.title || chatbot.name,
      subtitle: w.subtitle ?? '',
      primaryColor: w.primaryColor,
      secondaryColor: w.secondaryColor,
      headerBackground: w.headerBackground,
      headerTextColor: w.headerTextColor,
      position: w.position,
      avatarUrl: w.avatarUrl ?? null,
      borderRadius: w.borderRadius,
      theme: w.theme,
      size: w.size,
      launcherText: w.launcherText ?? '',
      showBranding: w.showBranding !== false,
      autoOpen: Boolean(w.autoOpen),
      suggestedQuestions: (w.suggestedQuestions ?? []).slice(0, 6),
    },
    features: {
      streaming: true,
      pageProducts: chatbot.productSettings?.allowBrowserProducts !== false,
    },
    limits: {
      maxMessageChars: env.WIDGET_MAX_MESSAGE_CHARS,
      maxProducts: env.WIDGET_MAX_PRODUCTS,
      maxProductsBytes: env.WIDGET_MAX_PRODUCTS_BYTES,
    },
  };
}
