import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } } },
  preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } } },
  build: { sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 900 }, // the three.js globe chunk (~225 KB gzip) is lazy-loaded near the viewport only // no production source maps (spec §9)
});
