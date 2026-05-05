import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json';

/** Static web build (no Electron). Deploy `dist-web/` to any static host. */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
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
