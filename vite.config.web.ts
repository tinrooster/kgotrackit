import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Static web build (no Electron). Deploy `dist-web/` to any static host. */
export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    fs: { strict: false },
  },
});
