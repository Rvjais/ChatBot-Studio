const svg = (body: string, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 'icon-chat'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 'icon-close'),
  minimize: svg('<path d="m6 9 6 6 6-6"/>'),
  send: svg('<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/>'),
  refresh: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
};
