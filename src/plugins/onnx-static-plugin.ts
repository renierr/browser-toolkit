import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ONNX_DIST = resolve(__dirname, '../../node_modules/onnxruntime-web/dist');
const ONNX_FILES = fs.readdirSync(ONNX_DIST).filter((f) => /^ort-wasm.*\.(mjs|wasm)$/.test(f));

export function onnxStaticPlugin(): Plugin {
  return {
    name: 'vite-plugin-onnx-static',

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
