import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // numero di versione della build: va in coda agli indirizzi di sprite, sfondi e musica (?v=...),
  // così dopo ogni pubblicazione i telefoni scaricano le immagini nuove invece di quelle in cache
  define: { __BUILD__: JSON.stringify(String(Date.now())) },
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
