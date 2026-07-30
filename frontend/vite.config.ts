import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In Docker the API is reached via the compose service name; locally it is
// localhost. File watching uses polling inside containers (bind mounts on
// Windows/macOS do not emit native change events).
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8080';
const wsTarget = apiTarget.replace(/^http/, 'ws');
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: usePolling ? { usePolling: true, interval: 150 } : undefined,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws': { target: wsTarget, ws: true },
    },
  },
});
