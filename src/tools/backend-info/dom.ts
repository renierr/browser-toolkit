export type BackendInfoDom = {
  container: HTMLElement;
  loadingEl: HTMLElement;
  errorEl: HTMLElement;
  contentEl: HTMLElement;
  refreshBtn: HTMLButtonElement;
  checkUpdateBtn: HTMLButtonElement;
  runUpdateBtn: HTMLButtonElement;
  forceToggle: HTMLInputElement;
  updateStateEl: HTMLElement;
  updateMessageEl: HTMLElement;
  updateLogsEl: HTMLElement;
};

function requiredElement<T extends Element>(container: HTMLElement, selector: string): T {
  const el = container.querySelector(selector);
  if (!el) {
    throw new Error(`[BackendInfo] Missing DOM element: ${selector}`);
  }
  return el as T;
}

export function getBackendInfoDom(rootId: string): BackendInfoDom | null {
  const container = document.getElementById(rootId);
  if (!container) {
    return null;
  }

  return {
    container,
    loadingEl: requiredElement<HTMLElement>(container, '#info-loading'),
    errorEl: requiredElement<HTMLElement>(container, '#info-error'),
    contentEl: requiredElement<HTMLElement>(container, '#info-content'),
    refreshBtn: requiredElement<HTMLButtonElement>(container, '#refresh-btn'),
    checkUpdateBtn: requiredElement<HTMLButtonElement>(container, '#check-update-btn'),
    runUpdateBtn: requiredElement<HTMLButtonElement>(container, '#run-update-btn'),
    forceToggle: requiredElement<HTMLInputElement>(container, '#force-update-toggle'),
    updateStateEl: requiredElement<HTMLElement>(container, '#upd-state'),
    updateMessageEl: requiredElement<HTMLElement>(container, '#upd-message'),
    updateLogsEl: requiredElement<HTMLElement>(container, '#upd-logs'),
  };
}
