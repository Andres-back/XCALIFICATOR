import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';

const isDocker = existsSync('/.dockerenv');
const defaultApiTarget = isDocker ? 'http://backend:8000' : 'http://localhost:8000';
const apiProxyTarget = process.env.VITE_DEV_PROXY_TARGET || defaultApiTarget;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
