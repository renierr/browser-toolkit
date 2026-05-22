import { SyncManager } from '@js/sync.ts';

const DB_NAME = 'AudioRecorderDB';
export const STORE_NAME = 'recordings';
const DB_VERSION = 1;

export type Recording = {
  id?: number;
  shortId: string;
  name: string;
  mimeType: string;
  audioData: Blob;
  createdAt: number;
  updatedAt: number;
};

export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
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

export async function getAllRecordings(db: IDBDatabase): Promise<Recording[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getRecordingById(
  db: IDBDatabase,
  id: number
): Promise<Recording | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecording(
  db: IDBDatabase,
  name: string,
  mimeType: string,
  audioData: Blob
): Promise<Recording> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const now = Date.now();
    const recording: Recording = {
      shortId: generateShortId(),
      name,
      mimeType,
      audioData,
      createdAt: now,
      updatedAt: now,
    };
    const request = store.add(recording);
    request.onsuccess = () => {
      recording.id = request.result as number;
    };
    transaction.oncomplete = () => resolve(recording);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteRecording(db: IDBDatabase, id: number): Promise<void> {
  const recording = await getRecordingById(db, id);
  if (recording?.shortId) {
    await SyncManager.trackDeletion(db, 'audio-recorder', recording.shortId);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
