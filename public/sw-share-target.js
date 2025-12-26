// minimal IndexedDB helper (used only in SW)
function openDb() {
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

async function idbPut(key, value) {
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
  if (req.method === 'POST' && url.pathname.endsWith('/pdf.html')) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const files = form.getAll('files') || [];
          const keys = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
            await idbPut(key, f);
            keys.push(key);
          }
          const text = encodeURIComponent(form.get('text') || '');
          const dest = `/pdf.html?shared=1&keys=${keys.join(',')}&text=${text}`;
          return Response.redirect(dest, 303);
        } catch (err) {
          console.error('SW: Share processing failed', err);
          return new Response('Share processing failed', { status: 500 });
        }
      })()
    );
  }
});
