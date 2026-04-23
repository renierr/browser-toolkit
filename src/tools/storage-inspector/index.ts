import { showMessage } from '@js/ui';
import {
  clearAllCaches,
  clearAllIndexedDb,
  clearAllVisibleCookies,
  collectCacheData,
  collectCookieData,
  collectEstimateData,
  collectIndexedDbData,
  collectLocalStorageData,
  collectSessionStorageData,
  deleteCache,
  deleteIndexedDb,
  deleteVisibleCookie,
  getSupports,
} from './browser-storage';
import { getElements } from './dom';
import { decodeData } from './format';
import { renderSummary, renderSupportStatus, renderTables } from './render';
import type { StorageSnapshot } from './types';

export default function init(): (() => void) | void {
  const root = document.getElementById('storage-inspector-root') as HTMLDivElement | null;
  if (!root) return;

  const supports = getSupports();
  const el = getElements();
  const clearTypeCheckboxes = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[data-clear-type]')
  );

  let snapshot: StorageSnapshot = {
    estimateData: { usage: 0, quota: 0 },
    localEntries: [],
    sessionEntries: [],
    cacheEntries: [],
    idbEntries: [],
    cookieEntries: [],
  };

  const onClick = async (event: Event): Promise<void> => {
    const target = event.target as HTMLElement;
    const button = target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const buttonId = button.id;

    if (buttonId === 'refresh-btn') {
      await refreshData();
      showMessage('Storage view refreshed.', { type: 'info', timeoutMs: 1800 });
      return;
    }

    if (buttonId === 'clear-selected-btn') {
      await clearSelectedTypes();
      return;
    }

    if (!action) return;

    try {
      switch (action) {
        case 'clear-local': {
          if (!confirm('Clear all localStorage keys?')) return;
          localStorage.clear();
          showMessage('localStorage cleared.', { type: 'info' });
          break;
        }
        case 'delete-local-key': {
          const key = decodeData(button.dataset.key);
          if (!key) return;
          localStorage.removeItem(key);
          showMessage(`Removed localStorage key: ${key}`, { type: 'info', timeoutMs: 2000 });
          break;
        }
        case 'clear-session': {
          if (!confirm('Clear all sessionStorage keys?')) return;
          sessionStorage.clear();
          showMessage('sessionStorage cleared.', { type: 'info' });
          break;
        }
        case 'delete-session-key': {
          const key = decodeData(button.dataset.key);
          if (!key) return;
          sessionStorage.removeItem(key);
          showMessage(`Removed sessionStorage key: ${key}`, { type: 'info', timeoutMs: 2000 });
          break;
        }
        case 'clear-caches': {
          if (!supports.caches) {
            showMessage('Cache Storage is not supported in this browser.', { type: 'warning' });
            return;
          }
          if (!confirm('Delete all Cache Storage entries?')) return;
          await clearAllCaches();
          showMessage('All caches deleted.', { type: 'info' });
          break;
        }
        case 'delete-cache': {
          const name = decodeData(button.dataset.name);
          if (!name) return;
          if (!confirm(`Delete cache "${name}"?`)) return;
          await deleteCache(name);
          showMessage(`Deleted cache: ${name}`, { type: 'info', timeoutMs: 2000 });
          break;
        }
        case 'clear-idb': {
          if (!supports.indexedDB) {
            showMessage('IndexedDB is not supported in this browser.', { type: 'warning' });
            return;
          }
          if (!supports.indexedDBList) {
            showMessage('IndexedDB listing is not supported in this browser.', { type: 'warning' });
            return;
          }
          if (!confirm('Delete all listed IndexedDB databases?')) return;
          await clearAllIndexedDb();
          showMessage('IndexedDB databases deleted.', { type: 'info' });
          break;
        }
        case 'delete-idb': {
          const name = decodeData(button.dataset.name);
          if (!name) return;
          if (!confirm(`Delete IndexedDB database "${name}"?`)) return;
          await deleteIndexedDb(name);
          showMessage(`Deleted IndexedDB database: ${name}`, { type: 'info', timeoutMs: 2200 });
          break;
        }
        case 'clear-cookies': {
          if (!supports.cookies) {
            showMessage('Cookies are disabled in this browser.', { type: 'warning' });
            return;
          }
          if (!confirm('Delete all cookies visible to JavaScript?')) return;
          clearAllVisibleCookies();
          showMessage('Visible cookies cleared.', { type: 'info' });
          break;
        }
        case 'delete-cookie': {
          const name = decodeData(button.dataset.name);
          if (!name) return;
          deleteVisibleCookie(name);
          showMessage(`Deleted cookie: ${name}`, { type: 'info', timeoutMs: 2000 });
          break;
        }
        default:
          return;
      }

      await refreshData();
    } catch (error) {
      console.error('[StorageInspector] Failed action:', action, error);
      showMessage('Failed to complete storage action.', { type: 'alert' });
    }
  };

  root.addEventListener('click', onClick);

  renderSupportStatus(el, supports);
  void refreshData();

  return () => {
    root.removeEventListener('click', onClick);
  };

  async function refreshData(): Promise<void> {
    const results = await Promise.allSettled([
      collectEstimateData(supports),
      collectLocalStorageData(supports),
      collectSessionStorageData(supports),
      collectCacheData(supports),
      collectIndexedDbData(supports),
      collectCookieData(supports),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[StorageInspector] Data collection failed:', result.reason);
      }
    }

    snapshot = {
      estimateData: results[0].status === 'fulfilled' ? results[0].value : { usage: 0, quota: 0 },
      localEntries: results[1].status === 'fulfilled' ? results[1].value : [],
      sessionEntries: results[2].status === 'fulfilled' ? results[2].value : [],
      cacheEntries: results[3].status === 'fulfilled' ? results[3].value : [],
      idbEntries: results[4].status === 'fulfilled' ? results[4].value : [],
      cookieEntries: results[5].status === 'fulfilled' ? results[5].value : [],
    };

    el.idbUnsupported.classList.toggle('hidden', supports.indexedDBList || !supports.indexedDB);

    renderSummary(el, snapshot);
    renderTables(el, snapshot);
  }

  async function clearSelectedTypes(): Promise<void> {
    const selected = clearTypeCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.clearType)
      .filter((value): value is string => Boolean(value));

    if (selected.length === 0) {
      showMessage('Select at least one storage type to clear.', { type: 'warning' });
      return;
    }

    if (!confirm(`Clear selected storage types: ${selected.join(', ')}?`)) return;

    for (const type of selected) {
      try {
        if (type === 'local' && supports.localStorage) {
          localStorage.clear();
        }
        if (type === 'session' && supports.sessionStorage) {
          sessionStorage.clear();
        }
        if (type === 'cache' && supports.caches) {
          await clearAllCaches();
        }
        if (type === 'idb' && supports.indexedDB && supports.indexedDBList) {
          await clearAllIndexedDb();
        }
        if (type === 'cookies' && supports.cookies) {
          clearAllVisibleCookies();
        }
      } catch (error) {
        console.error('[StorageInspector] Failed clear selected type:', type, error);
      }
    }

    showMessage(`Cleared selected types: ${selected.join(', ')}.`, { type: 'info' });
    await refreshData();
  }
}
