import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Frontend app. `@deep-vision/shared` resolves to the top-level shared/ types
// package. The generation core (pipeline, render, media, persistence) lives
// elsewhere in the monorepo (backend/, core/) and is being rebuilt.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@deep-vision/shared': fileURLToPath(new URL('../shared/types/index.ts', import.meta.url)),
    },
  },
  server: {
    // Uses the PORT assigned by the dev-server launcher; 5173 when run manually.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // /api and /files → Node gateway (backend/) on :8787.
      // Override the gateway/core targets with env vars when running a second
      // stack on alternate ports (e.g. BACKEND_PROXY=http://127.0.0.1:8790).
      '/api': { target: process.env.BACKEND_PROXY || 'http://127.0.0.1:8787', changeOrigin: true },
      '/files': { target: process.env.BACKEND_PROXY || 'http://127.0.0.1:8787', changeOrigin: true },
      // /dev → Python core (:8000) directly — Developer Dashboard telemetry
      // (REST + WebSocket). Bypasses the Node gateway; ws:true upgrades /dev/ws.
      '/dev': { target: process.env.CORE_PROXY || 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
    },
  },
});
