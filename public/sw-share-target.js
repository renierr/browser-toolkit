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

// Helper to determine the MIME type category for routing
function getMimeCategory(file) {
  const type = file.type || '';
  if (type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  if (type.startsWith('image/')) {
    return 'image';
  }
  if (type.startsWith('text/') || type === 'application/json') {
    return 'text';
  }
  return 'unknown';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Handle share target POST requests to index.html or pdf.html
  if (req.method === 'POST' && (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/pdf.html') || url.pathname === '/' || url.pathname === '')) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const files = form.getAll('files') || [];
          const keys = [];
          const mimeTypes = [];

          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
            await idbPut(key, f);
            keys.push(key);
            mimeTypes.push(f.type || '');
          }

          const text = encodeURIComponent(form.get('text') || '');

          // Determine target based on first file's MIME type
          const firstMime = mimeTypes[0] || '';
          const isPdf = firstMime === 'application/pdf' || (files[0]?.name?.toLowerCase().endsWith('.pdf'));

          // Construct absolute URL for redirection
          const targetPath = isPdf ? './pdf.html' : './index.html';
          const redirectUrl = new URL(targetPath, self.location.href);
          redirectUrl.searchParams.set('shared', '1');
          redirectUrl.searchParams.set('keys', keys.join(','));
          redirectUrl.searchParams.set('mimes', mimeTypes.join(','));
          if (text) redirectUrl.searchParams.set('text', text);

          return Response.redirect(redirectUrl.href, 303);
        } catch (err) {
          console.error('SW: Share processing failed', err);
          return new Response('Share processing failed', { status: 500 });
        }
      })()
    );
  }
});
