const MIME_TYPE_FALLBACKS = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.php': 'text/x-php',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-csrc',
  '.cpp': 'text/x-c++src',
  '.h': 'text/x-chdr',
  '.hpp': 'text/x-c++hdr',
  '.cs': 'text/x-csharp',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.scala': 'text/x-scala',
  '.r': 'text/x-r',
  '.sql': 'application/sql',
  '.graphql': 'application/graphql',
  '.mdx': 'text/markdown',
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
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.psd': 'image/vnd.adobe.photoshop',
  '.ai': 'application/postscript',
  '.eps': 'application/postscript',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.mod': 'audio/mod',
  '.xm': 'audio/xm',
  '.it': 'audio/it',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  '.xz': 'application/x-xz',
  '.iso': 'application/x-iso9660-image',
  '.img': 'application/x-raw-disk-image',
  '.dmg': 'application/x-apple-diskimage',
  '.exe': 'application/x-msdownload',
  '.msi': 'application/x-msdownload',
  '.dll': 'application/x-msdownload',
  '.sys': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.dat': 'application/octet-stream',
  '.dmp': 'application/octet-stream',
  '.hex': 'text/plain',
  '.vmdk': 'application/x-vmdk',
  '.vhd': 'application/x-vhd',
  '.sqlite': 'application/vnd.sqlite3',
  '.sqlite3': 'application/vnd.sqlite3',
  '.db': 'application/vnd.sqlite3',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub': 'application/epub+zip',
  '.fb2': 'application/xml',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw': 'application/vnd.amazon.ebook',
  '.ics': 'text/calendar',
  '.vcf': 'text/vcard',
};

function getMimeTypeFromFileName(mime, fileName) {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext && MIME_TYPE_FALLBACKS['.' + ext]) return MIME_TYPE_FALLBACKS['.' + ext];
  return mime || 'application/octet-stream';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shared-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        db.close();
        const req2 = indexedDB.open('shared-db', 2);
        req2.onupgradeneeded = () => {
          const db2 = req2.result;
          if (!db2.objectStoreNames.contains('files')) db2.createObjectStore('files');
        };
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
        return;
      }
      resolve(db);
    };
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

  const isShareTarget =
    req.method === 'POST' &&
    (url.pathname.endsWith('/index.html') ||
      url.pathname === '/' ||
      url.pathname === '');

  if (!isShareTarget) return;

  event.respondWith(
    (async () => {
      let form;
      try {
        form = await req.formData();
      } catch (err) {
        const errMsg = encodeURIComponent(String(err));
        return Response.redirect(`./index.html?shared=1&sw_error=${errMsg}`, 303);
      }

      const keys = [];
      const mimeTypes = [];
      const fileNames = [];

      const blobs = Array.from(form.entries())
        .filter(([, value]) => value instanceof Blob)
        .map(([, value]) => value);

      for (let i = 0; i < blobs.length; i++) {
        const f = blobs[i];
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
        try {
          await idbPut(key, f);
        } catch (err) {
          const errMsg = encodeURIComponent(String(err));
          return Response.redirect(`./index.html?shared=1&sw_error=${errMsg}`, 303);
        }
        keys.push(key);
        mimeTypes.push(getMimeTypeFromFileName(f.type || '', f.name || ''));
        fileNames.push(f.name || '');
      }

      const textValue = form.get('text');
      const titleValue = form.get('title');
      const urlValue = form.get('url');

      let textContent = '';
      if (urlValue && typeof urlValue === 'string') textContent += urlValue;
      if (textValue && typeof textValue === 'string') {
        if (textContent) textContent += '\n';
        textContent += textValue;
      }

      if (textContent) {
        const fileName =
          titleValue && typeof titleValue === 'string' && titleValue.trim()
            ? titleValue.trim()
            : 'shared-text.txt';
        const mime = getMimeTypeFromFileName('', fileName);
        const blob = new Blob([textContent], { type: mime });
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-text`;
        try {
          await idbPut(key, blob);
          keys.push(key);
          mimeTypes.push(mime);
          fileNames.push(fileName);
        } catch (err) {
          const errMsg = encodeURIComponent(String(err));
          return Response.redirect(`./index.html?shared=1&sw_error=${errMsg}`, 303);
        }
      }

      const redirectUrl = new URL('./index.html', self.registration.scope);
      redirectUrl.searchParams.set('shared', '1');
      redirectUrl.searchParams.set('keys', keys.join(','));
      redirectUrl.searchParams.set('mimes', mimeTypes.join(','));
      redirectUrl.searchParams.set('names', fileNames.join(','));

      return Response.redirect(redirectUrl.href, 303);
    })()
  );
});
