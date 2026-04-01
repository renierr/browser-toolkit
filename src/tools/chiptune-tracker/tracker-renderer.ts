import type { ModuleFile } from '../../js/chiptune/types';
import { formatNoteCompact, type TrackerCol } from './note-utils';

type CellClickHandler = (channel: number, row: number, col: TrackerCol) => void;

export function renderTrackerHeader(container: HTMLElement, channels: number): void {
  container.innerHTML = '';

  const tr = document.createElement('tr');
  tr.className = 'text-[9px] bg-base-300';

  const rowTh = document.createElement('th');
  rowTh.className = 'row-num sticky left-0 bg-base-300 z-10';
  rowTh.textContent = '#';
  tr.appendChild(rowTh);

  for (let ch = 0; ch < channels; ch++) {
    if (ch > 0) {
      const sep = document.createElement('th');
      sep.className = 'ch-sep';
      tr.appendChild(sep);
    }

    for (const label of ['Note', 'Ins', 'Vol', 'Eff', 'Prm']) {
      const th = document.createElement('th');
      th.className = 'text-center';
      th.textContent = label;
      tr.appendChild(th);
    }
  }

  container.appendChild(tr);
}

export function renderTrackerGrid(
  tbody: HTMLElement,
  headerEl: HTMLElement,
  mod: ModuleFile,
  patternIdx: number,
  selectedRow: number,
  activeRow: number,
  isPlaying: boolean,
  onCellClick: CellClickHandler
): void {
  tbody.innerHTML = '';
  renderTrackerHeader(headerEl, mod.channels);

  const pattern = mod.patterns[patternIdx];
  if (!pattern) return;

  const frag = document.createDocumentFragment();

  for (let row = 0; row < mod.rowsPerPattern; row++) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-row', String(row));

    if (row % 4 === 0) tr.classList.add('beat-row');
    if (row === activeRow && isPlaying) tr.classList.add('current-row');
    if (row === selectedRow) tr.classList.add('active-row');

    const rowNum = document.createElement('td');
    rowNum.className = 'row-num sticky left-0 bg-base-200 z-10';
    rowNum.textContent = String(row).padStart(2, '0');
    tr.appendChild(rowNum);

    for (let ch = 0; ch < mod.channels; ch++) {
      if (ch > 0) {
        const sep = document.createElement('td');
        sep.className = 'ch-sep';
        tr.appendChild(sep);
      }

      const cell = pattern.rows[row]?.[ch];

      const cols: { type: TrackerCol; text: string; cls: string }[] = [
        {
          type: 'note',
          text: cell?.note === 97 ? '^^^' : cell?.note ? formatNoteCompact(cell.note) : '---',
          cls: cell?.note === 97 ? 'has-off' : cell?.note ? 'has-note' : 'empty-cell',
        },
        {
          type: 'ins',
          text: cell?.instrument ? String(cell.instrument).padStart(2, ' ') : '--',
          cls: cell?.instrument ? '' : 'empty-cell',
        },
        {
          type: 'vol',
          text: cell?.volume ? String(cell.volume).padStart(2, ' ') : '--',
          cls: cell?.volume ? '' : 'empty-cell',
        },
        {
          type: 'effect',
          text: cell?.effect ? cell.effect.toString(16).toUpperCase() : '.',
          cls: cell?.effect ? 'effect-cell' : 'empty-cell',
        },
        {
          type: 'param',
          text: cell?.effectParam
            ? cell.effectParam.toString(16).toUpperCase().padStart(2, '0')
            : '..',
          cls: cell?.effectParam ? 'effect-cell' : 'empty-cell',
        },
      ];

      for (const colDef of cols) {
        const td = document.createElement('td');
        td.className = `tracker-cell ${colDef.type === 'note' ? 'note-cell' : ''} ${colDef.cls}`;
        td.setAttribute('data-channel', String(ch));
        td.setAttribute('data-row', String(row));
        td.setAttribute('data-col', colDef.type);
        td.textContent = colDef.text;
        td.addEventListener('click', () => onCellClick(ch, row, colDef.type));
        tr.appendChild(td);
      }
    }

    frag.appendChild(tr);
  }

  // Spacer row to allow scrolling last rows into center view
  const spacerTr = document.createElement('tr');
  spacerTr.style.height = '300px';
  const spacerTd = document.createElement('td');
  spacerTd.colSpan = 1 + mod.channels * 6 + (mod.channels - 1);
  spacerTr.appendChild(spacerTd);
  frag.appendChild(spacerTr);

  tbody.appendChild(frag);
}

export function highlightSelectedCell(
  selectedChannel: number,
  selectedRow: number,
  selectedCol: TrackerCol
): void {
  document
    .querySelectorAll('.tracker-cell.selected')
    .forEach((c) => c.classList.remove('selected'));
  document
    .querySelectorAll(
      `.tracker-cell[data-channel="${selectedChannel}"][data-row="${selectedRow}"][data-col="${selectedCol}"]`
    )
    .forEach((c) => c.classList.add('selected'));
}

export function highlightActiveRow(row: number): void {
  document
    .querySelectorAll('#tracker-grid tr.current-row')
    .forEach((r) => r.classList.remove('current-row'));
  if (row >= 0) {
    const el = document.querySelector(`#tracker-grid tr[data-row="${row}"]`);
    if (el) el.classList.add('current-row');
  }
}

export function scrollRowIntoView(viewport: HTMLElement | null, row: number, smooth = true): void {
  if (!viewport) return;
  const viewportRect = viewport.getBoundingClientRect();
  const rowEl = document.querySelector(`#tracker-grid tr[data-row="${row}"]`) as HTMLElement;
  if (!rowEl) return;

  const rowRect = rowEl.getBoundingClientRect();
  const containerTop = viewportRect.top + viewport.scrollTop;
  const rowTop = rowRect.top + viewport.scrollTop;
  const centerOffset = viewportRect.height / 2;
  const targetScroll = rowTop - containerTop - centerOffset + rowRect.height / 2;

  viewport.scrollTo({ top: Math.max(0, targetScroll), behavior: smooth ? 'smooth' : 'auto' });
}

export function scrollActiveRowIntoView(viewport: HTMLElement | null, row: number): void {
  if (!viewport) return;
  const viewportRect = viewport.getBoundingClientRect();
  const rowEl = document.querySelector(`#tracker-grid tr[data-row="${row}"]`) as HTMLElement;
  if (!rowEl) return;

  const rowRect = rowEl.getBoundingClientRect();
  const containerTop = viewportRect.top + viewport.scrollTop;
  const rowTop = rowRect.top + viewport.scrollTop;
  const centerOffset = viewportRect.height / 2;
  const targetScroll = rowTop - containerTop - centerOffset + rowRect.height / 2;

  const currentScroll = viewport.scrollTop;
  const diff = Math.abs(targetScroll - currentScroll);
  if (diff > viewportRect.height * 0.3) {
    viewport.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }
}

export function updateEffectInputs(
  mod: ModuleFile,
  patternIdx: number,
  row: number,
  channel: number
): void {
  const pattern = mod.patterns[patternIdx];
  const cell = pattern?.rows[row]?.[channel];
  if (!cell) return;

  const effectInput = document.getElementById('effect-input') as HTMLInputElement;
  const paramInput = document.getElementById('effect-param-input') as HTMLInputElement;
  if (effectInput) effectInput.value = cell.effect ? cell.effect.toString(16).toUpperCase() : '';
  if (paramInput)
    paramInput.value = cell.effectParam
      ? cell.effectParam.toString(16).toUpperCase().padStart(2, '0')
      : '';
}
