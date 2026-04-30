import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    // No emitir source maps en prod — no exponer código original a clientes/atacantes.
    sourcemap: false,
    // Strip console.* en build de producción (defense-in-depth contra leaks de info en logs).
    minify: 'esbuild',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
