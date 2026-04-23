import {
  collectCacheData,
  collectCookieData,
  collectEstimateData,
  collectIndexedDbData,
  collectLocalStorageData,
  collectSessionStorageData,
  getSupports,
} from './browser-storage';
import { getElements } from './dom';
import { handleStorageInspectorButton } from './actions';
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

    await handleStorageInspectorButton(button, {
      supports,
      refreshData,
      getSelectedClearTypes: () =>
        clearTypeCheckboxes
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => checkbox.dataset.clearType)
          .filter((value): value is string => Boolean(value)),
    });
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
}
