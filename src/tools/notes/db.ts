import type { Note } from './types.ts';
import { SyncManager } from '@js/sync.ts';

const DB_NAME = 'NotesDB';
export const STORE_NAME = 'notes';
const DB_VERSION = 2;

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

export async function getAllNotes(db: IDBDatabase): Promise<Note[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getNoteById(db: IDBDatabase, id: number): Promise<Note | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveNote(
  db: IDBDatabase,
  content: string,
  editingId: number | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    if (editingId !== null) {
      const request = store.get(editingId);
      request.onsuccess = () => {
        const note = request.result;
        if (note) {
          note.content = content;
          note.updatedAt = Math.max(Date.now(), (note.updatedAt || 0) + 1);
          if (!note.shortId) {
            note.shortId = generateShortId();
          }
          store.put(note);
        }
      };
    } else {
      const now = Date.now();
      const note: Note = {
        shortId: generateShortId(),
        content,
        createdAt: now,
        updatedAt: now,
      };
      store.add(note);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteNote(db: IDBDatabase, id: number): Promise<void> {
  // Find shortId for sync before deleting
  const note = await getNoteById(db, id);
  if (note?.shortId) {
    const deleteTime = Math.max(Date.now(), (note.updatedAt || 0) + 1);
    await SyncManager.trackDeletion(db, 'notes', note.shortId, deleteTime);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function importNotes(
  db: IDBDatabase,
  notes: Note[]
): Promise<{ imported: number; skipped: number }> {
  const existingNotes = await getAllNotes(db);
  const existingShortIds = new Set(existingNotes.map((n) => n.shortId).filter(Boolean));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let imported = 0;
    let skipped = 0;

    for (const note of notes) {
      if (note.shortId && existingShortIds.has(note.shortId)) {
        skipped++;
        continue;
      }

      // Generate shortId if missing for some reason
      if (!note.shortId) {
        note.shortId = generateShortId();
      }

      // Remove id to let auto-increment handle it if it conflicts or is already present
      const { id, ...noteToSave } = note;
      store.add(noteToSave);
      imported++;
    }

    transaction.oncomplete = () => resolve({ imported, skipped });
    transaction.onerror = () => reject(transaction.error);
  });
}
