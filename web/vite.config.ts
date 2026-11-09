import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// In sviluppo Vite gira su 5173 e passa /api al server del motore (npm run server:dev).
// AMBO_MOTORE punta a un altro motore sullo stesso PC (per esempio uno di prova con dati finti su
// 4318), senza toccare quello in uso. Solo indirizzi locali: il programma non esce dal PC.
// In produzione il server del motore serve direttamente web/dist.
const MOTORE = process.env.AMBO_MOTORE || 'http://127.0.0.1:4317';
if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/.test(MOTORE)) throw new Error(`AMBO_MOTORE deve essere un indirizzo locale, come http://127.0.0.1:4318 (non ${MOTORE})`);

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: MOTORE, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
