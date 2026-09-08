/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  /**
   * Le jeu est servi depuis un sous-chemin sur GitHub Pages
   * (https://<compte>.github.io/carriere/) et depuis la racine en local.
   * `VITE_BASE` est posé par le workflow de publication.
   */
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
