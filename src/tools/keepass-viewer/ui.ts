import type * as kdbxweb from 'kdbxweb';
import { showMessage } from '@js/ui.ts';
import { html } from '@js/utils.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '\u2014';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getField(
  entry: kdbxweb.KdbxEntry,
  key: string
): string | kdbxweb.ProtectedValue | undefined {
  return entry.fields.get(key);
}

function isProtectedValue(val: unknown): val is kdbxweb.ProtectedValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'getText' in val &&
    typeof (val as { getText?: unknown }).getText === 'function'
  );
}

function getFieldValue(entry: kdbxweb.KdbxEntry, key: string): string {
  const val = getField(entry, key);
  if (val === undefined) return '';
  if (isProtectedValue(val)) return val.getText();
  return String(val);
}

type GroupSelectHandler = (group: kdbxweb.KdbxGroup) => void;
type EntrySelectHandler = (entry: kdbxweb.KdbxEntry) => void;

type EntryListHeaderEls = {
  countEl?: HTMLElement;
  nameEl?: HTMLElement;
};

export function renderGroupTree(
  container: HTMLElement,
  db: kdbxweb.Kdbx,
  onGroupSelect: GroupSelectHandler
): void {
  const defaultGroup = db.getDefaultGroup();
  if (!defaultGroup) {
    container.innerHTML = '<p class="text-sm text-base-content/50 p-2">No groups found</p>';
    container.onclick = null;
    return;
  }

  const groupById = new Map<string, kdbxweb.KdbxGroup>();

  const renderGroup = (group: kdbxweb.KdbxGroup, depth: number): string => {
    groupById.set(group.uuid.id, group);
    const hasChildren = group.groups && group.groups.length > 0;
    const entryCount = group.entries ? group.entries.length : 0;
    const indent = depth * 12;

    let childHtml = '';
    if (hasChildren) {
      childHtml = group.groups.map((child) => renderGroup(child, depth + 1)).join('');
    }

    return html`
      <div class="group-item">
        <button
          class="group-btn flex items-center gap-1 w-full px-2 py-1 text-sm rounded hover:bg-base-200 text-left"
          data-group-id="${group.uuid.id}"
          style="padding-left: ${indent}px"
        >
          <i data-lucide="${hasChildren ? 'folder' : 'folder-open'}" class="w-4 h-4 shrink-0"></i>
          <span class="truncate">${escapeHtml(group.name || 'Unnamed Group')}</span>
          ${entryCount > 0
            ? html`<span class="text-xs text-base-content/50 ml-auto shrink-0">${entryCount}</span>`
            : ''}
        </button>
        ${hasChildren ? html`<div class="group-children">${childHtml}</div>` : ''}
      </div>
    `;
  };

  container.innerHTML = renderGroup(defaultGroup, 0);
  container.onclick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('.group-btn');
    if (!button) return;

    const groupId = button.getAttribute('data-group-id');
    if (!groupId) return;

    const group = groupById.get(groupId);
    if (group) onGroupSelect(group);
  };
}

export function renderEntryList(
  container: HTMLElement,
  group: kdbxweb.KdbxGroup,
  groupName: string,
  onEntrySelect: EntrySelectHandler,
  headerEls?: EntryListHeaderEls
): void {
  const entries = group.entries || [];
  const countEl = headerEls?.countEl;
  const nameEl = headerEls?.nameEl;

  if (countEl) countEl.textContent = String(entries.length);
  if (nameEl) nameEl.textContent = groupName;

  if (entries.length === 0) {
    container.innerHTML =
      '<p class="text-sm text-base-content/50 p-4 text-center">No entries in this group</p>';
    container.onclick = null;
    return;
  }

  const entryById = new Map<string, kdbxweb.KdbxEntry>();
  entries.forEach((entry) => {
    entryById.set(entry.uuid.id, entry);
  });

  container.innerHTML = entries
    .map((entry) => {
      const title = getFieldValue(entry, 'Title') || 'Untitled';
      const username = getFieldValue(entry, 'UserName');
      const url = getFieldValue(entry, 'URL');
      const isExpired =
        entry.times.expires && entry.times.expiryTime && new Date() > entry.times.expiryTime;

      return html`
        <button
          class="entry-btn w-full px-3 py-2 text-left border-b border-base-200 hover:bg-base-200 transition-colors ${isExpired
            ? 'opacity-50'
            : ''}"
          data-entry-uuid="${entry.uuid.id}"
        >
          <div class="flex items-center gap-2">
            <i data-lucide="key" class="w-4 h-4 shrink-0 text-base-content/50"></i>
            <div class="min-w-0 flex-1">
              <div class="font-medium truncate">${escapeHtml(String(title))}</div>
              ${username
                ? html`<div class="text-xs text-base-content/60 truncate">
                    ${escapeHtml(username)}
                  </div>`
                : ''}
              ${url
                ? html`<div class="text-xs text-base-content/40 truncate">
                    ${escapeHtml(String(url))}
                  </div>`
                : ''}
            </div>
          </div>
        </button>
      `;
    })
    .join('');

  container.onclick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('.entry-btn');
    if (!button) return;

    const uuid = button.getAttribute('data-entry-uuid');
    if (!uuid) return;

    const entry = entryById.get(uuid);
    if (entry) onEntrySelect(entry);
  };
}

export function renderEntryDetail(container: HTMLElement, entry: kdbxweb.KdbxEntry): void {
  const fields: { key: string; value: string; protected: boolean }[] = [];
  const standardFields = ['Title', 'UserName', 'Password', 'URL', 'Notes'];
  const fieldLabels: Record<string, string> = {
    Title: 'Title',
    UserName: 'Username',
    Password: 'Password',
    URL: 'URL',
    Notes: 'Notes',
  };

  standardFields.forEach((key) => {
    const val = getField(entry, key);
    if (val === undefined) return;

    const protectedValue = isProtectedValue(val);
    fields.push({
      key: fieldLabels[key] || key,
      value: protectedValue ? val.getText() : String(val),
      protected: protectedValue,
    });
  });

  entry.fields.forEach((val, key) => {
    if (standardFields.includes(key)) return;

    const protectedValue = isProtectedValue(val);
    fields.push({
      key,
      value: protectedValue ? val.getText() : String(val),
      protected: protectedValue,
    });
  });

  const isExpired =
    entry.times.expires && entry.times.expiryTime && new Date() > entry.times.expiryTime;

  container.innerHTML = html`
    <div class="space-y-3">
      ${isExpired
        ? html`<div class="alert alert-warning py-2 text-sm">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i><span>Entry has expired</span>
          </div>`
        : ''}

      <div class="grid gap-2">
        <div class="text-xs text-base-content/50">Created</div>
        <div class="text-sm">${formatDate(entry.times.creationTime)}</div>
      </div>

      <div class="grid gap-2">
        <div class="text-xs text-base-content/50">Modified</div>
        <div class="text-sm">${formatDate(entry.times.lastModTime)}</div>
      </div>

      ${entry.times.expiryTime
        ? html`
            <div class="grid gap-2">
              <div class="text-xs text-base-content/50">Expires</div>
              <div class="text-sm">${formatDate(entry.times.expiryTime)}</div>
            </div>
          `
        : ''}
      ${entry.times.lastAccessTime
        ? html`
            <div class="grid gap-2">
              <div class="text-xs text-base-content/50">Last accessed</div>
              <div class="text-sm">${formatDate(entry.times.lastAccessTime)}</div>
            </div>
          `
        : ''}

      <div class="divider my-2"></div>

      ${fields
        .map(
          (field) => html`
            <div class="field-block">
              <div class="text-xs text-base-content/50 mb-1">${escapeHtml(field.key)}</div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                <div class="min-w-0">
                  ${field.key === 'Password' || field.protected
                    ? html`
                        <input
                          type="password"
                          readonly
                          value="${escapeHtml(field.value)}"
                          class="input input-bordered input-sm w-full min-w-0 font-mono"
                          data-field-value
                        />
                      `
                    : field.key === 'URL'
                      ? html`
                          <div
                            class="w-full min-w-0 rounded-md border border-base-300 px-3 py-2 text-sm"
                          >
                            <a
                              href="${escapeHtml(
                                field.value.startsWith('http')
                                  ? field.value
                                  : 'https://' + field.value
                              )}"
                              target="_blank"
                              rel="noopener noreferrer"
                              class="link link-primary block min-w-0 truncate"
                              >${escapeHtml(field.value)}</a
                            >
                          </div>
                        `
                      : html`
                          <div
                            class="w-full min-w-0 rounded-md border border-base-300 px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap"
                          >${escapeHtml(field.value)}</div>
                        `}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  ${field.key === 'Password' || field.protected
                    ? html`
                        <button
                          class="btn btn-ghost btn-xs btn-square"
                          data-toggle-reveal
                          title="Reveal"
                        >
                          <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                      `
                    : ''}
                  <button
                    class="btn btn-ghost btn-xs btn-square"
                    data-copy
                    data-copy-value="${escapeHtml(field.value)}"
                    title="Copy"
                  >
                    <i data-lucide="copy" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;

  container.onclick = async (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const revealButton = target.closest<HTMLButtonElement>('[data-toggle-reveal]');
    if (revealButton) {
      const input = revealButton.parentElement?.querySelector<HTMLInputElement>('input');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
      return;
    }

    const copyButton = target.closest<HTMLButtonElement>('[data-copy]');
    if (!copyButton) return;

    if (!navigator.clipboard?.writeText) {
      showMessage('Clipboard is not available in this browser.', { type: 'warning' });
      return;
    }

    const copyValue = copyButton.getAttribute('data-copy-value') || '';
    try {
      await navigator.clipboard.writeText(copyValue);
    } catch (error) {
      console.error('[KeePass Viewer] Failed to copy field value', error);
      showMessage('Failed to copy value to clipboard.', { type: 'alert' });
    }
  };
}

export function showPasswordDialog(modal: HTMLDialogElement): void {
  modal.showModal();
}

export function hidePasswordDialog(modal: HTMLDialogElement): void {
  modal.close();
}

export function showPasswordError(
  text: string,
  errorEl: HTMLElement,
  errorTextEl: HTMLElement
): void {
  errorEl.classList.remove('hidden');
  errorTextEl.textContent = text;
}

export function hidePasswordError(errorEl: HTMLElement): void {
  errorEl.classList.add('hidden');
}

export function showPasswordLoading(loadingEl: HTMLElement): void {
  loadingEl.classList.remove('hidden');
}

export function hidePasswordLoading(loadingEl: HTMLElement): void {
  loadingEl.classList.add('hidden');
}

export function togglePasswordVisibility(input: HTMLInputElement, btn: HTMLButtonElement): void {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = isPassword
    ? '<i data-lucide="eye-off" class="w-4 h-4"></i>'
    : '<i data-lucide="eye" class="w-4 h-4"></i>';
}

export function switchMobileTab(
  activeTab: 'groups' | 'entries' | 'details',
  tabs: {
    tabGroups: HTMLButtonElement;
    tabEntries: HTMLButtonElement;
    tabDetails: HTMLButtonElement;
    groupPanel: HTMLElement;
    entryPanel: HTMLElement;
    detailPanel: HTMLElement;
  }
): void {
  const tabBtns = [tabs.tabGroups, tabs.tabEntries, tabs.tabDetails];
  const panels = [tabs.groupPanel, tabs.entryPanel, tabs.detailPanel];

  tabBtns.forEach((btn) => {
    btn.classList.remove('border-primary', 'text-primary');
    btn.classList.add('border-transparent', 'text-base-content/50');
  });
  panels.forEach((panel) => {
    panel.classList.add('hidden');
    panel.style.display = '';
  });

  const activeBtn =
    activeTab === 'groups'
      ? tabs.tabGroups
      : activeTab === 'entries'
        ? tabs.tabEntries
        : tabs.tabDetails;
  activeBtn.classList.remove('border-transparent', 'text-base-content/50');
  activeBtn.classList.add('border-primary', 'text-primary');

  const activePanel =
    activeTab === 'groups'
      ? tabs.groupPanel
      : activeTab === 'entries'
        ? tabs.entryPanel
        : tabs.detailPanel;
  activePanel.classList.remove('hidden');
  activePanel.style.display = 'flex';
}
