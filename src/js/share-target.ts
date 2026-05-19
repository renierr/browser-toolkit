import type { Tool } from './types';
import { getMimeTypeFromFileName } from './mime-types';

function openDbClient(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const DB_NAME = 'shared-db';
    const STORE_NAME = 'files';
    const DB_VERSION = 11;

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        const deleteReq = indexedDB.deleteDatabase(DB_NAME);
        deleteReq.onsuccess = () => {
          openDbClient().then(resolve).catch(reject);
        };
        deleteReq.onerror = () => reject(new Error('Failed to recreate corrupted IDB'));
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('IDB open blocked');
  });
}

async function idbGet(key: string): Promise<File | Blob | undefined> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const r = store.get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) {
      rej(e);
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDbClient();
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    } catch (e) {
      rej(e);
    }
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
  keys: string[];
  mimeTypes: string[];
}

export function getSharedContentInfo(): SharedContent | null | string {
  const params = new URLSearchParams(location.search);
  if (!params.get('shared')) return null;

  const keysParam = params.get('keys');
  const mimesParam = params.get('mimes');
  const namesParam = params.get('names');
  const errorParam = params.get('sw_error');
  const textContent = params.get('text_content');

  if (errorParam !== null) return errorParam;

  const keys = keysParam ? keysParam.split(',').filter(Boolean) : [];
  const mimes = mimesParam?.split(',') ?? [];
  const fileNames = namesParam?.split(',').filter(Boolean) ?? [];

  if (textContent) {
    keys.push(`inline-${Date.now()}`);
    mimes.push(params.get('text_mime') || 'text/plain');
    fileNames.push(params.get('text_name') || 'shared-text.txt');
  }

  if (keys.length === 0) return null;

  const mimeTypes = mimes.map((mime, i) => getMimeTypeFromFileName(mime, fileNames[i] ?? ''));

  return {
    keys,
    mimeTypes,
    fileNames: fileNames.length > 0 ? fileNames : undefined,
  };
}

export async function loadSharedFiles(keys: string[]): Promise<File[]> {
  const files: File[] = [];
  const params = new URLSearchParams(location.search);
  const textContent = params.get('text_content');
  const namesParam = params.get('names');
  const fileNames = namesParam ? namesParam.split(',').filter(Boolean) : [];

  const timeoutMs = 5000;
  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs)
  );

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.startsWith('inline-') && textContent) {
      const name = params.get('text_name') || 'shared-text.txt';
      const mime = params.get('text_mime') || 'text/plain';
      files.push(new File([textContent], name, { type: mime }));
      continue;
    }

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
          const name = fileNames[i] || 'shared-file';
          const file = new File([fileOrBlob], name, { type: fileOrBlob.type });
          files.push(file);
        }
        await idbDelete(key).catch(() => {});
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
  url.searchParams.delete('names');
  url.searchParams.delete('sw_error');
  url.searchParams.delete('text_content');
  url.searchParams.delete('text_mime');
  url.searchParams.delete('text_name');
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
