import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import {
  default as EmbedPDF,
  ZoomMode,
  type PluginRegistry,
  type DocumentManagerPlugin,
  type EmbedPdfContainer,
} from '@embedpdf/snippet';

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

const getDocManager = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof DocumentManagerPlugin>>('document-manager')
    ?.provides();
};

let viewerInstance: EmbedPdfContainer | undefined;

async function initViewer() {
  const viewerContainer = document.getElementById('pdf-viewer');
  if (viewerContainer) {
    const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
    viewerInstance = EmbedPDF.init({
      type: 'container',
      target: viewerContainer,
      wasmUrl: absolutePdfiumWasmUrl,
      src: '/empty.pdf',
      theme: { preference: 'dark' },
      zoom: { defaultZoomLevel: ZoomMode.FitWidth },
    });
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

  // Handle shared files from Service Worker
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
            await docManager.openDocumentBuffer({ buffer, name });
          }
        } catch (e) {
          console.error(`Failed to load shared file with key ${key}`, e);
        }
      }
    }
  }

  // Handle shared URL (fallback or direct link)
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

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;

  const swUrl = '/sw-share-target.js';
  const scopeDir = '/';

  try {
    const reg = await navigator.serviceWorker.register(swUrl, {
      type: 'module',
      scope: scopeDir,
    });

    if (reg.waiting) {
      try {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch (e) {
        /* ignore */
      }
    }

    const pageControllable = location.pathname.startsWith(scopeDir);
    if (pageControllable) {
      await new Promise<void>((resolve) => {
        if (navigator.serviceWorker.controller) return resolve();
        const onController = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onController);
          resolve();
        };
        const timeout = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', onController);
          resolve();
        }, 10000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timeout);
          onController();
        });
      });
    } else {
      console.warn('Page not inside SW scope. SW registered with scope:', scopeDir);
    }

    if (navigator.serviceWorker.controller) {
      console.log('Service worker is controlling the page.');
    } else {
      console.warn('Service worker did not take control within timeout.');
    }
  } catch (err) {
    console.error('SW registration failed', err);
  }
}

window.addEventListener('load', () => {
  // Register SW for future shares, but don't block viewer init
  registerServiceWorker().catch((e) => console.error('SW registration failed', e));
  
  // Cleanup old files in background
  cleanupOldFiles().catch((e) => console.warn('Cleanup failed', e));

  // Initialize viewer immediately
  initViewer().then(() => {
    // Check for shared content once viewer is ready
    return handleSharedContent();
  }).catch((e) => console.error('Failed to initialize viewer', e));
});
