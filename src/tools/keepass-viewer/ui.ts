import type * as kdbxweb from 'kdbxweb';
import { html } from '../../js/utils.ts';

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
  return typeof (val as any)?.getText === 'function';
}

function getFieldValue(entry: kdbxweb.KdbxEntry, key: string): string {
  const val = getField(entry, key);
  if (val === undefined) return '';
  if (isProtectedValue(val)) return val.getText();
  return String(val);
}

type GroupSelectHandler = (group: kdbxweb.KdbxGroup) => void;
type EntrySelectHandler = (entry: kdbxweb.KdbxEntry) => void;

export function renderGroupTree(
  container: HTMLElement,
  db: kdbxweb.Kdbx,
  onGroupSelect: GroupSelectHandler
): void {
  const defaultGroup = db.getDefaultGroup();
  if (!defaultGroup) {
    container.innerHTML = '<p class="text-sm text-base-content/50 p-2">No groups found</p>';
    return;
  }

  const renderGroup = (group: kdbxweb.KdbxGroup, depth: number): string => {
    const hasChildren = group.groups && group.groups.length > 0;
    const entryCount = group.entries ? group.entries.length : 0;
    const indent = depth * 12;

    let childHtml = '';
    if (hasChildren) {
      childHtml = group.groups
        .map((child: kdbxweb.KdbxGroup) => renderGroup(child, depth + 1))
        .join('');
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

  container.querySelectorAll('.group-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupId = btn.getAttribute('data-group-id');
      if (!groupId) return;
      const group = db.getGroup(groupId);
      if (group) onGroupSelect(group);
    });
  });
}

export function renderEntryList(
  container: HTMLElement,
  group: kdbxweb.KdbxGroup,
  groupName: string,
  onEntrySelect: EntrySelectHandler
): void {
  const entries = group.entries || [];
  const countEl = document.getElementById('entry-count');
  const nameEl = document.getElementById('entry-group-name');
  if (countEl) countEl.textContent = String(entries.length);
  if (nameEl) nameEl.textContent = groupName;

  if (entries.length === 0) {
    container.innerHTML =
      '<p class="text-sm text-base-content/50 p-4 text-center">No entries in this group</p>';
    return;
  }

  container.innerHTML = entries
    .map((entry: kdbxweb.KdbxEntry) => {
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

  container.querySelectorAll('.entry-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uuid = btn.getAttribute('data-entry-uuid');
      const entry = entries.find((e: kdbxweb.KdbxEntry) => e.uuid.id === uuid);
      if (entry) onEntrySelect(entry);
    });
  });
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
    if (val !== undefined) {
      const prot = isProtectedValue(val);
      fields.push({
        key: fieldLabels[key] || key,
        value: prot ? val.getText() : String(val),
        protected: prot,
      });
    }
  });

  entry.fields.forEach((val, key) => {
    if (!standardFields.includes(key)) {
      const prot = isProtectedValue(val);
      fields.push({
        key,
        value: prot ? val.getText() : String(val),
        protected: prot,
      });
    }
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
              <div class="flex items-center gap-1">
                ${field.key === 'Password' || field.protected
                  ? html`
                      <input
                        type="password"
                        readonly
                        value="${escapeHtml(field.value)}"
                        class="input input-bordered input-sm flex-1 font-mono"
                        data-field-value
                      />
                      <button
                        class="btn btn-ghost btn-xs btn-square"
                        data-toggle-reveal
                        title="Reveal"
                      >
                        <i data-lucide="eye" class="w-4 h-4"></i>
                      </button>
                    `
                  : field.key === 'URL'
                    ? html`
                        <a
                          href="${escapeHtml(
                            field.value.startsWith('http') ? field.value : 'https://' + field.value
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="link link-primary text-sm flex-1 truncate"
                          >${escapeHtml(field.value)}</a
                        >
                      `
                    : html`
                        <div class="text-sm flex-1 wrap-break-word whitespace-pre-wrap">
                          ${escapeHtml(field.value)}
                        </div>
                      `}
                <button class="btn btn-ghost btn-xs btn-square" data-copy title="Copy">
                  <i data-lucide="copy" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;

  container.querySelectorAll('[data-toggle-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement?.querySelector('input');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const valueEl = btn.parentElement?.querySelector('[data-field-value]');
      if (valueEl && 'value' in valueEl) {
        try {
          await navigator.clipboard.writeText(String((valueEl as HTMLInputElement).value));
        } catch {
          // clipboard not available
        }
      }
    });
  });
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
