import { fetchApi, fetchJson } from './api';
import { showMessage } from './ui';

/**
 * Generic Synchronization Utility
 * Handles sync between IndexedDB and Backend
 */

export const SYNC_METADATA_STORE = 'sync_metadata';

export interface SyncableRecord {
  updatedAt: number;
  [key: string]: any;
}

export class SyncManager {
  /**
   * Check if the backend is reachable
   */
  static async isBackendAvailable(): Promise<boolean> {
    try {
      const resp = await fetchApi('/health', { method: 'HEAD' });
      return resp.ok;
    } catch {
      // If /api/health doesn't exist, try /api/sync/test
      try {
        const resp = await fetchApi('/sync/ping', { method: 'HEAD' });
        return resp.status !== 404;
      } catch {
        return false;
      }
    }
  }

  /**
   * Ensure the sync_metadata store exists in the database
   */
  static ensureSyncMetadataStore(db: IDBDatabase) {
    if (!db.objectStoreNames.contains(SYNC_METADATA_STORE)) {
      // Note: This must be called inside onupgradeneeded
      db.createObjectStore(SYNC_METADATA_STORE, { keyPath: 'key' });
    }
  }

  /**
   * Track a deletion locally to propagate it to the server later
   */
  static async trackDeletion(
    db: IDBDatabase,
    toolId: string,
    recordId: string | number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(SYNC_METADATA_STORE);
      const key = `${toolId}:${recordId}`;
      store.put({ key, toolId, recordId: String(recordId), deleted: true, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Main sync function
   */
  static async sync<T extends SyncableRecord>(
    db: IDBDatabase,
    storeName: string,
    toolId: string,
    keyField: keyof T = 'shortId' as keyof T,
    options: { manual?: boolean } = {}
  ): Promise<{ pulled: number; pushed: number; deleted: number }> {
    const { manual = false } = options;

    try {
      const available = await this.isBackendAvailable();
      if (!available) {
        console.warn(`[Sync] Backend not available for tool: ${toolId}. Skipping sync.`);
        throw new Error('Backend unavailable');
      }

      // 1. Pull from server
      const { records: serverRecords } = await fetchJson<{ records: any[] }>(`/sync/${toolId}`);

      const localRecords = await this.getAllFromStore<T>(db, storeName);
      const localDeletions = await this.getDeletions(db, toolId);

      const toPush: any[] = [];
      let pulledCount = 0;
      let deletedCount = 0;

      // 2. Merge Server -> Local
      const primaryKey = await this.getPrimaryKey(db, storeName);

      for (const sRec of serverRecords) {
        const lRec = localRecords.find((r) => String(r[keyField]) === String(sRec.id));

        if (sRec.deleted) {
          if (lRec && primaryKey) {
            await this.deleteFromStore(db, storeName, (lRec as any)[primaryKey]);
            deletedCount++;
          }
          continue;
        }

        if (!lRec || sRec.updatedAt > (lRec.updatedAt || 0)) {
          const dataToSave = { ...sRec.data, updatedAt: sRec.updatedAt };
          // If we have a local primary key (e.g. auto-increment 'id'), preserve it.
          // Otherwise, if the pulled data has a primary key that is NOT our global keyField,
          // remove it to let the local DB generate its own (avoiding conflicts/duplicates).
          if (lRec && primaryKey) {
            (dataToSave as any)[primaryKey] = (lRec as any)[primaryKey];
          } else if (primaryKey && primaryKey !== keyField) {
            delete (dataToSave as any)[primaryKey];
          }

          await this.putToStore(db, storeName, dataToSave);
          pulledCount++;
        }
      }

      // 3. Prepare Push Local -> Server (Modified since last sync or new)
      // For simplicity, we compare all local records with what the server has (LWW)
      for (const lRec of localRecords) {
        const sRec = serverRecords.find((r: any) => String(r.id) === String(lRec[keyField]));
        if (!sRec || (lRec.updatedAt || 0) > sRec.updatedAt) {
          const dataToPush = { ...lRec };
          // Don't push local-only primary keys (like auto-increment 'id') if they are not the global keyField
          if (primaryKey && primaryKey !== keyField) {
            delete (dataToPush as any)[primaryKey];
          }

          toPush.push({
            id: String(lRec[keyField]),
            data: dataToPush,
            updatedAt: lRec.updatedAt || Date.now(),
            deleted: false,
          });
        }
      }

      // 4. Push Deletions
      for (const del of localDeletions) {
        toPush.push({
          id: del.recordId,
          updatedAt: del.updatedAt,
          deleted: true,
        });
      }

      if (toPush.length > 0) {
        await fetchApi(`/sync/${toolId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: toPush }),
        });

        // Clear local deletion tracking after successful push
        await this.clearDeletions(db, toolId);
      }

      const result = { pulled: pulledCount, pushed: toPush.length, deleted: deletedCount };
      const hasChanges = result.pulled > 0 || result.pushed > 0 || result.deleted > 0;

      if (manual || hasChanges) {
        showMessage(`Sync complete! Pulled: ${result.pulled}, Pushed: ${result.pushed}`, {
          type: 'info',
          timeoutMs: 2000,
        });
      }

      return result;
    } catch (e) {
      if (manual) {
        showMessage('Sync failed. Please check your connection.', { type: 'alert' });
      }
      throw e;
    }
  }

  private static async getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private static async putToStore(db: IDBDatabase, storeName: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      // If it's a merge from server, we might need to handle the IDB 'id'
      // For notes, we'll need to check if a note with this shortId exists to get its internal 'id'
      store.put(data);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private static async deleteFromStore(db: IDBDatabase, storeName: string, id: any): Promise<void> {
    if (id === undefined || id === null) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private static async getPrimaryKey(db: IDBDatabase, storeName: string): Promise<string | null> {
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      resolve(Array.isArray(store.keyPath) ? store.keyPath[0] : (store.keyPath as string));
    });
  }

  private static async getDeletions(db: IDBDatabase, toolId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(SYNC_METADATA_STORE)) return resolve([]);
      const transaction = db.transaction(SYNC_METADATA_STORE, 'readonly');
      const store = transaction.objectStore(SYNC_METADATA_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result;
        resolve(all.filter((item: any) => item.toolId === toolId));
      };
      request.onerror = () => reject(request.error);
    });
  }

  private static async clearDeletions(db: IDBDatabase, toolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(SYNC_METADATA_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const toDelete = request.result.filter((item: any) => item.toolId === toolId);
        for (const item of toDelete) {
          store.delete(item.key);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
