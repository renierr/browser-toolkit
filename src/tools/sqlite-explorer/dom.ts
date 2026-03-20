export interface DOMEls {
  container: HTMLElement;
  introContainer: HTMLElement;
  activeContainer: HTMLElement;
  dropzone: HTMLElement;
  dbFilename: HTMLElement;
  dbFilesize: HTMLElement;
  closeDbBtn: HTMLButtonElement;
  toggleSidebarBtnShow: HTMLButtonElement;
  toggleSidebarBtnHide: HTMLButtonElement;
  sidebar: HTMLElement;

  tableCount: HTMLElement;
  tableList: HTMLElement;

  mainTabs: HTMLElement;
  tabContentData: HTMLElement;
  tabContentSchema: HTMLElement;
  tabContentQuery: HTMLElement;

  dataEmptyState: HTMLElement;
  dataActiveState: HTMLElement;
  currentTableNameData: HTMLElement;
  rowLimitSelect: HTMLSelectElement;
  dataTableHead: HTMLElement;
  dataTableBody: HTMLElement;
  paginationInfo: HTMLElement;
  btnPrevPage: HTMLButtonElement;
  btnNextPage: HTMLButtonElement;

  schemaEmptyState: HTMLElement;
  schemaActiveState: HTMLElement;
  currentTableNameSchema: HTMLElement;
  schemaTableBody: HTMLElement;

  customQueryInput: HTMLTextAreaElement;
  executeQueryBtn: HTMLButtonElement;
  queryError: HTMLElement;
  queryErrorText: HTMLElement;
  queryResultsPlaceholder: HTMLElement;
  queryResultsTableContainer: HTMLElement;
  queryResultsHead: HTMLElement;
  queryResultsBody: HTMLElement;
  queryResultsCount: HTMLElement;
}

export let UI: DOMEls;

export function initDOM(containerId: string): boolean {
  const container = document.getElementById(containerId);
  if (!container) return false;

  UI = {
    container,
    introContainer: document.getElementById('intro-container')!,
    activeContainer: document.getElementById('active-container')!,
    dropzone: document.getElementById('dropzone')!,
    dbFilename: document.getElementById('db-filename')!,
    dbFilesize: document.getElementById('db-filesize')!,
    closeDbBtn: document.getElementById('close-db-btn') as HTMLButtonElement,
    toggleSidebarBtnShow: document.getElementById('toggle-sidebar-btn-show') as HTMLButtonElement,
    toggleSidebarBtnHide: document.getElementById('toggle-sidebar-btn-hide') as HTMLButtonElement,
    sidebar: document.getElementById('sidebar')!,

    tableCount: document.getElementById('table-count')!,
    tableList: document.getElementById('table-list')!,

    mainTabs: document.getElementById('main-tabs')!,
    tabContentData: document.getElementById('tab-content-data')!,
    tabContentSchema: document.getElementById('tab-content-schema')!,
    tabContentQuery: document.getElementById('tab-content-query')!,

    dataEmptyState: document.getElementById('data-empty-state')!,
    dataActiveState: document.getElementById('data-active-state')!,
    currentTableNameData: document.getElementById('current-table-name-data')!,
    rowLimitSelect: document.getElementById('row-limit-select') as HTMLSelectElement,
    dataTableHead: document.getElementById('data-table-head')!,
    dataTableBody: document.getElementById('data-table-body')!,
    paginationInfo: document.getElementById('pagination-info')!,
    btnPrevPage: document.getElementById('btn-prev-page') as HTMLButtonElement,
    btnNextPage: document.getElementById('btn-next-page') as HTMLButtonElement,

    schemaEmptyState: document.getElementById('schema-empty-state')!,
    schemaActiveState: document.getElementById('schema-active-state')!,
    currentTableNameSchema: document.getElementById('current-table-name-schema')!,
    schemaTableBody: document.getElementById('schema-table-body')!,

    customQueryInput: document.getElementById('custom-query-input') as HTMLTextAreaElement,
    executeQueryBtn: document.getElementById('execute-query-btn') as HTMLButtonElement,
    queryError: document.getElementById('query-error')!,
    queryErrorText: document.getElementById('query-error-text')!,
    queryResultsPlaceholder: document.getElementById('query-results-placeholder')!,
    queryResultsTableContainer: document.getElementById('query-results-table-container')!,
    queryResultsHead: document.getElementById('query-results-head')!,
    queryResultsBody: document.getElementById('query-results-body')!,
    queryResultsCount: document.getElementById('query-results-count')!,
  };
  return true;
}
