import type { PageConfig, ResolvedConfig, ServerConfig } from './types';
import { safeColor } from './utils/color';

/** Origin of the API: explicit apiBase, else the origin widget.js was served from. */
export function detectApiBase(pageConfig: PageConfig, script: HTMLScriptElement | null): string {
  const explicit = typeof pageConfig.apiBase === 'string' ? pageConfig.apiBase.trim() : '';
  if (explicit) return explicit.replace(/\/+$/, '');
  const src = script?.src || document.querySelector<HTMLScriptElement>('script[src*="widget.js"]')?.src;
  if (src) {
    try {
      return new URL(src, window.location.href).origin;
    } catch {
      /* fall through */
    }
  }
  return window.location.origin;
}

/** Merges server settings with optional page-level overrides (validated). */
export function resolveConfig(server: ServerConfig, page: PageConfig, apiBase: string): ResolvedConfig {
  const widget = { ...server.widget };
  if (page.theme === 'light' || page.theme === 'dark' || page.theme === 'auto') widget.theme = page.theme;
  if (page.position === 'bottom-left' || page.position === 'bottom-right') widget.position = page.position;
  if (page.primaryColor) {
    widget.primaryColor = safeColor(page.primaryColor, widget.primaryColor);
    if (widget.headerBackground === server.widget.primaryColor) widget.headerBackground = widget.primaryColor;
  }
  return {
    ...server,
    widget,
    apiBase,
    zIndex: typeof page.zIndex === 'number' && Number.isFinite(page.zIndex) ? page.zIndex : 2147483000,
    openOnLoad: page.openOnLoad === true,
  };
}
