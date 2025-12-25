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

async function idbGetClient(key: string): Promise<Blob | undefined> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readonly');
    const r = tx.objectStore('files').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function getSharedUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) return url;
  return params.get('text');
}

async function handleSharedKeys() {
  const params = new URLSearchParams(location.search);
  if (!params.get('shared')) return;
  const keysParam = params.get('keys');
  if (!keysParam) return;
  const keys = keysParam.split(',').filter(Boolean);
  const blobs: Blob[] = [];
  for (const key of keys) {
    const blob = await idbGetClient(key);
    if (blob) blobs.push(blob);
  }

  const viewer = document.getElementById('viewer-container') as HTMLIFrameElement | null;
  // TODO feed the viewer with shared blobs
  if (viewer && blobs.length) {
    const url = URL.createObjectURL(blobs[0]);
    console.log('shared url:', url);
//    viewer.src = url;
    // revoke later if appropriate
    // setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // fallback: if a shared url param exists, use existing logic
  const sharedUrl = getSharedUrl();
  if (sharedUrl) {
    console.log('shared url (fallback):', sharedUrl);
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

    // If a waiting worker exists, ask it to skipWaiting so it can activate immediately.
    if (reg.waiting) {
      try {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch (e) {
        /* ignore */
      }
    }

    // If this page is inside the worker's scope, wait for it to control the page.
    const pageControllable = location.pathname.startsWith(scopeDir);
    if (pageControllable) {
      await new Promise<void>((resolve) => {
        if (navigator.serviceWorker.controller) return resolve();
        const onController = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onController);
          resolve();
        };
        // 10s safety timeout
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
      // Page is outside SW scope: that's fine — SW can still store files and redirect to this page.
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
  registerServiceWorker().finally(() => {
    handleSharedKeys().catch((e) => console.error('Failed to load shared files', e));
  });
});

import pdfiumWasmUrl from '@embedpdf/snippet/dist/pdfium.wasm?url';
import {
  default as EmbedPDF,
  ZoomMode,
} from '@embedpdf/snippet';

const viewerContainer = document.getElementById('pdf-viewer');
if (viewerContainer) {
  const absolutePdfiumWasmUrl = new URL(pdfiumWasmUrl, location.href).href;
  EmbedPDF.init({
    type: 'container',
    target: viewerContainer,
    wasmUrl: absolutePdfiumWasmUrl,
    src: '/empty.pdf',
    theme: { preference: 'dark' },
    zoom: { defaultZoomLevel: ZoomMode.FitWidth },
  });
}

