import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// In sviluppo Vite gira su 5173 e passa /api al server del motore (npm run server:dev).
// In produzione il server del motore serve direttamente web/dist.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
