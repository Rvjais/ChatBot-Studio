import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In development the dashboard talks to the API through this proxy (same origin),
// so VITE_API_URL can stay empty. Point VITE_PROXY_TARGET elsewhere if the API is not on :4000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:4000';
  // Regex keys (leading ^) so SPA routes such as /api-config are NOT proxied — plain keys are prefix matches.
  const proxy = {
    '^/api/': { target, changeOrigin: false },
    '^/widget\\.js': { target, changeOrigin: false },
    '^/embed-test/': { target, changeOrigin: false },
  };
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, proxy },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
