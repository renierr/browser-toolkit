import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Vite plugin: copy onnxruntime-web WASM + MJS files from node_modules
// ---------------------------------------------------------------------------
// onnxruntime-web loads its Emscripten glue (.mjs) and WASM binary at runtime
// via dynamic import() with hardcoded filenames that Vite cannot statically
// analyse or hash. This plugin copies them into dist/onnx/ at build time and
// serves them from /onnx/ during dev so ort.env.wasm.wasmPaths can point at
// a known, stable location.
//
// Which variant is needed? The default `import 'onnxruntime-web'` currently
// resolves to the JSEP build and only references the .jsep files. We copy all
// variants so that future ort entry-point changes (e.g. switching to the
// webgpu or jspi export) work without touching this config again.
//
// Cache busting: the filenames are stable (no hash). Workbox precaches them
// with a content-based revision so a dependency upgrade triggers a cache
// refresh automatically.
// ---------------------------------------------------------------------------
const ONNX_DIST = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
const ONNX_FILES = fs.readdirSync(ONNX_DIST).filter((f) => /^ort-wasm.*\.(mjs|wasm)$/.test(f));

function onnxStaticPlugin(): Plugin {
  return {
    name: 'vite-plugin-onnx-static',

    // Dev: serve files from node_modules under /onnx/*
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/onnx/')) {
          const fileName = req.url.slice('/onnx/'.length).split('?')[0];
          if (ONNX_FILES.includes(fileName)) {
            const filePath = path.join(ONNX_DIST, fileName);
            const contentType = fileName.endsWith('.wasm')
              ? 'application/wasm'
              : 'application/javascript';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },

    // Build: emit the files into dist/onnx/
    generateBundle() {
      for (const fileName of ONNX_FILES) {
        const source = fs.readFileSync(path.join(ONNX_DIST, fileName));
        this.emitFile({
          type: 'asset',
          fileName: `onnx/${fileName}`,
          source,
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
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
              'text/*': [
                '.txt',
                '.json',
                '.xml',
                '.html',
                '.css',
                '.js',
                '.ts',
                '.md',
                '.yaml',
                '.yml',
                '.py',
                '.sh',
                '.php',
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
              ],
              'audio/*': ['.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a', '.aac'],
              'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'],
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
                '.7z',
                '.zip',
                '.rar',
                '.tar',
                '.gz',
              ],
              'application/vnd.sqlite3': ['.sqlite', '.sqlite3', '.db'],
              'application/x-sqlite3': ['.sqlite', '.sqlite3', '.db'],
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
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['lucide'],
    exclude: ['mupdf', '@ffmpeg/core', '@ffmpeg/ffmpeg', '@ffmpeg/util', 'onnxruntime-web'],
  },
  assetsInclude: ['**/*.wasm'],
});
