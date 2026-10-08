import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    // in sviluppo le API PHP girano con: php -S localhost:8000 -t server
    proxy: {
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
});
