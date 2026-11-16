import { defineConfig } from 'vitest/config';

/** Builds a single self-contained IIFE bundle: dist/widget.js (no external dependencies). */
export default defineConfig(({ mode }) => ({
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: mode !== 'development',
    lib: {
      entry: 'src/index.ts',
      name: 'AIChatbotWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
  },
}));
