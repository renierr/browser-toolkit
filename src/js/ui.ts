import { iconSvgElement } from './tool-icons.ts';

export type MessageType = 'info' | 'warning' | 'alert';

function iconIdForMessageType(type: MessageType): string {
  switch (type) {
    case 'alert':
      return 'x-circle';
    case 'warning':
      return 'alert-triangle';
    case 'info':
    default:
      return 'info';
  }
}

type MessageOptions = {
  /**
   * Message type (optional). Default: info (with icon and no text shown)
   */
  type?: MessageType;
  hideTypeIcon?: boolean;
  hideTypeText?: boolean;
  /**
   * Auto-close after N ms (optional). Example: 5000
   */
  timeoutMs?: number;
};

type ShowProgressOptions = {
  /**
   * Initial visibility (optional). Default: true
   */
  visible?: boolean;
  /**
   * Auto-close after N ms (optional). Example: 5000
   */
  timeoutMs?: number;
  /**
   * Show a close button if progress is still visible after N ms (optional).
   * Example: 3000
   */
  tooLongMs?: number;
};

let progressAutoCloseTimer: number | null = null;
let progressTooLongTimer: number | null = null;
let progressCloseWired = false;

function clearProgressTimers() {
  if (progressAutoCloseTimer !== null) {
    window.clearTimeout(progressAutoCloseTimer);
    progressAutoCloseTimer = null;
  }
  if (progressTooLongTimer !== null) {
    window.clearTimeout(progressTooLongTimer);
    progressTooLongTimer = null;
  }
}

function hideProgressCloseButton(closeEl: HTMLButtonElement | null) {
  if (!closeEl) return;
  closeEl.classList.add('hidden');
  closeEl.classList.remove('inline-flex');
}

function showProgressCloseButton(closeEl: HTMLButtonElement | null) {
  if (!closeEl) return;
  closeEl.classList.remove('hidden');
  closeEl.classList.add('inline-flex');
}

export function showProgress(message: string, options: ShowProgressOptions = { visible: true }) {
  const el = document.getElementById('ui-progress');
  const textEl = document.getElementById('ui-progress-text');
  const closeEl = document.getElementById('ui-progress-close') as HTMLButtonElement | null;
  if (!el || !textEl) return;

  const visible = options?.visible ?? true;
  textEl.textContent = (message ?? 'Working…').toString();

  // Toggle visibility
  el.classList.toggle('invisible', !visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');

  // Wire close button once
  if (!progressCloseWired && closeEl) {
    progressCloseWired = true;
    closeEl.addEventListener('click', () => hideProgress());
  }

  // When hiding: clear timers + hide close icon
  if (!visible) {
    clearProgressTimers();
    hideProgressCloseButton(closeEl);
    return;
  }

  // When showing: reset timers + hide close icon initially
  clearProgressTimers();
  hideProgressCloseButton(closeEl);

  // Auto-close after timeoutMs
  if (
    typeof options.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
  ) {
    progressAutoCloseTimer = window.setTimeout(() => {
      hideProgress();
    }, options.timeoutMs);
  }

  // Show a close icon if it takes too long
  if (
    closeEl &&
    typeof options.tooLongMs === 'number' &&
    Number.isFinite(options.tooLongMs) &&
    options.tooLongMs > 0
  ) {
    progressTooLongTimer = window.setTimeout(() => {
      const isHidden = el.classList.contains('hidden') || el.getAttribute('aria-hidden') === 'true';
      if (!isHidden) showProgressCloseButton(closeEl);
    }, options.tooLongMs);
  }
}

export function hideProgress() {
  showProgress('', { visible: false });
}

export function showMessage(message: string, opts: MessageOptions = { type: 'info' }) {
  const host = document.getElementById('ui-messages');
  if (!host) return;

  const options = { type: 'info', hideTypeText: true, ...opts } as MessageOptions;
  const msgType = options?.type || 'info';

  const item = document.createElement('div');
  // daisyUI alert component with type styles
  const alertTypeClass =
    msgType === 'alert' ? 'alert-error' : msgType === 'warning' ? 'alert-warning' : 'alert-info';
  item.className = `alert ${alertTypeClass}`;
  item.setAttribute('role', msgType === 'info' ? 'status' : 'alert');

  const badgeIcon = iconSvgElement(iconIdForMessageType(msgType), 'w-4 h-4');
  const badgeLabel = document.createElement('span');
  badgeLabel.textContent = msgType.toUpperCase();

  const text = document.createElement('div');
  text.className = '';
  text.textContent = (message ?? '').toString();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-ghost btn-sm';
  closeBtn.setAttribute('aria-label', 'Close message');
  closeBtn.innerHTML = '&#10005;';

  let autoCloseTimer: number | null = null;

  const close = () => {
    if (autoCloseTimer !== null) {
      window.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    item.remove();
  };
  closeBtn.addEventListener('click', close);

  if (badgeIcon && !options.hideTypeIcon) item.appendChild(badgeIcon);
  if (!options.hideTypeText) item.appendChild(badgeLabel);
  item.appendChild(text);
  item.appendChild(closeBtn);

  host.appendChild(item);

  // Auto-close after timeoutMs (optional)
  if (
    typeof options.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
  ) {
    autoCloseTimer = window.setTimeout(() => {
      close();
    }, options.timeoutMs);
  }

  return { close };
}
