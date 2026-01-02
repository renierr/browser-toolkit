import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import { default as EmbedPDF, type EmbedPdfContainer, ZoomMode, } from '@embedpdf/snippet';
import { getDocManager, getViewerCommands, getViewerUi, registerLucideIcon } from './js/embedpdf-utils.ts';
import { House } from 'lucide';

function openDbClient(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shared-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetClient(key: string): Promise<File | Blob | undefined> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readonly');
    const r = tx.objectStore('files').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function cleanupOldFiles(): Promise<void> {
  try {
    const db = await openDbClient();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const req = store.getAllKeys();

      req.onsuccess = () => {
        const keys = req.result as string[];
        const now = Date.now();
        const MAX_AGE = 60 * 60 * 1000; // 1 hour

        for (const key of keys) {
          const parts = key.split('-');
          const timestamp = parseInt(parts[0], 10);

          if (!isNaN(timestamp) && (now - timestamp > MAX_AGE)) {
            store.delete(key);
          }
        }
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Cleanup failed', e);
  }
}

let viewerInstance: EmbedPdfContainer | undefined;

async function initViewer() {
  const viewerContainer = document.getElementById('pdf-viewer');
  if (viewerContainer) {
    const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
    viewerInstance = EmbedPDF.init({
      type: 'container',
      target: viewerContainer,
      wasmUrl: absolutePdfiumWasmUrl,
      theme: { preference: 'dark' },
      zoom: { defaultZoomLevel: ZoomMode.FitWidth },
    });

    if (viewerInstance) {
      const registry = await viewerInstance.registry;
      if (registry) {
        const ui = await getViewerUi(registry);
        const commands = await getViewerCommands(registry);

        if (commands && ui) {
          // Register Home Icon (Lucide House)
          registerLucideIcon(viewerInstance, 'icon-home', House);

          commands.registerCommand({
            id: 'app.go-home',
            label: 'Home',
            icon: 'icon-home',
            action: () => {
              window.location.href = './index.html';
            }
          });

          const schema = ui.getSchema();
          const toolbar = schema.toolbars['main-toolbar'];
          if (toolbar) {
            const items = JSON.parse(JSON.stringify(toolbar.items));
            const leftGroup = items.find((item: any) => item.id === 'left-group');

            const homeButton = {
              type: 'command-button',
              id: 'home-button',
              commandId: 'app.go-home',
              variant: 'icon'
            };

            if (leftGroup) {
              leftGroup.items.unshift(homeButton);
            } else {
              items.unshift(homeButton);
            }

            ui.mergeSchema({
              toolbars: { 'main-toolbar': { ...toolbar, items } }
            });
          }
        }
      }
    }
  }
}

function getSharedUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) return url;
  return params.get('text');
}

async function handleSharedContent() {
  if (!viewerInstance) return;
  const registry = await viewerInstance.registry;
  if (!registry) return;
  const docManager = await getDocManager(registry);
  if (!docManager) return;

  // 1. Handle Launch Handler API (file_handlers)
  if ('launchQueue' in window) {
    (window as any).launchQueue.setConsumer(async (launchParams: any) => {
      if (launchParams.files && launchParams.files.length > 0) {
        for (const fileHandle of launchParams.files) {
          const file = await fileHandle.getFile();
          const buffer = await file.arrayBuffer();
          docManager.openDocumentBuffer({ buffer, name: file.name });
        }
      }
    });
  }

  // 2. Handle shared files from Service Worker (share_target)
  const params = new URLSearchParams(location.search);
  if (params.get('shared')) {
    const keysParam = params.get('keys');
    if (keysParam) {
      const keys = keysParam.split(',').filter(Boolean);
      for (const key of keys) {
        try {
          const fileOrBlob = await idbGetClient(key);
          if (fileOrBlob) {
            const buffer = await fileOrBlob.arrayBuffer();
            const name = (fileOrBlob as File).name || 'Shared PDF';
            docManager.openDocumentBuffer({ buffer, name });
          }
        } catch (e) {
          console.error(`Failed to load shared file with key ${key}`, e);
        }
      }
    }
  }

  // 3. Handle shared URL (fallback or direct link)
  const sharedUrl = getSharedUrl();
  if (sharedUrl) {
    try {
        new URL(sharedUrl);
        console.log('Loading shared URL:', sharedUrl);
    } catch (e) {
        // Not a URL
    }
  }
}

window.addEventListener('load', () => {
  // Cleanup old files in background
  cleanupOldFiles().catch((e) => console.warn('Cleanup failed', e));

  // Initialize viewer immediately
  initViewer().then(() => {
    // Check for shared content once viewer is ready
    return handleSharedContent();
  }).catch((e) => console.error('Failed to initialize viewer', e));
});
