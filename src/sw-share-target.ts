/// <reference lib="webworker" />

import { getMimeTypeFromFileName } from './js/mime-types';

declare const self: ServiceWorkerGlobalScope;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shared-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function getMimeType(fallback: string, filename: string): string {
  return getMimeTypeFromFileName(fallback, filename);
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  const url = new URL(req.url);

  // Handle share target POST requests - always route to index.html for tool chooser
  if (
    req.method === 'POST' &&
    (url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/pdf.html') ||
      url.pathname === '/' ||
      url.pathname === '')
  ) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const keys: string[] = [];
          const mimeTypes: string[] = [];
          const fileNames: string[] = [];

          // Collect ALL blobs from form, regardless of field name
          const blobs: Blob[] = [];
          for (const [_name, value] of form.entries()) {
            if (value instanceof Blob) {
              blobs.push(value);
            }
          }

          // Process all blobs
          for (let i = 0; i < blobs.length; i++) {
            const f = blobs[i];
            const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
            await idbPut(key, f);
            keys.push(key);
            const mime = getMimeType(f.type || '', (f as File).name || '');
            mimeTypes.push(mime);
            fileNames.push((f as File).name || '');
          }

          // Always redirect to index.html - the app will show tool chooser if multiple tools match
          const redirectUrl = new URL('./index.html', self.location.href);
          redirectUrl.searchParams.set('shared', '1');
          redirectUrl.searchParams.set('keys', keys.join(','));
          redirectUrl.searchParams.set('mimes', mimeTypes.join(','));
          redirectUrl.searchParams.set('names', fileNames.join(','));

          return Response.redirect(redirectUrl.href, 303);
        } catch (err) {
          console.error('SW: Share processing failed', err);
          return new Response('Share processing failed', { status: 500 });
        }
      })()
    );
  }
});
