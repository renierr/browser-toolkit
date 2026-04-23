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

export function renderTables(el: StorageInspectorElements, snapshot: StorageSnapshot): void {
  renderKvTable(el.localBody, snapshot.localEntries, 'local');
  renderKvTable(el.sessionBody, snapshot.sessionEntries, 'session');

  el.localEmpty.classList.toggle('hidden', snapshot.localEntries.length > 0);
  el.sessionEmpty.classList.toggle('hidden', snapshot.sessionEntries.length > 0);

  el.cacheBody.innerHTML = snapshot.cacheEntries
    .map(
      (cache) => `<tr>
      <td class="font-mono break-all">${escapeHtml(cache.name)}</td>
      <td class="whitespace-nowrap">${cache.entryCount} requests</td>
      <td class="text-right">
        <button class="btn btn-error btn-xs" data-action="delete-cache" data-name="${encodeData(cache.name)}">Delete</button>
      </td>
    </tr>`
    )
    .join('');
  el.cacheEmpty.classList.toggle('hidden', snapshot.cacheEntries.length > 0);

  el.idbBody.innerHTML = snapshot.idbEntries
    .map(
      (db) => `<tr>
      <td class="font-mono break-all">${escapeHtml(db.name)}</td>
      <td class="whitespace-nowrap">${db.version ?? '-'}</td>
      <td>
        <div class="flex flex-col gap-1 text-xs">
          <div>Stores: <span class="font-semibold">${db.objectStoreCount}</span></div>
          <div>Total records: <span class="font-semibold">${db.totalRecords ?? '-'}</span></div>
          ${
            db.inspectError
              ? `<div class="text-warning break-all">Inspect error: ${escapeHtml(db.inspectError)}</div>`
              : db.stores.length > 0
                ? `<div class="break-all">${escapeHtml(
                    db.stores
                      .map(
                        (store) =>
                          `${store.name} (${store.recordCount ?? 0} rows, key: ${store.keyPath}, auto: ${store.autoIncrement ? 'yes' : 'no'})`
                      )
                      .join(' | ')
                  )}</div>`
                : '<div>-</div>'
          }
        </div>
      </td>
      <td class="text-right">
        <button class="btn btn-error btn-xs" data-action="delete-idb" data-name="${encodeData(db.name)}">Delete</button>
      </td>
    </tr>`
    )
    .join('');
  el.idbEmpty.classList.toggle('hidden', snapshot.idbEntries.length > 0);

  el.cookieBody.innerHTML = snapshot.cookieEntries
    .map(
      (cookie) => `<tr>
      <td class="font-mono break-all">${escapeHtml(cookie.name)}</td>
      <td class="break-all">${escapeHtml(truncate(cookie.value, 60))}</td>
      <td class="whitespace-nowrap">${formatBytes(cookie.bytes)}</td>
      <td class="text-right">
        <button class="btn btn-error btn-xs" data-action="delete-cookie" data-name="${encodeData(cookie.name)}">Delete</button>
      </td>
    </tr>`
    )
    .join('');
  el.cookieEmpty.classList.toggle('hidden', snapshot.cookieEntries.length > 0);
}

function renderKvTable(
  bodyEl: HTMLTableSectionElement,
  entries: KeyValueEntry[],
  type: 'local' | 'session'
): void {
  bodyEl.innerHTML = entries
    .map(
      (entry) => `<tr>
      <td class="font-mono break-all">${escapeHtml(entry.key)}</td>
      <td class="break-all">${escapeHtml(truncate(entry.value, 60))}</td>
      <td class="whitespace-nowrap">${formatBytes(entry.bytes)}</td>
      <td class="text-right">
        <button class="btn btn-error btn-xs" data-action="delete-${type}-key" data-key="${encodeData(entry.key)}">Delete</button>
      </td>
    </tr>`
    )
    .join('');
}
