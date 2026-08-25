// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://globalwealthfolio.com',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['astro'] },
    build: {
      cssCodeSplit: true,
      minify: 'esbuild',
    },
  },
  server: {
    host: true,
    port: 4321,
  },
  build: {
    inlineStylesheets: 'auto',
    assets: 'assets',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
