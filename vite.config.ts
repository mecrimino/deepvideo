import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
const API_PORT = 8787;

/**
 * Auto-start the local API server alongside the frontend. Without it, every
 * /api call (login included) hits a dead proxy. Probes :8787 first so an
 * already-running server (e.g. a separate `npm run server`) is reused.
 */
function apiServerPlugin(): Plugin {
  return {
    name: 'deep-video-api-server',
    apply: 'serve',
    configureServer() {
      const probe = net.connect({ port: API_PORT, host: '127.0.0.1' });
      probe.once('connect', () => {
        probe.end(); // something is already listening — reuse it
      });
      probe.once('error', () => {
        // eslint-disable-next-line no-console
        console.log(`[deep-video] starting API server on :${API_PORT}…`);
        const child = spawn('npx tsx watch src/index.ts', {
          cwd: path.join(here, 'server'),
          env: { ...process.env, PORT: String(API_PORT) },
          stdio: 'inherit',
          shell: true,
        });
        const stop = () => {
          try {
            child.kill();
          } catch {
            /* already gone */
          }
        };
        process.once('exit', stop);
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiServerPlugin()],
  resolve: {
    alias: {
      '@deep-video/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Uses the PORT assigned by the dev-server launcher; 5173 when run manually.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
      '/files': `http://localhost:${API_PORT}`,
    },
  },
});

