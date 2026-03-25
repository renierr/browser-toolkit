import type { ArchiveEntry } from './archive-parser';

const ICON_BY_EXT: Record<string, string> = {
  txt: 'file-text',
  md: 'file-text',
  json: 'file-json',
  js: 'file-code',
  ts: 'file-code',
  html: 'file-code',
  css: 'file-code',
  py: 'file-code',
  rs: 'file-code',
  go: 'file-code',
  java: 'file-code',
  cpp: 'file-code',
  c: 'file-code',
  h: 'file-code',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  mp3: 'music',
  wav: 'music',
  ogg: 'music',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  webm: 'video',
  pdf: 'file-text',
  doc: 'file-text',
  docx: 'file-text',
  xls: 'table-2',
  xlsx: 'table-2',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  exe: 'binary',
  dll: 'binary',
  so: 'binary',
  dylib: 'binary',
};

export function getIconForFile(filename: string, isDirectory: boolean): string {
  if (isDirectory) return 'folder';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ICON_BY_EXT[ext] || 'file';
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export type EntryClickHandler = (entry: ArchiveEntry) => void;
export type SelectionChangeHandler = (path: string, selected: boolean) => void;

export function renderEntries(
  entries: ArchiveEntry[],
  container: HTMLElement,
  onEntryClick: EntryClickHandler,
  onSelectionChange: SelectionChangeHandler,
  level = 0
): void {
  for (const entry of entries) {
    const row = document.createElement('tr');
    row.className = 'file-row hover cursor-pointer';
    row.dataset.path = entry.path;
    row.dataset.size = String(entry.size);
    if (entry.isDirectory) row.dataset.directory = 'true';

    const checkbox = document.createElement('td');
    checkbox.className = 'p-0';
    if (!entry.isDirectory) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'checkbox checkbox-sm row-checkbox';
      cb.addEventListener('change', () => {
        onSelectionChange(entry.path, cb.checked);
      });
      checkbox.appendChild(cb);
    }
    row.appendChild(checkbox);

    const iconCell = document.createElement('td');
    const iconDiv = document.createElement('div');
    iconDiv.className = 'flex items-center gap-1';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', getIconForFile(entry.name, entry.isDirectory));
    icon.className = 'entry-icon';
    iconDiv.appendChild(icon);
    if (entry.isDirectory) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'btn btn-xs btn-ghost btn-square expand-btn';
      expandBtn.innerHTML = '<i data-lucide="chevron-right" class="w-3 h-3"></i>';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const childContainer = row.nextElementSibling as HTMLElement;
        if (childContainer?.classList.contains('children-container')) {
          childContainer.classList.toggle('hidden');
        }
      });
      iconDiv.appendChild(expandBtn);
    }
    iconDiv.appendChild(document.createTextNode(entry.name));
    iconCell.appendChild(iconDiv);
    row.appendChild(iconCell);

    const sizeCell = document.createElement('td');
    sizeCell.textContent = formatSize(entry.size);
    sizeCell.className = 'font-mono text-xs';
    row.appendChild(sizeCell);

    const typeCell = document.createElement('td');
    typeCell.textContent = entry.isDirectory
      ? 'Folder'
      : entry.name.split('.').pop()?.toUpperCase() || 'File';
    typeCell.className = 'text-xs opacity-60';
    row.appendChild(typeCell);

    container.appendChild(row);

    if (entry.isDirectory && entry.children) {
      const childContainer = document.createElement('tr');
      childContainer.className = 'children-container hidden';
      const childCell = document.createElement('td');
      childCell.colSpan = 5;
      const childTable = document.createElement('table');
      childTable.className = 'table table-xs w-full';
      childTable.style.marginLeft = `${(level + 1) * 20}px`;
      renderEntries(entry.children, childTable, onEntryClick, onSelectionChange, level + 1);
      childCell.appendChild(childTable);
      childContainer.appendChild(childCell);
      container.appendChild(childContainer);
    }

    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (!entry.isDirectory && entry.rawData) {
        onEntryClick(entry);
      }
    });
  }
}
