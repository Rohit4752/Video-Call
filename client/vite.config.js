import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      buffer: true,
      process: true,
      global: true,
      crypto: true,
      stream: true,
      events: true,
    }),
  ],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      events: 'events',
      buffer: 'buffer',
    },
  },
});