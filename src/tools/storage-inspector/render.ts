import { encodeData, escapeHtml, formatBytes, sumBytes, truncate } from './format';
import type { KeyValueEntry, StorageInspectorElements, StorageSnapshot, Supports } from './types';

export function renderSupportStatus(el: StorageInspectorElements, supports: Supports): void {
  const unsupported: string[] = [];
  if (!supports.estimate) unsupported.push('Storage estimate');
  if (!supports.caches) unsupported.push('Cache Storage');
  if (!supports.indexedDB) unsupported.push('IndexedDB');
  if (!supports.cookies) unsupported.push('Cookies');

  if (unsupported.length === 0) {
    el.supportAlert.classList.add('hidden');
    return;
  }

  el.supportAlert.classList.remove('hidden');
  el.supportAlertText.textContent = `Limited support: ${unsupported.join(', ')}.`;
}

export function renderSummary(el: StorageInspectorElements, snapshot: StorageSnapshot): void {
  const totalLocal = sumBytes(snapshot.localEntries.map((item) => item.bytes));
  const totalSession = sumBytes(snapshot.sessionEntries.map((item) => item.bytes));
  const totalCookies = sumBytes(snapshot.cookieEntries.map((item) => item.bytes));
  const cacheTotalEntries = snapshot.cacheEntries.reduce((acc, item) => acc + item.entryCount, 0);

  el.summaryLocalCount.textContent = `${snapshot.localEntries.length} keys`;
  el.summaryLocalSize.textContent = formatBytes(totalLocal);
  el.summarySessionCount.textContent = `${snapshot.sessionEntries.length} keys`;
  el.summarySessionSize.textContent = formatBytes(totalSession);
  el.summaryCacheCount.textContent = `${snapshot.cacheEntries.length} caches`;
  el.summaryCacheSize.textContent = `${cacheTotalEntries} cached requests`;
  el.summaryIdbCount.textContent = `${snapshot.idbEntries.length} DBs`;
  el.summaryCookieSize.textContent = `Cookies: ${formatBytes(totalCookies)}`;

  if (snapshot.estimateData.quota > 0) {
    const percent = Math.min(
      100,
      (snapshot.estimateData.usage / snapshot.estimateData.quota) * 100
    );
    el.quotaValue.textContent = formatBytes(snapshot.estimateData.quota);
    el.usageValue.textContent = `Used: ${formatBytes(snapshot.estimateData.usage)}`;
    el.quotaPercent.textContent = `${percent.toFixed(1)}%`;
    el.quotaProgress.value = percent;
    return;
  }

  el.quotaValue.textContent = 'Unavailable';
  el.usageValue.textContent = 'Used: -';
  el.quotaPercent.textContent = '-';
  el.quotaProgress.value = 0;
}

export function renderTables(
  el: StorageInspectorElements,
  snapshot: StorageSnapshot
): void {
  renderKvItems(el.localBody, snapshot.localEntries, 'local');
  renderKvItems(el.sessionBody, snapshot.sessionEntries, 'session');

  el.localEmpty.classList.toggle('hidden', snapshot.localEntries.length > 0);
  el.sessionEmpty.classList.toggle('hidden', snapshot.sessionEntries.length > 0);

  el.cacheBody.innerHTML = snapshot.cacheEntries
    .map(
      (cache) => `<details class="rounded-lg border border-base-300 bg-base-200">
      <summary class="cursor-pointer list-none px-3 py-2">
        <div class="flex items-center justify-between gap-3">
          <span class="font-mono break-all text-sm">${escapeHtml(cache.name)}</span>
          <span class="text-xs text-base-content/70 whitespace-nowrap">${cache.entryCount} requests</span>
        </div>
      </summary>
      <div class="border-t border-base-300 px-3 py-2 text-sm">
        <div class="text-base-content/80">Cached requests: <span class="font-semibold">${cache.entryCount}</span></div>
        <div class="mt-2 flex justify-end">
          <button class="btn btn-error btn-xs" data-action="delete-cache" data-name="${encodeData(cache.name)}">Delete</button>
        </div>
      </div>
    </details>`
    )
    .join('');
  el.cacheEmpty.classList.toggle('hidden', snapshot.cacheEntries.length > 0);

  el.idbBody.innerHTML = snapshot.idbEntries
    .map((db) => {
      const details = db.inspectError
        ? `<div class="text-warning break-all">Inspect error: ${escapeHtml(db.inspectError)}</div>`
        : db.stores.length > 0
          ? `<div class="break-all text-xs">${escapeHtml(
              db.stores
                .map(
                  (store) =>
                    `${store.name} (${store.recordCount ?? 0} rows, key: ${store.keyPath}, auto: ${store.autoIncrement ? 'yes' : 'no'})`
                )
                .join(' | ')
            )}</div>`
          : '<div>-</div>';

      return `<details class="rounded-lg border border-base-300 bg-base-200">
      <summary class="cursor-pointer list-none px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="font-mono break-all">${escapeHtml(db.name)}</span>
          <span class="text-xs text-base-content/70">v${db.version ?? '-'}</span>
        </div>
        <div class="mt-1 text-xs text-base-content/70">
          Stores: <span class="font-semibold">${db.objectStoreCount}</span> | Records: <span class="font-semibold">${db.totalRecords ?? '-'}</span>
        </div>
      </summary>
      <div class="border-t border-base-300 px-3 py-2 text-sm">
        ${details}
        <div class="mt-2 flex justify-end">
          <button class="btn btn-error btn-xs" data-action="delete-idb" data-name="${encodeData(db.name)}">Delete</button>
        </div>
      </div>
    </details>`;
    })
    .join('');
  el.idbEmpty.classList.toggle('hidden', snapshot.idbEntries.length > 0);

  el.cookieBody.innerHTML = snapshot.cookieEntries
    .map(
      (cookie) => `<details class="rounded-lg border border-base-300 bg-base-200">
      <summary class="cursor-pointer list-none px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="font-mono break-all">${escapeHtml(cookie.name)}</span>
          <span class="text-xs text-base-content/70">${formatBytes(cookie.bytes)}</span>
        </div>
        <div class="mt-1 break-all text-xs text-base-content/70">${escapeHtml(truncate(cookie.value, 60))}</div>
      </summary>
      <div class="border-t border-base-300 px-3 py-2 text-sm">
        <div class="font-semibold">Value</div>
        <div class="mt-1 break-all text-xs">${escapeHtml(cookie.value)}</div>
        <div class="mt-2 flex justify-end">
          <button class="btn btn-error btn-xs" data-action="delete-cookie" data-name="${encodeData(cookie.name)}">Delete</button>
        </div>
      </div>
    </details>`
    )
    .join('');
  el.cookieEmpty.classList.toggle('hidden', snapshot.cookieEntries.length > 0);
}

function renderKvItems(
  bodyEl: HTMLDivElement,
  entries: KeyValueEntry[],
  type: 'local' | 'session'
): void {
  bodyEl.innerHTML = entries
    .map(
      (entry) => `<details class="rounded-lg border border-base-300 bg-base-200">
      <summary class="cursor-pointer list-none px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="font-mono break-all">${escapeHtml(entry.key)}</span>
          <span class="text-xs text-base-content/70">${formatBytes(entry.bytes)}</span>
        </div>
        <div class="mt-1 break-all text-xs text-base-content/70">${escapeHtml(truncate(entry.value, 60))}</div>
      </summary>
      <div class="border-t border-base-300 px-3 py-2 text-sm">
        <div class="font-semibold">Value</div>
        <div class="mt-1 break-all text-xs">${escapeHtml(entry.value)}</div>
        <div class="mt-2 flex justify-end">
          <button class="btn btn-error btn-xs" data-action="delete-${type}-key" data-key="${encodeData(entry.key)}">Delete</button>
        </div>
      </div>
    </details>`
    )
    .join('');
}
