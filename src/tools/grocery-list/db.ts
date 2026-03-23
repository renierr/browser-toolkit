import type { GroceryItem, ItemHistory } from './types.ts';

const DB_NAME = 'GroceryListDB';
const ITEMS_STORE = 'grocery-items';
const HISTORY_STORE = 'item-history';
const DB_VERSION = 1;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'name' });
      }
    };
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
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    if (item.id) {
      store.put(item);
      resolve(item.id);
    } else {
      const request = store.add(item);
      request.onsuccess = () => {
        const id = request.result as number;
        addToHistory(db, item.name);
        resolve(id);
      };
    }

    transaction.oncomplete = () => resolve(item.id ?? 0);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteItem(db: IDBDatabase, id: number): Promise<void> {
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
  const checkedIds = items.filter((i) => i.checked).map((i) => i.id!);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    for (const id of checkedIds) {
      store.delete(id);
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
  const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase()));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const store = transaction.objectStore(ITEMS_STORE);

    let imported = 0;
    let skipped = 0;

    for (const item of items) {
      const normalizedName = item.name.toLowerCase();
      if (existingNames.has(normalizedName)) {
        skipped++;
        continue;
      }

      const { id, ...itemToSave } = item;
      store.add(itemToSave);
      imported++;
    }

    transaction.oncomplete = () => resolve({ imported, skipped });
    transaction.onerror = () => reject(transaction.error);
  });
}
