import { html } from '../../js/utils';
import { UI } from './dom';

export function renderTableList(tables: string[], onSelect: (table: string) => void) {
  UI.tableCount.textContent = String(tables.length);
  UI.tableList.innerHTML = tables.map(name => 
    html`<li><a href="#" data-table="${name}"><i data-lucide="table" class="w-4 h-4 mr-1 md:mr-2"></i> <span class="truncate">${name}</span></a></li>`
  ).join('');

  if ((window as any).lucide) {
    (window as any).lucide.createIcons({ root: UI.tableList });
  }

  UI.tableList.querySelectorAll('a').forEach(aEl => {
    aEl.addEventListener('click', (e) => {
      e.preventDefault();
      onSelect((e.currentTarget as HTMLElement).dataset.table!);
    });
  });
}

export function renderSchemaTable(schemaRows: any[]) {
  UI.schemaTableBody.innerHTML = schemaRows.map(row => {
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

export function renderDataTable(columns: string[], rows: any[][], totalCount: number, currentOffset: number, currentLimit: number) {
  if (columns.length === 0) {
    UI.dataTableHead.innerHTML = '';
    UI.dataTableBody.innerHTML = '<tr><td class="text-center p-4 text-base-content/50">No data found in this table.</td></tr>';
  } else {
    UI.dataTableHead.innerHTML = html`<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
    UI.dataTableBody.innerHTML = rows.map(row => 
      html`<tr>${row.map(cell => `<td class="max-w-[200px] md:max-w-xs break-all whitespace-normal" title="${cell ?? ''}">${cell ?? '<em class="text-base-content/30">NULL</em>'}</td>`).join('')}</tr>`
    ).join('');
  }

  // Update Pagination
  if (totalCount === 0) {
    UI.paginationInfo.textContent = 'No records';
  } else {
    const start = currentOffset + 1;
    const end = Math.min(currentOffset + currentLimit, totalCount);
    UI.paginationInfo.textContent = `Showing ${start}-${end} of ${totalCount.toLocaleString()}`;
  }

  UI.btnPrevPage.disabled = currentOffset === 0;
  UI.btnNextPage.disabled = currentOffset + currentLimit >= totalCount;
}

export function renderCustomQueryResult(columns: string[], rows: any[][]) {
  UI.queryResultsPlaceholder.classList.add('hidden');
  UI.queryResultsTableContainer.classList.remove('hidden');

  UI.queryResultsCount.textContent = rows.length > 0 ? `${rows.length} rows returned` : 'No rows returned';

  if (columns.length === 0) {
    UI.queryResultsHead.innerHTML = '';
    UI.queryResultsBody.innerHTML = '<tr><td class="text-center p-4 text-base-content/50">Query executed successfully. No data returned.</td></tr>';
  } else {
    UI.queryResultsHead.innerHTML = html`<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
    UI.queryResultsBody.innerHTML = rows.map(row => 
      html`<tr>${row.map(cell => `<td class="max-w-[200px] md:max-w-sm break-all whitespace-normal" title="${cell ?? ''}">${cell ?? '<em class="text-base-content/30">NULL</em>'}</td>`).join('')}</tr>`
    ).join('');
  }
}
