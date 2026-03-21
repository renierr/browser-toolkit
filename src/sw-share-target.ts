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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isShareTarget =
    req.method === 'POST' &&
    (url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/pdf.html') ||
      url.pathname === '/' ||
      url.pathname === '');

  if (!isShareTarget) return;

  event.respondWith(
    (async () => {
      try {
        const form = await req.formData();
        const keys: string[] = [];
        const mimeTypes: string[] = [];
        const fileNames: string[] = [];

        const blobs = Array.from(form.entries())
          .filter(([, value]) => value instanceof Blob)
          .map(([, value]) => value as File);

        for (let i = 0; i < blobs.length; i++) {
          const f = blobs[i];
          const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
          await idbPut(key, f);
          keys.push(key);
          mimeTypes.push(getMimeTypeFromFileName(f.type || '', f.name || ''));
          fileNames.push(f.name || '');
        }

        const basePath = self.location.pathname.replace(/[^/]*$/, '');
        const redirectUrl = new URL(basePath + 'index.html', self.location.origin);
        redirectUrl.searchParams.set('shared', '1');
        redirectUrl.searchParams.set('keys', keys.join(','));
        redirectUrl.searchParams.set('mimes', mimeTypes.join(','));
        redirectUrl.searchParams.set('names', fileNames.join(','));

        return Response.redirect(redirectUrl.href, 303);
      } catch (err) {
        console.error('SW: Share processing failed', err);
        const basePath = self.location.pathname.replace(/[^/]*$/, '');
        return Response.redirect(basePath + 'index.html?error=1', 303);
      }
    })()
  );
});
