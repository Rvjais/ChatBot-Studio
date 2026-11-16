/** Configuration a website places on the page before loading widget.js. */
export interface PageConfig {
  chatbotId?: string;
  /** API origin; defaults to the origin widget.js was loaded from. */
  apiBase?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'bottom-right' | 'bottom-left';
  primaryColor?: string;
  openOnLoad?: boolean;
  zIndex?: number;
  /** Optional products visible on the page (sent as unverified context). */
  products?: unknown[];
}

/** Public chatbot configuration returned by GET /api/widget/config/:publicId. */
export interface ServerConfig {
  publicId: string;
  name: string;
  welcomeMessage: string;
  placeholder: string;
  language: string;
  widget: {
    title: string;
    subtitle: string;
    primaryColor: string;
    secondaryColor: string;
    headerBackground: string;
    headerTextColor: string;
    position: 'bottom-right' | 'bottom-left';
    avatarUrl: string | null;
    borderRadius: number;
    theme: 'light' | 'dark' | 'auto';
    size: 'small' | 'medium' | 'large';
    launcherText: string;
    showBranding: boolean;
    autoOpen: boolean;
    suggestedQuestions: string[];
  };
  features: { streaming: boolean; pageProducts: boolean };
  limits: { maxMessageChars: number; maxProducts: number; maxProductsBytes: number };
}

export interface ResolvedConfig extends ServerConfig {
  apiBase: string;
  zIndex: number;
  openOnLoad: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'done' | 'error';
}
