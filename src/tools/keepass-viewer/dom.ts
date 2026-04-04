export interface DOMEls {
  introContainer: HTMLElement;
  activeContainer: HTMLElement;
  dropzone: HTMLElement;
  kdbxInput: HTMLInputElement;
  dbFilename: HTMLElement;
  dbInfo: HTMLElement;
  closeDbBtn: HTMLButtonElement;
  mobileTabs: HTMLElement;
  tabGroups: HTMLButtonElement;
  tabEntries: HTMLButtonElement;
  tabDetails: HTMLButtonElement;
  groupPanel: HTMLElement;
  groupTree: HTMLElement;
  groupTreeMobile: HTMLElement;
  entryPanel: HTMLElement;
  entryGroupName: HTMLElement;
  entryGroupNameMobile: HTMLElement;
  entryCount: HTMLElement;
  entryCountMobile: HTMLElement;
  entryList: HTMLElement;
  entryListMobile: HTMLElement;
  detailEmpty: HTMLElement;
  detailEmptyMobile: HTMLElement;
  detailContent: HTMLElement;
  detailContentMobile: HTMLElement;
  detailTitle: HTMLElement;
  detailTitleMobile: HTMLElement;
  detailFields: HTMLElement;
  detailFieldsMobile: HTMLElement;
  detailPanel: HTMLElement;
  passwordModal: HTMLDialogElement;
  passwordFilename: HTMLElement;
  passwordInput: HTMLInputElement;
  togglePasswordBtn: HTMLButtonElement;
  keyfileInput: HTMLInputElement;
  passwordError: HTMLElement;
  passwordErrorText: HTMLElement;
  passwordLoading: HTMLElement;
  cancelPasswordBtn: HTMLButtonElement;
  submitPasswordBtn: HTMLButtonElement;
}

export function initDOM(containerId: string): DOMEls | false {
  const root = document.getElementById(containerId);
  if (!root) return false;

  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const $input = (sel: string) => root.querySelector<HTMLInputElement>(sel)!;
  const $btn = (sel: string) => root.querySelector<HTMLButtonElement>(sel)!;
  const $dialog = (sel: string) => root.querySelector<HTMLDialogElement>(sel)!;

  return {
    introContainer: $('#intro-container'),
    activeContainer: $('#active-container'),
    dropzone: $('#dropzone'),
    kdbxInput: $input('#kdbx-input'),
    dbFilename: $('#db-filename'),
    dbInfo: $('#db-info'),
    closeDbBtn: $btn('#close-db-btn'),
    mobileTabs: $('#mobile-tabs'),
    tabGroups: $btn('#tab-groups'),
    tabEntries: $btn('#tab-entries'),
    tabDetails: $btn('#tab-details'),
    groupPanel: $('#group-panel'),
    groupTree: $('#group-tree'),
    groupTreeMobile: $('#group-tree-mobile'),
    entryPanel: $('#entry-panel'),
    entryGroupName: $('#entry-group-name'),
    entryGroupNameMobile: $('#entry-group-name-mobile'),
    entryCount: $('#entry-count'),
    entryCountMobile: $('#entry-count-mobile'),
    entryList: $('#entry-list'),
    entryListMobile: $('#entry-list-mobile'),
    detailEmpty: $('#detail-empty'),
    detailEmptyMobile: $('#detail-empty-mobile'),
    detailContent: $('#detail-content'),
    detailContentMobile: $('#detail-content-mobile'),
    detailTitle: $('#detail-title'),
    detailTitleMobile: $('#detail-title-mobile'),
    detailFields: $('#detail-fields'),
    detailFieldsMobile: $('#detail-fields-mobile'),
    detailPanel: $('#detail-panel'),
    passwordModal: $dialog('#password-modal'),
    passwordFilename: $('#password-filename'),
    passwordInput: $input('#password-input'),
    togglePasswordBtn: $btn('#toggle-password-btn'),
    keyfileInput: $input('#keyfile-input'),
    passwordError: $('#password-error'),
    passwordErrorText: $('#password-error-text'),
    passwordLoading: $('#password-loading'),
    cancelPasswordBtn: $btn('#cancel-password-btn'),
    submitPasswordBtn: $btn('#submit-password-btn'),
  };
}
