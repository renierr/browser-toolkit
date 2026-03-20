import type { Tool } from './types';

const MIME_TYPE_FALLBACKS: Record<string, string> = {
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

function getMimeTypeFromFileName(mime: string, fileName: string): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext && MIME_TYPE_FALLBACKS['.' + ext]) return MIME_TYPE_FALLBACKS['.' + ext];
  return mime || 'text/plain';
}

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

async function idbGet(key: string): Promise<File | Blob | undefined> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readonly');
    const r = tx.objectStore('files').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function cleanupOldSharedFiles(): Promise<void> {
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

          if (!isNaN(timestamp) && now - timestamp > MAX_AGE) {
            store.delete(key);
          }
        }
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Cleanup shared files failed', e);
  }
}

export interface SharedContent {
  fileNames?: string[];
  title?: string;
  keys: string[];
  mimeTypes: string[];
  text?: string;
}

export function getSharedContentInfo(): SharedContent | null {
  const params = new URLSearchParams(location.search);
  if (!params.get('shared')) return null;

  const keysParam = params.get('keys');
  const mimesParam = params.get('mimes');
  const text = params.get('text') || undefined;
  const title = params.get('title') || undefined;
  const namesParam = params.get('names');

  if (!keysParam && !text) return null;

  const keys = keysParam ? keysParam.split(',').filter(Boolean) : [];
  const mimes = mimesParam?.split(',') ?? (text ? ['text/plain'] : []);
  const fileNames = namesParam?.split(',').filter(Boolean) ?? [];

  const mimeTypes = mimes.map((mime, i) => getMimeTypeFromFileName(mime, fileNames[i] ?? ''));

  return {
    keys,
    mimeTypes,
    fileNames: fileNames.length > 0 ? fileNames : undefined,
    text,
    title,
  };
}

export async function loadSharedFiles(keys: string[]): Promise<File[]> {
  const files: File[] = [];

  const timeoutMs = 5000;
  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs)
  );

  for (const key of keys) {
    try {
      const result = await Promise.race([idbGet(key), timeoutPromise]);
      if (result === 'timeout') {
        console.warn(`[share-target] Timeout loading shared file with key ${key}`);
        break;
      }
      const fileOrBlob = result;
      if (fileOrBlob) {
        if (fileOrBlob instanceof File) {
          files.push(fileOrBlob);
        } else {
          const file = new File([fileOrBlob], 'shared-file', { type: fileOrBlob.type });
          files.push(file);
        }
        await idbDelete(key).catch(() => { });
      }
    } catch (e) {
      console.error(`Failed to load shared file with key ${key}`, e);
    }
  }

  return files;
}

export function clearSharedParams(): void {
  const url = new URL(location.href);
  url.searchParams.delete('shared');
  url.searchParams.delete('keys');
  url.searchParams.delete('mimes');
  url.searchParams.delete('text');
  url.searchParams.delete('names');
  url.searchParams.delete('title');
  history.replaceState(null, '', url.href);
}

export function mimeTypeMatches(mimeType: string, pattern: string): boolean {
  if (!mimeType || !pattern) return false;

  const mime = mimeType.toLowerCase();
  const pat = pattern.toLowerCase();

  if (mime === pat) return true;
  if (pat === '*/*') return true;
  if (pat.endsWith('/*')) {
    const category = pat.split('/')[0] + '/';
    if (mime.startsWith(category)) return true;
  }

  return false;
}

export function findToolForMimeTypes(tools: Tool[], mimeTypes: string[]): Tool | undefined {
  const matches = findAllToolsForMimeTypes(tools, mimeTypes);
  return matches.length > 0 ? matches[0] : undefined;
}

export function findAllToolsForMimeTypes(tools: Tool[], mimeTypes: string[]): Tool[] {
  if (!mimeTypes.length) return [];

  const primaryMime = mimeTypes[0];
  const matches: Tool[] = [];

  for (const tool of tools) {
    if (!tool.shareTarget?.accept) continue;

    for (const pattern of tool.shareTarget.accept) {
      if (mimeTypeMatches(primaryMime, pattern)) {
        matches.push(tool);
        break;
      }
    }
  }

  return matches.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}

export interface SharedFilesPayload {
  sharedFiles: File[];
  mimeTypes: string[];
  text?: string;
}

export function setupLaunchHandler(callback: (files: File[]) => void): () => void {
  if (!('launchQueue' in window)) {
    return () => {};
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const handleLaunch = async (launchParams: any) => {
    const files = launchParams?.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(async () => {
      const collectedFiles: File[] = [];
      for (const fileHandle of files) {
        try {
          const file = await fileHandle.getFile();
          collectedFiles.push(file);
        } catch (e) {
          console.error('Failed to get file from handle:', e);
        }
      }
      if (collectedFiles.length > 0) {
        callback(collectedFiles);
      }
    }, 150);
  };

  try {
    (window as any).launchQueue.setConsumer(handleLaunch);
  } catch (e) {
    console.warn('launchQueue.setConsumer failed:', e);
  }

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}
