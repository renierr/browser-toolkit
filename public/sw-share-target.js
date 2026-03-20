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

const MIME_TYPE_FALLBACKS = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.php': 'text/x-php',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

function getMimeType(fallback, filename) {
  if (fallback && fallback !== 'application/octet-stream') {
    return fallback;
  }
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (ext) {
    return MIME_TYPE_FALLBACKS['.' + ext] || fallback || 'application/octet-stream';
  }
  return fallback || 'application/octet-stream';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Handle share target POST requests - always route to index.html for tool chooser
  if (req.method === 'POST' && (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/pdf.html') || url.pathname === '/' || url.pathname === '')) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const keys = [];
          const mimeTypes = [];
          const fileNames = [];

          // Collect ALL blobs from form, regardless of field name
          const blobs = [];
          for (const [name, value] of form.entries()) {
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
            const mime = getMimeType(f.type || '', f.name);
            mimeTypes.push(mime);
            fileNames.push(f.name || '');
          }

          const rawText = form.get('text') || '';
          const title = form.get('title') || '';
          const text = encodeURIComponent(rawText);

          // Handle text-only shares (when no files are present)
          if (blobs.length === 0 && rawText) {
            const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const textBlob = new Blob([rawText], { type: 'text/plain' });
            await idbPut(key, textBlob);
            keys.push(key);
            mimeTypes.push('text/plain');
            fileNames.push('shared-text.txt');
          }

          // Always redirect to index.html - the app will show tool chooser if multiple tools match
          const redirectUrl = new URL('./index.html', self.location.href);
          redirectUrl.searchParams.set('shared', '1');
          redirectUrl.searchParams.set('keys', keys.join(','));
          redirectUrl.searchParams.set('mimes', mimeTypes.join(','));
          redirectUrl.searchParams.set('names', fileNames.join(','));
          if (text) redirectUrl.searchParams.set('text', text);
          if (title) redirectUrl.searchParams.set('title', encodeURIComponent(title));

          return Response.redirect(redirectUrl.href, 303);
        } catch (err) {
          console.error('SW: Share processing failed', err);
          return new Response('Share processing failed', { status: 500 });
        }
      })()
    );
  }
});
