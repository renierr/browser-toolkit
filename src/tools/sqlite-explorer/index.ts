import type { SharedFilesPayload } from '../../js/share-target';
import { setupFileDropzone } from '../../js/file-utils';
import { html } from '../../js/utils';
import { getSettings } from '../../js/settings';

// @ts-ignore
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { WorkerRequest } from './worker';

// @ts-ignore
import SqlWorker from './worker?worker';

let worker: Worker | null = null;
let currentTable = '';
let currentLimit = 50;
let currentOffset = 0;
let dbName = '';
let settingsCleanup: (() => void) | undefined;

export default function init(payload?: SharedFilesPayload) {
  const container = document.getElementById('sqlite-explorer-app');
  if (!container) return;
  
  // Settings Bind
  const settings = getSettings('sqlite-explorer');
  settingsCleanup = settings.bind(container);

  currentLimit = settings.get('rowLimit', 50);

  // Event Listeners for UI
  setupUIEventListeners();

  // Initialize Worker
  worker = new SqlWorker();
  
  worker.onmessage = (e) => {
    handleWorkerMessage(e.data);
  };
  
  // initialize sql.js in worker
  worker.postMessage({ wasmUrl });

  // Handle Dropzone
  setupFileDropzone('dropzone', 'sql-input', async (files: FileList) => {
    if (files.length > 0) {
      await loadFile(files[0]);
    }
  });

  // Handle Shared Files
  if (payload?.sharedFiles?.length) {
    loadFile(payload.sharedFiles[0]);
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
  document.getElementById('db-filename')!.textContent = dbName;
  document.getElementById('db-filesize')!.textContent = `${sizeMb} MB`;

  try {
     const arrayBuffer = await file.arrayBuffer();
     const uint8Array = new Uint8Array(arrayBuffer);
     worker.postMessage({ req: { type: 'LOAD_DB', payload: { buffer: uint8Array } } as WorkerRequest });
  } catch (e) {
     console.error("Failed to read file", e);
     alert("Failed to read the database file.");
  }
}

function closeDatabase() {
  document.getElementById('dropzone')!.classList.remove('hidden');
  document.getElementById('active-container')!.classList.add('hidden');
  document.getElementById('table-list')!.innerHTML = '';
  document.getElementById('table-count')!.textContent = '0';
  (document.getElementById('custom-query-input') as HTMLTextAreaElement).value = '';
  currentTable = '';
  if (worker) {
      // Sending a load DB with empty buffer will effectively close the old one
      worker.postMessage({ req: { type: 'LOAD_DB', payload: { buffer: new Uint8Array(0) } } as WorkerRequest });
  }
}

function switchTab(tabId: string) {
  // Update Tab Buttons
  document.querySelectorAll('#main-tabs .tab').forEach(btn => {
    if ((btn as HTMLElement).dataset.tab === tabId) {
      btn.classList.add('tab-active');
    } else {
      btn.classList.remove('tab-active');
    }
  });

  // Update Content
  document.getElementById('tab-content-data')!.classList.toggle('hidden', tabId !== 'data');
  document.getElementById('tab-content-schema')!.classList.toggle('hidden', tabId !== 'schema');
  document.getElementById('tab-content-query')!.classList.toggle('hidden', tabId !== 'query');

  if (tabId === 'data' && currentTable) {
      requestData();
  }
}

function selectTable(tableName: string) {
  currentTable = tableName;
  currentOffset = 0;
  
  // Update visual selection
  document.querySelectorAll('#table-list a').forEach(aEl => {
     if ((aEl as HTMLElement).dataset.table === tableName) {
         aEl.classList.add('active');
     } else {
         aEl.classList.remove('active');
     }
  });

  // Switch to data tab and un-hide active states
  document.getElementById('data-empty-state')!.classList.add('hidden');
  document.getElementById('data-active-state')!.classList.remove('hidden');
  document.getElementById('schema-empty-state')!.classList.add('hidden');
  document.getElementById('schema-active-state')!.classList.remove('hidden');

  document.getElementById('current-table-name-data')!.textContent = `Data: ${tableName}`;
  document.getElementById('current-table-name-schema')!.textContent = `Schema: ${tableName}`;

  requestSchema();
  requestData();
}

function requestSchema() {
  worker?.postMessage({ req: { type: 'GET_SCHEMA', payload: { table: currentTable } } as WorkerRequest });
}

function requestData() {
  worker?.postMessage({ req: { type: 'GET_DATA', payload: { table: currentTable, limit: currentLimit, offset: currentOffset } } as WorkerRequest });
}

function executeCustomQuery() {
   const sql = (document.getElementById('custom-query-input') as HTMLTextAreaElement).value.trim();
   if (!sql) return;

   document.getElementById('query-error')!.classList.add('hidden');
   document.getElementById('query-results-placeholder')!.classList.remove('hidden');
   document.getElementById('query-results-table-container')!.classList.add('hidden');
   worker?.postMessage({ req: { type: 'EXECUTE_QUERY', payload: { sql } } as WorkerRequest });
}

// ---------------------------------------------------------------------------
// Worker Message Handling
// ---------------------------------------------------------------------------

function handleWorkerMessage(data: any) {
  if (data.type === 'INIT_SUCCESS') {
     console.log('SQL.js WebWorker initialized');
  } else if (data.type === 'ERROR') {
     console.error('[WebWorker SQL Error]', data.payload.message);
     // If we are on query tab, show it specifically
     const activeTab = document.querySelector('#main-tabs .tab-active') as HTMLElement;
     if (activeTab?.dataset.tab === 'query') {
        document.getElementById('query-error')!.classList.remove('hidden');
        document.getElementById('query-error-text')!.textContent = data.payload.message;
        document.getElementById('query-results-placeholder')!.classList.add('hidden');
     } else {
        alert("SQL Error: " + data.payload.message);
     }
  } else if (data.type === 'LOAD_DB_SUCCESS') {
    // Reveal main UI
    document.getElementById('dropzone')!.classList.add('hidden');
    document.getElementById('active-container')!.classList.remove('hidden');
    worker?.postMessage({ req: { type: 'GET_TABLES' } as WorkerRequest });
  } else if (data.type === 'GET_TABLES_SUCCESS') {
    renderTableList(data.payload.tables);
  } else if (data.type === 'GET_SCHEMA_SUCCESS') {
    if (data.payload.table === currentTable) {
        renderSchemaTable(data.payload.schema);
    }
  } else if (data.type === 'GET_DATA_SUCCESS') {
    if (data.payload.table === currentTable) {
       renderDataTable(data.payload.columns, data.payload.rows, data.payload.totalCount);
    }
  } else if (data.type === 'EXECUTE_QUERY_SUCCESS') {
     renderCustomQueryResult(data.payload.columns, data.payload.rows);
  }
}

// ---------------------------------------------------------------------------
// UI Rendering
// ---------------------------------------------------------------------------

function renderTableList(tables: string[]) {
   document.getElementById('table-count')!.textContent = String(tables.length);
   const list = document.getElementById('table-list')!;
   list.innerHTML = tables.map(name => 
     html`<li><a href="#" data-table="${name}"><i data-lucide="table" class="w-4 h-4 mr-1"></i> ${name}</a></li>`
   ).join('');

   // Re-init lucide icons for dynamically added elements
   if ((window as any).lucide) {
      (window as any).lucide.createIcons();
   }

   // Attach click handlers
   list.querySelectorAll('a').forEach(aEl => {
      aEl.addEventListener('click', (e) => {
         e.preventDefault();
         selectTable((e.currentTarget as HTMLElement).dataset.table!);
      });
   });

   // Select first table automatically if none selected
   if (tables.length > 0) {
      selectTable(tables[0]);
   }
}

function renderSchemaTable(schemaRows: any[]) {
   const tbody = document.getElementById('schema-table-body')!;
   tbody.innerHTML = schemaRows.map(row => {
     // row: [cid, name, type, notnull, dflt_value, pk]
     const notNull = row[3] ? `<span class="badge badge-neutral badge-sm">Yes</span>` : '';
     const pk = row[5] ? `<span class="badge badge-primary badge-sm">PK</span>` : '';
     return html`
       <tr>
         <td>${row[0]}</td>
         <td class="font-mono font-medium">${row[1]}</td>
         <td><span class="badge badge-ghost badge-sm">${row[2]}</span></td>
         <td>${notNull}</td>
         <td class="font-mono text-xs text-base-content/70">${row[4] ?? 'NULL'}</td>
         <td>${pk}</td>
       </tr>
     `;
   }).join('');
}

function renderDataTable(columns: string[], rows: any[][], totalCount: number) {
   const thead = document.getElementById('data-table-head')!;
   const tbody = document.getElementById('data-table-body')!;

   if (columns.length === 0) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td class="text-center p-4 text-base-content/50">No data found in this table.</td></tr>';
   } else {
      thead.innerHTML = html`<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
      tbody.innerHTML = rows.map(row => 
         html`<tr>${row.map(cell => `<td class="max-w-[200px] truncate" title="${cell ?? ''}">${cell ?? '<em class="text-base-content/30">NULL</em>'}</td>`).join('')}</tr>`
      ).join('');
   }

   // Update Pagination
   const info = document.getElementById('pagination-info')!;
   if (totalCount === 0) {
      info.textContent = 'No records';
   } else {
      const start = currentOffset + 1;
      const end = Math.min(currentOffset + currentLimit, totalCount);
      info.textContent = `Showing ${start}-${end} of ${totalCount.toLocaleString()}`;
   }

   (document.getElementById('btn-prev-page') as HTMLButtonElement).disabled = currentOffset === 0;
   (document.getElementById('btn-next-page') as HTMLButtonElement).disabled = currentOffset + currentLimit >= totalCount;
}

function renderCustomQueryResult(columns: string[], rows: any[][]) {
   document.getElementById('query-results-placeholder')!.classList.add('hidden');
   const container = document.getElementById('query-results-table-container')!;
   container.classList.remove('hidden');

   const thead = document.getElementById('query-results-head')!;
   const tbody = document.getElementById('query-results-body')!;
   
   document.getElementById('query-results-count')!.textContent = rows.length > 0 ? `${rows.length} rows returned` : 'No rows returned';

   if (columns.length === 0) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td class="text-center p-4 text-base-content/50">Query executed successfully. No data returned.</td></tr>';
   } else {
      thead.innerHTML = html`<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
      tbody.innerHTML = rows.map(row => 
         html`<tr>${row.map(cell => `<td class="max-w-[300px] truncate" title="${cell ?? ''}">${cell ?? '<em class="text-base-content/30">NULL</em>'}</td>`).join('')}</tr>`
      ).join('');
   }
}

// ---------------------------------------------------------------------------
// Setup Event Listeners
// ---------------------------------------------------------------------------

function setupUIEventListeners() {
  document.getElementById('close-db-btn')?.addEventListener('click', closeDatabase);

  document.querySelectorAll('#main-tabs .tab').forEach(btn => {
     btn.addEventListener('click', (e) => {
        switchTab((e.currentTarget as HTMLElement).dataset.tab!);
     });
  });

  document.getElementById('row-limit-select')?.addEventListener('change', (e) => {
     currentLimit = Number((e.target as HTMLSelectElement).value);
     currentOffset = 0; // reset to page 1 on limit change
     requestData();
  });

  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
     if (currentOffset >= currentLimit) {
        currentOffset -= currentLimit;
        requestData();
     }
  });

  document.getElementById('btn-next-page')?.addEventListener('click', () => {
     currentOffset += currentLimit;
     requestData();
  });

  document.getElementById('execute-query-btn')?.addEventListener('click', executeCustomQuery);
}
