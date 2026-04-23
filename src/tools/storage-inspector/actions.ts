import { showMessage } from '@js/ui';
import {
  clearAllCaches,
  clearAllIndexedDb,
  clearAllVisibleCookies,
  deleteCache,
  deleteIndexedDb,
  deleteVisibleCookie,
} from './browser-storage';
import { decodeData } from './format';
import type { Supports } from './types';

type ActionContext = {
  supports: Supports;
  refreshData: () => Promise<void>;
  getSelectedClearTypes: () => string[];
};

export async function handleStorageInspectorButton(
  button: HTMLButtonElement,
  context: ActionContext
): Promise<boolean> {
  if (button.id === 'refresh-btn') {
    await context.refreshData();
    showMessage('Storage view refreshed.', { type: 'info', timeoutMs: 1800 });
    return true;
  }

  if (button.id === 'clear-selected-btn') {
    await clearSelectedTypes(context);
    return true;
  }

  const action = button.dataset.action;
  if (!action) return false;

  try {
    switch (action) {
      case 'clear-local': {
        if (!confirm('Clear all localStorage keys?')) return true;
        localStorage.clear();
        showMessage('localStorage cleared.', { type: 'info' });
        break;
      }
      case 'delete-local-key': {
        const key = decodeData(button.dataset.key);
        if (!key) return true;
        if (!confirm(`Delete localStorage key "${key}"?`)) return true;
        localStorage.removeItem(key);
        showMessage(`Removed localStorage key: ${key}`, { type: 'info', timeoutMs: 2000 });
        break;
      }
      case 'clear-session': {
        if (!confirm('Clear all sessionStorage keys?')) return true;
        sessionStorage.clear();
        showMessage('sessionStorage cleared.', { type: 'info' });
        break;
      }
      case 'delete-session-key': {
        const key = decodeData(button.dataset.key);
        if (!key) return true;
        if (!confirm(`Delete sessionStorage key "${key}"?`)) return true;
        sessionStorage.removeItem(key);
        showMessage(`Removed sessionStorage key: ${key}`, { type: 'info', timeoutMs: 2000 });
        break;
      }
      case 'clear-caches': {
        if (!context.supports.caches) {
          showMessage('Cache Storage is not supported in this browser.', { type: 'warning' });
          return true;
        }
        if (!confirm('Delete all Cache Storage entries?')) return true;
        await clearAllCaches();
        showMessage('All caches deleted.', { type: 'info' });
        break;
      }
      case 'delete-cache': {
        const name = decodeData(button.dataset.name);
        if (!name) return true;
        if (!confirm(`Delete cache "${name}"?`)) return true;
        await deleteCache(name);
        showMessage(`Deleted cache: ${name}`, { type: 'info', timeoutMs: 2000 });
        break;
      }
      case 'clear-idb': {
        if (!context.supports.indexedDB) {
          showMessage('IndexedDB is not supported in this browser.', { type: 'warning' });
          return true;
        }
        if (!context.supports.indexedDBList) {
          showMessage('IndexedDB listing is not supported in this browser.', { type: 'warning' });
          return true;
        }
        if (!confirm('Delete all listed IndexedDB databases?')) return true;
        await clearAllIndexedDb();
        showMessage('IndexedDB databases deleted.', { type: 'info' });
        break;
      }
      case 'delete-idb': {
        const name = decodeData(button.dataset.name);
        if (!name) return true;
        if (!confirm(`Delete IndexedDB database "${name}"?`)) return true;
        await deleteIndexedDb(name);
        showMessage(`Deleted IndexedDB database: ${name}`, { type: 'info', timeoutMs: 2200 });
        break;
      }
      case 'clear-cookies': {
        if (!context.supports.cookies) {
          showMessage('Cookies are disabled in this browser.', { type: 'warning' });
          return true;
        }
        if (!confirm('Delete all cookies visible to JavaScript?')) return true;
        clearAllVisibleCookies();
        showMessage('Visible cookies cleared.', { type: 'info' });
        break;
      }
      case 'delete-cookie': {
        const name = decodeData(button.dataset.name);
        if (!name) return true;
        if (!confirm(`Delete cookie "${name}"?`)) return true;
        deleteVisibleCookie(name);
        showMessage(`Deleted cookie: ${name}`, { type: 'info', timeoutMs: 2000 });
        break;
      }
      default:
        return false;
    }

    await context.refreshData();
    return true;
  } catch (error) {
    console.error('[StorageInspector] Failed action:', action, error);
    showMessage('Failed to complete storage action.', { type: 'alert' });
    return true;
  }
}

async function clearSelectedTypes(context: ActionContext): Promise<void> {
  const selected = context.getSelectedClearTypes();
  if (selected.length === 0) {
    showMessage('Select at least one storage type to clear.', { type: 'warning' });
    return;
  }

  if (!confirm(`Clear selected storage types: ${selected.join(', ')}?`)) return;

  for (const type of selected) {
    try {
      if (type === 'local' && context.supports.localStorage) {
        localStorage.clear();
      }
      if (type === 'session' && context.supports.sessionStorage) {
        sessionStorage.clear();
      }
      if (type === 'cache' && context.supports.caches) {
        await clearAllCaches();
      }
      if (type === 'idb' && context.supports.indexedDB && context.supports.indexedDBList) {
        await clearAllIndexedDb();
      }
      if (type === 'cookies' && context.supports.cookies) {
        clearAllVisibleCookies();
      }
    } catch (error) {
      console.error('[StorageInspector] Failed clear selected type:', type, error);
    }
  }

  showMessage(`Cleared selected types: ${selected.join(', ')}.`, { type: 'info' });
  await context.refreshData();
}
