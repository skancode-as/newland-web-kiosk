import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: 'newland-web-kiosk/mock',
        replacement: fileURLToPath(new URL('../src/mock/index.ts', import.meta.url)),
      },
      {
        find: 'newland-web-kiosk',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
