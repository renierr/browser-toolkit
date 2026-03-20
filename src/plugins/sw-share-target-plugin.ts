import type { Plugin } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SW_SOURCE = 'src/sw-share-target.ts';
const SW_OUTPUT = 'sw-share-target.js';

export function swShareTargetPlugin(): Plugin {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const swSourcePath = resolve(__dirname, '..', SW_SOURCE);
  const mimeTypesPath = resolve(__dirname, '..', 'src/js/mime-types.ts');

  function readMimeTypes(): string {
    if (!existsSync(mimeTypesPath)) return '';
    const source = readFileSync(mimeTypesPath, 'utf-8');
    
    // Extract MIME_TYPE_FALLBACKS object
    const mimeTypeMapMatch = source.match(/export const MIME_TYPE_FALLBACKS[^=]*=\s*\{([^}]*)\}/s);
    const fallbackObj = mimeTypeMapMatch ? mimeTypeMapMatch[1] : '';
    
    // Build the inlined utilities
    return `
const MIME_TYPE_FALLBACKS = {${fallbackObj}};

function getMimeTypeFromFileName(mime, fileName) {
  if (mime && mime !== 'application/octet-stream') {
    return mime;
  }
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext && MIME_TYPE_FALLBACKS['.' + ext]) {
    return MIME_TYPE_FALLBACKS['.' + ext];
  }
  return mime || 'application/octet-stream';
}
`;
  }

  function transformSwCode(code: string): string {
    // Remove TypeScript references and imports
    let result = code
      .replace(/\/\/\/ <reference[^>]*>/g, '')
      .replace(/import\s*\{[^}]*\}\s*from\s*'[^']*';/g, '')
      .replace(/declare\s+const\s+self:\s*ServiceWorkerGlobalScope;/g, '')
      .replace(/\s*as\s+File\b/g, '')
      .replace(/\s*:\s*File\b/g, '')
      .replace(/\s*:\s*Blob\b/g, '')
      .replace(/\s*:\s*string\b/g, '')
      .replace(/\s*:\s*string\[\]/g, '')
      .replace(/\s*:\s*Promise<void>/g, '')
      .replace(/\s*:\s*IDBDatabase/g, '')
      .replace(/\s*:\s*FetchEvent/g, '')
      .replace(/<FetchEvent>/g, '');

    return result;
  }

  const inlinedMimeUtils = readMimeTypes();

  return {
    name: 'vite-plugin-sw-share-target',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url.endsWith('/' + SW_OUTPUT) || url === '/' + SW_OUTPUT || url.includes(SW_OUTPUT)) {
          try {
            if (!existsSync(swSourcePath)) {
              res.statusCode = 404;
              res.end('Service worker source not found');
              return;
            }

            const code = readFileSync(swSourcePath, 'utf-8');
            const transformed = transformSwCode(code);
            const finalCode = inlinedMimeUtils + transformed;

            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Service-Worker-Allowed', '/');
            res.end(finalCode);
          } catch (err) {
            console.error('[SW Plugin] Failed to compile service worker:', err);
            res.statusCode = 500;
            res.end('Failed to compile service worker');
          }
          return;
        }
        next();
      });
    },

    generateBundle() {
      try {
        if (!existsSync(swSourcePath)) return;

        const code = readFileSync(swSourcePath, 'utf-8');
        const transformed = transformSwCode(code);
        const finalCode = inlinedMimeUtils + transformed;

        this.emitFile({
          type: 'asset',
          fileName: SW_OUTPUT,
          source: finalCode,
        });
      } catch (err) {
        console.error('[SW Plugin] Failed to emit service worker:', err);
      }
    },
  };
}
