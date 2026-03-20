import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { swShareTargetPlugin } from './src/plugins/sw-share-target-plugin';
import { onnxStaticPlugin } from './src/plugins/onnx-static-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './',
  plugins: [
    swShareTargetPlugin(),
    onnxStaticPlugin(),
    wasm(),
    topLevelAwait(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Browser-Tools',
        short_name: 'B-Tools',
        description: 'Collection of useful Browser based Tools',
        start_url: './',
        id: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        orientation: 'any',
        icons: [
          {
            src: './favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: './screenshot.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
          },
          {
            src: './screenshot.png',
            sizes: '1280x720',
            type: 'image/png',
          },
        ],
        share_target: {
          action: './index.html',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                accept: ['*/*'],
              },
            ],
          },
        },
        file_handlers: [
          {
            action: './index.html',
            accept: {
              'application/pdf': ['.pdf'],
              'text/markdown': ['.md', '.markdown'],
              'text/x-markdown': ['.md', '.markdown'],
              'text/*': [
                '.txt',
                '.json',
                '.xml',
                '.html',
                '.css',
                '.js',
                '.ts',
                '.yaml',
                '.yml',
                '.py',
                '.sh',
                '.php',
                '.csv',
                '.mdx',
              ],
              'image/*': [
                '.png',
                '.jpg',
                '.jpeg',
                '.gif',
                '.webp',
                '.svg',
                '.bmp',
                '.ico',
                '.tiff',
                '.heic',
                '.avif',
                '.psd',
                '.ai',
              ],
              'audio/*': [
                '.wav',
                '.mp3',
                '.ogg',
                '.webm',
                '.flac',
                '.m4a',
                '.aac',
                '.opus',
              ],
              'video/*': [
                '.mp4',
                '.webm',
                '.ogg',
                '.mov',
                '.avi',
                '.mkv',
                '.flv',
                '.wmv',
                '.mpeg',
                '.3gp',
              ],
              'application/vnd.sqlite3': ['.sqlite', '.sqlite3', '.db'],
              'application/msword': ['.doc'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.ms-excel': ['.xls', '.xlsx'],
              'application/vnd.ms-powerpoint': ['.ppt', '.pptx'],
              'application/vnd.oasis.opendocument.text': ['.odt'],
              'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
              'application/vnd.oasis.opendocument.presentation': ['.odp'],
              'application/epub+zip': ['.epub'],
              'application/zip': ['.zip', '.rar', '.7z', '.tar', '.gz'],
              'application/octet-stream': [
                '.bin',
                '.dat',
                '.dmp',
                '.exe',
                '.dll',
                '.sys',
                '.iso',
                '.img',
                '.hex',
                '.vmdk',
                '.vhd',
              ],
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,wasm,onnx}'],
        navigateFallbackDenylist: [/\.html($|\?)/],
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['./sw-share-target.js', './sw-timer.js'],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.mjs') ||
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
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  resolve: {
    alias: [
      {
        find: /^@ffmpeg\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/tools/video-transcoder/node_modules/@ffmpeg/$1'),
      },
      {
        find: /^pandoc-wasm\/src\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          'src/tools/file-converter/node_modules/pandoc-wasm/src/$1'
        ),
      },
      {
        find: 'lucide',
        replacement: path.resolve(__dirname, 'node_modules/lucide/dist/esm/lucide.js'),
      },
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
    },
    chunkSizeWarningLimit: 3000,
  },
  optimizeDeps: {
    include: ['lucide'],
    exclude: [
      'mupdf',
      'pandoc-wasm',
      '@ffmpeg/core',
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util',
      'onnxruntime-web',
    ],
  },
  assetsInclude: ['**/*.wasm'],
});
