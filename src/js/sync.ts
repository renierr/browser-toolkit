import { fetchApi, fetchJson } from './api';
import { showMessage } from './ui';
import { uint8ArrayToBase64, base64ToUint8Array } from './utils';

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
   * Recursively serialize any Blob properties in a record to base64 objects
   */
  static async serializeRecord(record: any): Promise<any> {
    if (!record || typeof record !== 'object') {
      return record;
    }

    if (record instanceof Blob) {
      const arrayBuffer = await record.arrayBuffer();
      const base64 = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
      return {
        __type: 'blob',
        mimeType: record.type,
        data: base64,
      };
    }

    if (Array.isArray(record)) {
      return Promise.all(record.map((item) => this.serializeRecord(item)));
    }

    const serialized: any = {};
    for (const key of Object.keys(record)) {
      serialized[key] = await this.serializeRecord(record[key]);
    }
    return serialized;
  }

  /**
   * Recursively deserialize any base64 objects in a record back to native Blobs
   */
  static deserializeRecord(record: any): any {
    if (!record || typeof record !== 'object') {
      return record;
    }

    if (record.__type === 'blob' && typeof record.data === 'string') {
      const bytes = base64ToUint8Array(record.data);
      return new Blob([bytes as any], { type: record.mimeType });
    }

    if (Array.isArray(record)) {
      return record.map((item) => this.deserializeRecord(item));
    }

    const deserialized: any = {};
    for (const key of Object.keys(record)) {
      deserialized[key] = this.deserializeRecord(record[key]);
    }
    return deserialized;
  }

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
    recordId: string | number,
    updatedAt: number = Date.now()
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(SYNC_METADATA_STORE);
      const key = `${toolId}:${recordId}`;
      store.put({ key, toolId, recordId: String(recordId), deleted: true, updatedAt });
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

      // 1. Pull metadata from server (super lightweight, no image payload)
      const { records: serverMeta } = await fetchJson<{
        records: { id: string; updatedAt: number; deleted: boolean }[];
      }>(`/sync/${toolId}/metadata`);

      const localRecords = await this.getAllFromStore<T>(db, storeName);
      const localDeletions = await this.getDeletions(db, toolId);

      const toPullIds: string[] = [];
      const toPush: any[] = [];
      let deletedCount = 0;

      const primaryKey = await this.getPrimaryKey(db, storeName);

      // 2. Resolve Deletions & Identify Pull Targets
      for (const sMeta of serverMeta) {
        const lRec = localRecords.find((r) => String(r[keyField]) === String(sMeta.id));

        if (sMeta.deleted) {
          if (lRec && primaryKey) {
            // Delete locally right away if server has deleted it, without fetching details
            await this.deleteFromStore(db, storeName, (lRec as any)[primaryKey]);
            deletedCount++;
          }
          continue;
        }

        if (!lRec || sMeta.updatedAt > (lRec.updatedAt || 0)) {
          toPullIds.push(sMeta.id);
        }
      }

      // 3. Identify Push Targets (Local -> Server)
      for (const lRec of localRecords) {
        const sMeta = serverMeta.find((meta) => String(meta.id) === String(lRec[keyField]));
        if (!sMeta || (lRec.updatedAt || 0) > sMeta.updatedAt) {
          const dataToPush = { ...lRec };
          if (primaryKey && primaryKey !== keyField) {
            delete (dataToPush as any)[primaryKey];
          }

          // Serialize any Blobs inside dataToPush
          const serializedData = await this.serializeRecord(dataToPush);

          toPush.push({
            id: String(lRec[keyField]),
            data: serializedData,
            updatedAt: lRec.updatedAt || Date.now(),
            deleted: false,
          });
        }
      }

      // Add local deletions to push
      for (const del of localDeletions) {
        toPush.push({
          id: del.recordId,
          updatedAt: del.updatedAt,
          deleted: true,
        });
      }

      // 4. No-change Fast Path: Exit early if nothing to transfer!
      if (toPullIds.length === 0 && toPush.length === 0) {
        const result = { pulled: 0, pushed: 0, deleted: deletedCount };
        if (manual || deletedCount > 0) {
          showMessage(`Sync complete! Pulled: 0, Pushed: 0`, {
            type: 'info',
            timeoutMs: 2000,
          });
        }
        return result;
      }

      // 5. Delta Pulling: Retrieve only full records that changed
      let pulledCount = 0;
      let pulledRecords: any[] = [];
      if (toPullIds.length > 0) {
        const pullResp = await fetchJson<{ records: any[] }>(`/sync/${toolId}/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: toPullIds }),
        });
        pulledRecords = pullResp.records;
      }

      // 6. Merge Pulled Records -> Local IndexedDB
      for (const sRec of pulledRecords) {
        const lRec = localRecords.find((r) => String(r[keyField]) === String(sRec.id));

        if (sRec.deleted) {
          if (lRec && primaryKey) {
            await this.deleteFromStore(db, storeName, (lRec as any)[primaryKey]);
            deletedCount++;
          }
          continue;
        }

        if (!lRec || sRec.updatedAt > (lRec.updatedAt || 0)) {
          let dataToSave = { ...sRec.data, updatedAt: sRec.updatedAt };

          // Deserialize any Blobs inside dataToSave
          dataToSave = this.deserializeRecord(dataToSave);

          if (lRec && primaryKey) {
            (dataToSave as any)[primaryKey] = (lRec as any)[primaryKey];
          } else if (primaryKey && primaryKey !== keyField) {
            delete (dataToSave as any)[primaryKey];
          }

          // Ensure keyField (shortId) is populated from sRec.id
          if (keyField) {
            (dataToSave as any)[keyField] = sRec.id;
          }

          await this.putToStore(db, storeName, dataToSave);
          pulledCount++;
        }
      }

      // 7. Push Local Changes to Server
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
