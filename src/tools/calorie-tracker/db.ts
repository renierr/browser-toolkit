import { SyncManager } from '@js/sync';

const DB_NAME = 'CalorieTrackerDB';
export const STORE_NAME = 'meals';
const DB_VERSION = 1;

export interface Meal {
  id?: number;
  shortId: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  imageBlob?: Blob | null;
  notes?: string;
  timestamp: number;
  updatedAt: number;
}

export function generateShortId(): string {
  return 'MEAL-' + Math.random().toString(36).substring(2, 11).toUpperCase();
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      SyncManager.ensureSyncMetadataStore(db);
    };
  });
}

export async function getAllMeals(db: IDBDatabase): Promise<Meal[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getMealById(db: IDBDatabase, id: number): Promise<Meal | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMeal(
  db: IDBDatabase,
  meal: Omit<Meal, 'id'> & { id?: number }
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const now = Date.now();
    meal.updatedAt = now;
    if (!meal.shortId) {
      meal.shortId = generateShortId();
    }

    let request: IDBRequest;
    if (meal.id !== undefined) {
      request = store.put(meal);
    } else {
      request = store.add(meal);
    }

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMeal(db: IDBDatabase, id: number, userId: string): Promise<void> {
  const meal = await getMealById(db, id);
  if (meal?.shortId) {
    const toolId = `calorie-tracker-${userId.trim() || 'default'}`;
    await SyncManager.trackDeletion(db, toolId, meal.shortId);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
