import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:3000';

export default defineConfig({
  root: 'src/admin',
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../../dist/admin',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/_nova': backend,
      '/media': backend,
    },
  },
});
