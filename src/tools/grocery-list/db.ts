import type { GroceryItem, ItemHistory } from './types.ts';
import { SyncManager } from '@js/sync.ts';

const DB_NAME = 'GroceryListDB';
export const ITEMS_STORE = 'grocery-items';
const HISTORY_STORE = 'item-history';
const DB_VERSION = 2;

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'name' });
      }
      SyncManager.ensureSyncMetadataStore(db);
    };
    request.onsuccess = () => {
      const db = request.result;
      void backfillSyncFields(db)
        .then(() => resolve(db))
        .catch((error: unknown) => {
          console.error('[GroceryList] Failed to backfill sync fields', error);
          resolve(db);
        });
    };
  });
}

async function backfillSyncFields(db: IDBDatabase): Promise<void> {
  const items = await getAllItems(db);
  const missing = items.filter((item) => !item.shortId || !item.updatedAt);
  if (missing.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    for (const item of missing) {
      store.put({
        ...item,
        shortId: item.shortId || generateShortId(),
        updatedAt: item.updatedAt || item.createdAt || Date.now(),
      });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllItems(db: IDBDatabase): Promise<GroceryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readonly');
    const store = transaction.objectStore(ITEMS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveItem(db: IDBDatabase, item: GroceryItem): Promise<number> {
  const now = Date.now();
  const itemToSave: GroceryItem = {
    ...item,
    shortId: item.shortId || generateShortId(),
    updatedAt: now,
    createdAt: item.createdAt || now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    if (itemToSave.id) {
      const request = store.put(itemToSave);
      request.onsuccess = () => resolve(itemToSave.id as number);
      request.onerror = () => reject(request.error);
    } else {
      const request = store.add(itemToSave);
      request.onsuccess = () => {
        const id = request.result as number;
        void addToHistory(db, itemToSave.name);
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    }
  });
}

export async function deleteItem(db: IDBDatabase, id: number): Promise<void> {
  const items = await getAllItems(db);
  const item = items.find((i) => i.id === id);
  if (item?.shortId) {
    await SyncManager.trackDeletion(db, 'grocery-list', item.shortId);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearCheckedItems(db: IDBDatabase): Promise<void> {
  const items = await getAllItems(db);
  const checkedItems = items.filter((i) => i.checked);

  for (const item of checkedItems) {
    if (item.shortId) {
      await SyncManager.trackDeletion(db, 'grocery-list', item.shortId);
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    for (const item of checkedItems) {
      if (item.id) {
        store.delete(item.id);
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function reAddCheckedItems(db: IDBDatabase): Promise<void> {
  const items = await getAllItems(db);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    for (const item of items) {
      if (item.checked) {
        item.checked = false;
        item.updatedAt = Date.now();
        store.put(item);
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getHistory(db: IDBDatabase): Promise<ItemHistory[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readonly');
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const history = request.result;
      history.sort((a, b) => b.count - a.count);
      resolve(history);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function addToHistory(db: IDBDatabase, name: string): Promise<void> {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE);
    const getReq = store.get(normalizedName);

    getReq.onsuccess = () => {
      if (getReq.result) {
        getReq.result.count++;
        store.put(getReq.result);
      } else {
        store.add({ name: normalizedName, count: 1 });
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function importItems(
  db: IDBDatabase,
  items: GroceryItem[]
): Promise<{ imported: number; skipped: number }> {
  const existingItems = await getAllItems(db);
  const existingShortIds = new Set(existingItems.map((i) => i.shortId).filter(Boolean));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    let imported = 0;
    let skipped = 0;

    for (const item of items) {
      const shortId = item.shortId || generateShortId();
      if (existingShortIds.has(shortId)) {
        skipped++;
        continue;
      }

      const { id, ...itemToSave } = item;
      store.add({
        ...itemToSave,
        shortId,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || item.createdAt || Date.now(),
      });
      existingShortIds.add(shortId);
      imported++;
    }

    transaction.oncomplete = () => resolve({ imported, skipped });
    transaction.onerror = () => reject(transaction.error);
  });
}
