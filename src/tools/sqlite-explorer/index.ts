import type { SharedFilesPayload } from '@js/share-target';
import { setupFileDropzone } from '@js/file-utils';
import { getSettings } from '@js/settings';

import type { WorkerRequest } from './worker';
// @ts-ignore
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
// @ts-ignore
import SqlWorker from './worker?worker';

import { initDOM, UI } from './dom';
import { renderTableList, renderSchemaTable, renderDataTable, renderCustomQueryResult } from './ui';
import { showMessage } from '@js/ui.ts';

let worker: Worker | null = null;
let currentTable = '';
let currentLimit = 50;
let currentOffset = 0;
let dbName = '';
let settingsCleanup: (() => void) | undefined;

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  if (!initDOM('sqlite-explorer-app')) return;

  let pendingFile: File | null = null;

  // Settings Bind
  const settings = getSettings('sqlite-explorer');
  settingsCleanup = settings.bind(UI.container);

  currentLimit = Number(settings.get('rowLimit', 50));

  // Event Listeners for UI
  setupUIEventListeners();

  // Initialize Worker
  worker = new SqlWorker();

  worker.onmessage = (e) => {
    const data = e.data;

    if (data.type === 'INIT_SUCCESS') {
      console.log('SQL.js WebWorker initialized');
      if (pendingFile) {
        loadFile(pendingFile);
        pendingFile = null;
      }
    } else if (data.type === 'ERROR') {
      console.error('[WebWorker SQL Error]', data.payload.message);
      const activeTab = UI.mainTabs.querySelector('.tab-active') as HTMLElement;
      if (activeTab?.dataset.tab === 'query') {
        UI.queryError.classList.remove('hidden');
        UI.queryErrorText.textContent = data.payload.message;
        UI.queryResultsPlaceholder.classList.add('hidden');
      } else {
        showMessage('SQL Error: ' + data.payload.message, { type: 'alert', timeoutMs: 5000 });
      }
    } else if (data.type === 'LOAD_DB_SUCCESS') {
      UI.introContainer.classList.add('hidden');
      UI.activeContainer.classList.remove('hidden');
      worker?.postMessage({ req: { type: 'GET_TABLES' } as WorkerRequest });
    } else if (data.type === 'GET_TABLES_SUCCESS') {
      renderTableList(data.payload.tables, selectTable);
    } else if (data.type === 'GET_SCHEMA_SUCCESS') {
      if (data.payload.table === currentTable) {
        renderSchemaTable(data.payload.schema);
      }
    } else if (data.type === 'GET_DATA_SUCCESS') {
      if (data.payload.table === currentTable) {
        renderDataTable(
          data.payload.columns,
          data.payload.rows,
          data.payload.totalCount,
          currentOffset,
          currentLimit
        );
      }
    } else if (data.type === 'EXECUTE_QUERY_SUCCESS') {
      renderCustomQueryResult(data.payload.columns, data.payload.rows);
    }
  };

  // initialize sql.js in worker
  worker.postMessage({ wasmUrl });

  // Handle Dropzone
  setupFileDropzone('dropzone', 'sql-input', async (files: FileList) => {
    await loadFile(files[0]);
  });

  // Handle Shared Files
  if (payload?.sharedFiles?.length) {
    pendingFile = payload.sharedFiles[0];
  }

  return () => {
    // Cleanup
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (settingsCleanup) {
      settingsCleanup();
    }
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function loadFile(file: File) {
  if (!worker) return;
  dbName = file.name;

  // Update header sizes
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  UI.dbFilename.textContent = dbName;
  UI.dbFilesize.textContent = `${sizeMb} MB`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    worker.postMessage({
      req: { type: 'LOAD_DB', payload: { buffer: uint8Array } } as WorkerRequest,
    });
  } catch (e) {
    console.error('Failed to read file', e);
    showMessage('Failed to read the database file. Maybe not an SQLite Database.', {
      type: 'alert',
      timeoutMs: 5000,
    });
  }
}

function closeDatabase() {
  UI.introContainer.classList.remove('hidden');
  UI.activeContainer.classList.add('hidden');
  UI.tableList.innerHTML = '';
  UI.tableCount.textContent = '0';
  UI.customQueryInput.value = '';
  currentTable = '';
  if (worker) {
    worker.postMessage({ req: { type: 'CLOSE_DB' } });
  }
}

function switchTab(tabId: string) {
  // Update Tab Buttons
  UI.mainTabs.querySelectorAll('.tab').forEach((btn) => {
    if ((btn as HTMLElement).dataset.tab === tabId) {
      btn.classList.add('tab-active');
    } else {
      btn.classList.remove('tab-active');
    }
  });

  // Update Content
  UI.tabContentData.classList.toggle('hidden', tabId !== 'data');
  UI.tabContentSchema.classList.toggle('hidden', tabId !== 'schema');
  UI.tabContentQuery.classList.toggle('hidden', tabId !== 'query');

  if (tabId === 'data' && currentTable) {
    requestData();
  }
}

function selectTable(tableName: string) {
  currentTable = tableName;
  currentOffset = 0;

  // Update visual selection
  UI.tableList.querySelectorAll('a').forEach((aEl) => {
    if ((aEl as HTMLElement).dataset.table === tableName) {
      aEl.classList.add('active');
    } else {
      aEl.classList.remove('active');
    }
  });

  // Switch to data tab and un-hide active states
  UI.dataEmptyState.classList.add('hidden');
  UI.dataActiveState.classList.remove('hidden');
  UI.schemaEmptyState.classList.add('hidden');
  UI.schemaActiveState.classList.remove('hidden');

  UI.currentTableNameData.textContent = `Data: ${tableName}`;
  UI.currentTableNameSchema.textContent = `Schema: ${tableName}`;

  requestSchema();
  requestData();
}

function requestSchema() {
  worker?.postMessage({
    req: { type: 'GET_SCHEMA', payload: { table: currentTable } } as WorkerRequest,
  });
}

function requestData() {
  worker?.postMessage({
    req: {
      type: 'GET_DATA',
      payload: { table: currentTable, limit: currentLimit, offset: currentOffset },
    } as WorkerRequest,
  });
}

function executeCustomQuery() {
  const sql = UI.customQueryInput.value.trim();
  if (!sql) return;

  UI.queryError.classList.add('hidden');
  UI.queryResultsPlaceholder.classList.remove('hidden');
  UI.queryResultsTableContainer.classList.add('hidden');
  worker?.postMessage({ req: { type: 'EXECUTE_QUERY', payload: { sql } } as WorkerRequest });
}

// ---------------------------------------------------------------------------
// Setup Event Listeners
// ---------------------------------------------------------------------------

function setupUIEventListeners() {
  UI.closeDbBtn.addEventListener('click', closeDatabase);

  UI.toggleSidebarBtnHide.addEventListener('click', () => {
    UI.sidebar.classList.add('hidden');
    UI.toggleSidebarBtnShow.classList.remove('hidden');
  });

  UI.toggleSidebarBtnShow.addEventListener('click', () => {
    UI.sidebar.classList.remove('hidden');
    UI.toggleSidebarBtnShow.classList.add('hidden');
  });

  UI.mainTabs.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      switchTab((e.currentTarget as HTMLElement).dataset.tab!);
    });
  });

  UI.rowLimitSelect.addEventListener('change', (e) => {
    currentLimit = Number((e.target as HTMLSelectElement).value);
    currentOffset = 0; // reset to page 1 on limit change
    requestData();
  });

  UI.btnPrevPage.addEventListener('click', () => {
    if (currentOffset >= currentLimit) {
      currentOffset -= currentLimit;
      requestData();
    }
  });

  UI.btnNextPage.addEventListener('click', () => {
    currentOffset += currentLimit;
    requestData();
  });

  UI.executeQueryBtn.addEventListener('click', executeCustomQuery);
}
