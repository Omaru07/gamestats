// En desarrollo (npm run dev), Vite hace de proxy hacia los servicios, igual que nginx en Docker.
// Así el navegador solo habla con un origen y no hay problemas de CORS.
import { defineConfig } from 'vite';

const servicio = (prefijo: string, destino: string) => ({
  target: destino,
  changeOrigin: true,
  rewrite: (ruta: string) => ruta.replace(new RegExp(`^${prefijo}`), ''),
});

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api/ingest': servicio('/api/ingest', process.env.GO_URL ?? 'http://localhost:8080'),
      '/api/stats': servicio('/api/stats', process.env.SCALA_URL ?? 'http://localhost:8081'),
      '/api/ai': servicio('/api/ai', process.env.PROLOG_URL ?? 'http://localhost:8082'),
    },
  },
});
