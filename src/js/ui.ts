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
   * Progress percentage (optional). 0-100
   */
  progress?: number;
  /**
   * Auto-close after N ms (optional). Example: 5000
   */
  timeoutMs?: number;
  /**
   * Show a close button if progress is still visible after N ms (optional).
   * Example: 3000
   */
  tooLongMs?: number;
  /**
   * Optional HTMLElement to display alongside the progress text (e.g. an image preview).
   * - `undefined` (omitted): keep whatever is already shown
   * - `null`: explicitly clear the content area
   * - `HTMLElement`: replace content area with this element
   *
   * The content area is constrained to max-w-[40vw] max-h-[50vh] with object-contain
   * applied automatically to any <img> children.
   * Cleared automatically when hideProgress() is called.
   */
  contentElement?: HTMLElement | null;
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
  const contentEl = document.getElementById('ui-progress-content');
  if (!el || !textEl) return;

  const visible = options?.visible ?? true;
  let text = (message ?? 'Working…').toString();
  if (typeof options.progress === 'number') {
    text += ` (${Math.round(options.progress)}%)`;
  }
  textEl.textContent = text;

  // Manage optional content area (e.g. image preview)
  if (contentEl) {
    if (options.contentElement === null) {
      // Explicitly clear
      contentEl.replaceChildren();
      contentEl.style.display = 'none';
    } else if (options.contentElement instanceof HTMLElement) {
      // Set new content – auto-apply object-contain to <img> children
      contentEl.replaceChildren(options.contentElement);
      contentEl.querySelectorAll('img').forEach((img) => {
        img.style.objectFit = 'contain';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '50dvh';
      });
      contentEl.style.display = 'flex';
    }
    // undefined → keep existing content as-is
  }

  // Toggle visibility and interactivity
  el.classList.toggle('invisible', !visible);
  if (visible) {
    el.removeAttribute('inert');
  } else {
    el.setAttribute('inert', '');
  }

  if (el.hasAttribute('popover') && typeof (el as any).showPopover === 'function') {
    try {
      const isOpen = el.matches(':popover-open');
      if (visible && !isOpen) {
        (el as any).showPopover();
      } else if (!visible && isOpen) {
        (el as any).hidePopover();
      }
    } catch (e) {
      // ignore
    }
  }

  // Wire close button once
  if (!progressCloseWired && closeEl) {
    progressCloseWired = true;
    closeEl.addEventListener('click', () => hideProgress());
  }

  // When hiding: clear timers + hide close icon + clear content
  if (!visible) {
    clearProgressTimers();
    hideProgressCloseButton(closeEl);
    if (contentEl) {
      contentEl.replaceChildren();
      contentEl.style.display = 'none';
    }
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
      const isHidden = el.hasAttribute('inert');
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

  // info messages have auto close default to 30 seconds if not set from outside
  if (msgType === 'info' && options.timeoutMs === undefined) options.timeoutMs = 30000;

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
  text.className = 'min-w-0 break-all';
  text.textContent = (message ?? '').toString();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-ghost btn-sm';
  closeBtn.setAttribute('aria-label', 'Close message');
  closeBtn.innerHTML = '&#10005;';

  let autoCloseTimer: number | null = null;
  let countdownInterval: number | null = null;
  let countdownEl: HTMLSpanElement | null = null;
  let remainingMs: number | null = null;
  let pauseTimers: (() => void) | null = null;
  let resumeTimers: (() => void) | null = null;

  const close = () => {
    if (autoCloseTimer !== null) {
      window.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    if (countdownInterval !== null) {
      window.clearInterval(countdownInterval);
      countdownInterval = null;
    }
    // clear paused state
    remainingMs = null;
    // remove hover listeners if wired
    if (pauseTimers) item.removeEventListener('mouseenter', pauseTimers);
    if (resumeTimers) item.removeEventListener('mouseleave', resumeTimers);
    item.remove();

    // If no more messages, make host inert again
    if (host.children.length === 0) {
      host.setAttribute('inert', '');
    }
  };
  closeBtn.addEventListener('click', close);

  if (badgeIcon && !options.hideTypeIcon) item.appendChild(badgeIcon);
  if (!options.hideTypeText) item.appendChild(badgeLabel);
  item.appendChild(text);
  item.appendChild(closeBtn);

  host.appendChild(item);
  host.removeAttribute('inert');

  // If using popover API (for Top Layer support), ensure the container is shown.
  if (host.hasAttribute('popover') && typeof (host as any).showPopover === 'function') {
    try {
      if (!host.matches(':popover-open')) {
        (host as any).showPopover();
      }
    } catch (e) {
      // Ignore if showPopover itself fails
    }
  }

  // Auto-close after timeoutMs (optional)
  if (
    typeof options.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
  ) {
    // Add a small countdown indicator (seconds left)
    countdownEl = document.createElement('span');
    countdownEl.className = 'ml-2 text-xs opacity-75';
    countdownEl.setAttribute('aria-live', 'polite');

    // Append countdown next to the message text
    text.appendChild(countdownEl);

    // Visual pause indicator (hidden by default)
    const pauseIndicatorEl = document.createElement('span');
    pauseIndicatorEl.className = 'ml-2 text-xs italic opacity-75 hidden';
    pauseIndicatorEl.textContent = 'Paused';
    text.appendChild(pauseIndicatorEl);

    let endTime = Date.now() + options.timeoutMs;
    const updateCountdown = () => {
      const remainingMs = endTime - Date.now();
      if (remainingMs <= 0) {
        countdownEl!.textContent = '(0s)';
        if (countdownInterval !== null) {
          window.clearInterval(countdownInterval);
          countdownInterval = null;
        }
        if (pauseIndicatorEl) pauseIndicatorEl.classList.add('hidden');
        return;
      }
      const secs = Math.ceil(remainingMs / 1000);
      countdownEl!.textContent = `(${secs}s)`;
    };

    // Pause/resume helpers for hover behavior
    pauseTimers = () => {
      // compute remaining time and clear running timers
      const now = Date.now();
      remainingMs = Math.max(0, endTime - now);
      if (autoCloseTimer !== null) {
        window.clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      if (countdownInterval !== null) {
        window.clearInterval(countdownInterval);
        countdownInterval = null;
      }
      // show visual pause indicator
      if (pauseIndicatorEl) pauseIndicatorEl.classList.remove('hidden');
    };

    resumeTimers = () => {
      if (remainingMs === null || remainingMs <= 0) return;
      endTime = Date.now() + remainingMs;
      // start countdown and auto-close with remainingMs
      updateCountdown();
      countdownInterval = window.setInterval(updateCountdown, 500);
      autoCloseTimer = window.setTimeout(() => {
        close();
      }, remainingMs);
      remainingMs = null;
      if (pauseIndicatorEl) pauseIndicatorEl.classList.add('hidden');
    };

    // Wire pause on hover for this message item
    if (pauseTimers) item.addEventListener('mouseenter', pauseTimers);
    if (resumeTimers) item.addEventListener('mouseleave', resumeTimers);

    // Initial update and interval
    updateCountdown();
    countdownInterval = window.setInterval(updateCountdown, 500);

    autoCloseTimer = window.setTimeout(() => {
      close();
    }, options.timeoutMs);
  }

  return { close };
}

/**
 * Yields control back to the browser to allow for UI updates or user interaction.
 *
 * @param forcePaint - If true, waits for a double requestAnimationFrame to ensure a paint happens.
 *                     Use this before heavy synchronous work to show a progress indicator.
 *                     Default: false (uses setTimeout(0) for speed).
 */
export const yieldToUI = (forcePaint = false) =>
  new Promise((resolve) => {
    if (forcePaint) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(undefined));
      });
    } else {
      setTimeout(resolve, 0);
    }
  });
