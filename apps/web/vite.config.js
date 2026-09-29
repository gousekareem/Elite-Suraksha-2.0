import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the web app calls /api/v1 on its own origin and Vite proxies
// to the API, so no CORS configuration is needed locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true }
    }
  }
});
