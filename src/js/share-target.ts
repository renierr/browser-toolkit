import type { Tool } from './types';

/**
 * IndexedDB helper for reading shared files stored by the service worker.
 */
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

/**
 * Cleanup old shared files from IndexedDB (files older than 1 hour).
 */
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

/**
 * Information about shared content from the URL parameters.
 */
export interface SharedContent {
  keys: string[];
  mimeTypes: string[];
  text?: string;
}

/**
 * Check if there are shared files in the URL parameters.
 */
export function getSharedContentInfo(): SharedContent | null {
  const params = new URLSearchParams(location.search);
  if (!params.get('shared')) return null;

  const keysParam = params.get('keys');
  const mimesParam = params.get('mimes');

  if (!keysParam) return null;

  return {
    keys: keysParam.split(',').filter(Boolean),
    mimeTypes: mimesParam?.split(',') ?? [],
    text: params.get('text') || undefined,
  };
}

/**
 * Load shared files from IndexedDB.
 */
export async function loadSharedFiles(keys: string[]): Promise<File[]> {
  const files: File[] = [];

  for (const key of keys) {
    try {
      const fileOrBlob = await idbGet(key);
      if (fileOrBlob) {
        // Convert Blob to File if necessary
        if (fileOrBlob instanceof File) {
          files.push(fileOrBlob);
        } else {
          // Create a File from Blob with a generic name
          const file = new File([fileOrBlob], 'shared-file', { type: fileOrBlob.type });
          files.push(file);
        }
        // Clean up after loading
        await idbDelete(key);
      }
    } catch (e) {
      console.error(`Failed to load shared file with key ${key}`, e);
    }
  }

  return files;
}

/**
 * Clear shared content parameters from URL without reloading.
 */
export function clearSharedParams(): void {
  const url = new URL(location.href);
  url.searchParams.delete('shared');
  url.searchParams.delete('keys');
  url.searchParams.delete('mimes');
  url.searchParams.delete('text');
  history.replaceState(null, '', url.href);
}

/**
 * Check if a MIME type matches an accept pattern.
 * Supports wildcards like "image/*".
 */
export function mimeTypeMatches(mimeType: string, pattern: string): boolean {
  if (!mimeType || !pattern) return false;

  const mime = mimeType.toLowerCase();
  const pat = pattern.toLowerCase();

  // Exact match
  if (mime === pat) return true;

  // Wildcard match (e.g., "image/*" matches "image/png")
  if (pat.endsWith('/*')) {
    const prefix = pat.slice(0, -1); // "image/"
    if (mime.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Find a tool that can handle the given MIME types.
 * Returns the first matching tool or undefined.
 */
export function findToolForMimeTypes(tools: Tool[], mimeTypes: string[]): Tool | undefined {
  const matches = findAllToolsForMimeTypes(tools, mimeTypes);
  return matches.length > 0 ? matches[0] : undefined;
}

/**
 * Find all tools that can handle the given MIME types.
 * Returns an array of matching tools, sorted by order (ascending) then name.
 */
export function findAllToolsForMimeTypes(tools: Tool[], mimeTypes: string[]): Tool[] {
  if (!mimeTypes.length) return [];

  // Use the first file's MIME type to determine the tool
  const primaryMime = mimeTypes[0];
  const matches: Tool[] = [];

  for (const tool of tools) {
    if (!tool.shareTarget?.accept) continue;

    for (const pattern of tool.shareTarget.accept) {
      if (mimeTypeMatches(primaryMime, pattern)) {
        matches.push(tool);
        break; // Don't add same tool twice
      }
    }
  }

  // Sort by order (ascending) then by name
  return matches.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Payload passed to tools when shared files are received.
 */
export interface SharedFilesPayload {
  sharedFiles: File[];
  mimeTypes: string[];
  text?: string;
}

/**
 * Setup the Launch Handler API for file_handlers (Windows/macOS "Open with").
 * Returns a promise that resolves with the files when they are received,
 * or null if no files are pending.
 */
export function setupLaunchHandler(): Promise<File[] | null> {
  return new Promise((resolve) => {
    if (!('launchQueue' in window)) {
      resolve(null);
      return;
    }

    const collectedFiles: File[] = [];
    let resolved = false;
    let resolveTimeout: ReturnType<typeof setTimeout> | null = null;

    const doResolve = (files: File[] | null) => {
      if (resolved) return;
      resolved = true;
      if (resolveTimeout) clearTimeout(resolveTimeout);
      resolve(files);
    };

    // Set initial timeout - if no files arrive, assume none are coming
    const initialTimeout = setTimeout(() => {
      doResolve(null);
    }, 300);

    (window as any).launchQueue.setConsumer(async (launchParams: any) => {
      clearTimeout(initialTimeout);

      if (!launchParams.files || launchParams.files.length === 0) {
        // No files in this launch - resolve null
        doResolve(null);
        return;
      }

      // Collect files from this launch event
      for (const fileHandle of launchParams.files) {
        try {
          const file = await fileHandle.getFile();
          collectedFiles.push(file);
        } catch (e) {
          console.error('Failed to get file from handle:', e);
        }
      }

      // Reset the resolve timeout - wait a bit for more files
      if (resolveTimeout) {
        clearTimeout(resolveTimeout);
      }
      resolveTimeout = setTimeout(() => {
        doResolve(collectedFiles.length > 0 ? collectedFiles : null);
      }, 100);
    });
  });
}

