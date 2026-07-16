import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@deep-video/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Uses the PORT assigned by the dev-server launcher; 5173 when run manually.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/files': 'http://localhost:8787',
    },
  },
});
