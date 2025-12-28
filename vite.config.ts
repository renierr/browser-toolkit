import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // we provide our own manifest.json
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
        navigateFallbackDenylist: [/\.html($|\?)/],
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['./sw-share-target.js'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.mjs') ||
              url.pathname.includes('/pdfjs/') ||
              url.pathname.endsWith('.bcmap') ||
              url.pathname.endsWith('.pfb') ||
              url.pathname.endsWith('.ttf'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dynamic-files',
              expiration: {
                maxEntries: 500,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@tools',
        replacement: path.resolve(__dirname, 'src/tools'),
      },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        pdf: path.resolve(__dirname, 'pdf.html'),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('@cantoo/pdf-lib') || id.includes('pdf-lib')) return 'vendor-pdf-lib';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  assetsInclude: ['**/*.wasm'],
});
