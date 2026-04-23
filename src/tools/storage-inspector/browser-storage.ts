import { roughBytes } from './format';
import type {
  CookieEntry,
  IdDatabaseInfo,
  IdbEntry,
  IdbStoreEntry,
  KeyValueEntry,
  StorageEstimateData,
  Supports,
} from './types';

export function getSupports(): Supports {
  return {
    estimate: typeof navigator.storage?.estimate === 'function',
    caches: typeof caches !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    indexedDBList: hasIndexedDbListSupport(),
    localStorage: typeof localStorage !== 'undefined',
    sessionStorage: typeof sessionStorage !== 'undefined',
    cookies: navigator.cookieEnabled,
  };
}

export async function collectEstimateData(supports: Supports): Promise<StorageEstimateData> {
  if (!supports.estimate) return { usage: 0, quota: 0 };

  try {
    const data = await navigator.storage.estimate();
    return {
      usage: typeof data.usage === 'number' ? data.usage : 0,
      quota: typeof data.quota === 'number' ? data.quota : 0,
    };
  } catch (error) {
    console.error('[StorageInspector] Failed to estimate storage:', error);
    return { usage: 0, quota: 0 };
  }
}

export async function collectLocalStorageData(supports: Supports): Promise<KeyValueEntry[]> {
  if (!supports.localStorage) return [];

  const data: KeyValueEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) ?? '';
    data.push({ key, value, bytes: roughBytes(key) + roughBytes(value) });
  }

  data.sort((a, b) => b.bytes - a.bytes);
  return data;
}

export async function collectSessionStorageData(supports: Supports): Promise<KeyValueEntry[]> {
  if (!supports.sessionStorage) return [];

  const data: KeyValueEntry[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    const value = sessionStorage.getItem(key) ?? '';
    data.push({ key, value, bytes: roughBytes(key) + roughBytes(value) });
  }

  data.sort((a, b) => b.bytes - a.bytes);
  return data;
}

export async function collectCacheData(
  supports: Supports
): Promise<Array<{ name: string; entryCount: number }>> {
  if (!supports.caches) return [];

  const names = await caches.keys();
  const data: Array<{ name: string; entryCount: number }> = [];

  for (const name of names) {
    try {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      data.push({ name, entryCount: requests.length });
    } catch (error) {
      console.error('[StorageInspector] Failed to inspect cache:', name, error);
      data.push({ name, entryCount: 0 });
    }
  }

  data.sort((a, b) => b.entryCount - a.entryCount);
  return data;
}

export async function collectIndexedDbData(supports: Supports): Promise<IdbEntry[]> {
  if (!supports.indexedDB || !supports.indexedDBList) return [];

  const list = await listIndexedDatabases();
  const databases = list
    .filter((item) => typeof item.name === 'string' && item.name.length > 0)
    .map((item) => ({ name: item.name as string, version: item.version }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const details = await Promise.all(
    databases.map(async (db) => ({
      ...db,
      ...(await inspectIndexedDb(db.name)),
    }))
  );

  return details;
}

export async function collectCookieData(supports: Supports): Promise<CookieEntry[]> {
  if (!supports.cookies) return [];

  return parseCookieString(document.cookie)
    .map((entry) => ({
      name: entry.name,
      value: entry.value,
      bytes: roughBytes(entry.name) + roughBytes(entry.value),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

export async function clearAllCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

export async function clearAllIndexedDb(): Promise<void> {
  const list = await listIndexedDatabases();
  const names = list
    .map((item) => item.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  await Promise.all(names.map((name) => deleteIndexedDb(name)));
}

export async function deleteCache(name: string): Promise<void> {
  await caches.delete(name);
}

export function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'));
  });
}

export function clearAllVisibleCookies(): void {
  const cookies = parseCookieString(document.cookie);
  for (const cookie of cookies) {
    deleteVisibleCookie(cookie.name);
  }
}

export function deleteVisibleCookie(name: string): void {
  const encodedName = encodeURIComponent(name);
  document.cookie = `${encodedName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  document.cookie = `${encodedName}=; max-age=0; path=/`;
}

export function hasIndexedDbListSupport(): boolean {
  if (typeof indexedDB === 'undefined') return false;
  const idbWithDatabases = indexedDB as IDBFactory & {
    databases?: () => Promise<IdDatabaseInfo[]>;
  };
  return typeof idbWithDatabases.databases === 'function';
}

async function listIndexedDatabases(): Promise<IdDatabaseInfo[]> {
  const idbWithDatabases = indexedDB as IDBFactory & {
    databases?: () => Promise<IdDatabaseInfo[]>;
  };
  if (!idbWithDatabases.databases) return [];

  try {
    const result = await idbWithDatabases.databases();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('[StorageInspector] Failed to list IndexedDB databases:', error);
    return [];
  }
}

async function inspectIndexedDb(name: string): Promise<{
  objectStoreCount: number;
  totalRecords?: number;
  stores: IdbStoreEntry[];
  inspectError?: string;
}> {
  try {
    const db = await openIndexedDb(name);
    const storeNames = Array.from(db.objectStoreNames);
    const stores = storeNames.map((storeName) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return {
        name: storeName,
        keyPath: keyPathToText(store.keyPath),
        autoIncrement: store.autoIncrement,
      } satisfies IdbStoreEntry;
    });

    const counts = await Promise.all(storeNames.map((storeName) => countRecords(db, storeName)));
    const withCounts = stores.map((store, index) => ({
      ...store,
      recordCount: counts[index],
    }));
    const totalRecords = counts.reduce((acc, value) => acc + value, 0);

    db.close();
    return {
      objectStoreCount: storeNames.length,
      totalRecords,
      stores: withCounts,
    };
  } catch (error) {
    console.error('[StorageInspector] Failed to inspect IndexedDB database:', name, error);
    return {
      objectStoreCount: 0,
      stores: [],
      inspectError: error instanceof Error ? error.message : 'Unknown inspection error',
    };
  }
}

function openIndexedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.close();
      reject(new Error('Database inspection blocked by upgrade event'));
    };
  });
}

function countRecords(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(typeof request.result === 'number' ? request.result : 0);
      request.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

function keyPathToText(keyPath: IDBObjectStore['keyPath']): string {
  if (keyPath === null) return '(none)';
  if (Array.isArray(keyPath)) return keyPath.join(', ');
  return String(keyPath);
}

function parseCookieString(cookieString: string): Array<{ name: string; value: string }> {
  if (!cookieString.trim()) return [];

  return cookieString
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const splitIndex = part.indexOf('=');
      if (splitIndex === -1) return { name: part, value: '' };
      const name = part.slice(0, splitIndex).trim();
      const value = part.slice(splitIndex + 1).trim();
      return { name, value };
    })
    .filter((cookie) => cookie.name.length > 0);
}
