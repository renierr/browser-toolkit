import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { onnxStaticPlugin } from './src/plugins/onnx-static-plugin';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let gitHash = 'unknown';
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Failed to get git hash', e);
}

const buildDate = new Date().toISOString();

export default defineConfig({
  base: './',
  clearScreen: false,
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    onnxStaticPlugin(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: [
        'favicon.svg',
        'favicon-192.png',
        'favicon-512.png',
        'sw-share-target.js',
        'sw-bg-timer.js',
      ],
      manifest: {
        name: 'Browser-Tools',
        short_name: 'B-Tools',
        description: 'Collection of useful Browser based Tools',
        start_url: './',
        id: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
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
          action: 'index.html',
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
            action: 'index.html',
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
                '.mod',
                '.xm',
                '.it',
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
              'application/zip': ['.zip'],
              'application/x-tar': ['.tar'],
              'application/gzip': ['.gz', '.tar.gz', '.tgz'],
              'application/x-7z-compressed': ['.7z'],
              'application/x-xz': ['.xz', '.tar.xz'],
              'application/x-rar-compressed': ['.rar'],
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
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,md,json,webmanifest}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['sw-share-target.js', 'sw-bg-timer.js'],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
          {
            // Never cache cross-origin requests in the app SW.
            urlPattern: ({ url }) => url.origin !== self.location.origin,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'no-cache-external',
            },
          },
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
              fetchOptions: {
                credentials: 'same-origin',
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.wasm') || url.pathname.endsWith('.onnx'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-onnx-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/events')) {
              proxyRes.headers['content-type'] = 'text/event-stream';
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['connection'] = 'keep-alive';
            }
          });
        },
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [],
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
        replacement: path.resolve(__dirname, 'node_modules/lucide/dist/esm/lucide.mjs'),
      },
      {
        find: '@tools',
        replacement: path.resolve(__dirname, 'src/tools'),
      },
      {
        find: '@css',
        replacement: path.resolve(__dirname, 'src/css'),
      },
      {
        find: 'argon2-browser',
        replacement: path.resolve(
          __dirname,
          'src/tools/keepass-viewer/node_modules/argon2-browser/dist/argon2-bundled.min.js'
        ),
      },
      {
        find: '@js',
        replacement: path.resolve(__dirname, 'src/js'),
      },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
    chunkSizeWarningLimit: 3000,
    target: 'esnext',
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
      '7z-wasm',
    ],
  },
  assetsInclude: ['**/*.wasm'],
});
