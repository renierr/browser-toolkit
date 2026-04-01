import type { ModuleFile } from '../../js/chiptune/types';
import {
  patternHasContent,
  insertPattern,
  removePattern,
  duplicatePattern,
} from './module-factory';

type RenderCallback = () => void;

let dragFrom: number | null = null;
let dragOver: number | null = null;

export function renderPatternOrder(
  container: HTMLElement,
  mod: ModuleFile,
  currentOrderIndex: number,
  onOrderChange: RenderCallback,
  onPatternSelect: (index: number) => void
): void {
  container.innerHTML = '';

  mod.sequence.forEach((patternId, idx) => {
    const item = document.createElement('div');
    const isActive = idx === currentOrderIndex;
    const hasContent = patternHasContent(mod, patternId);

    item.className = `order-item flex items-center justify-between px-1 py-0.5 rounded text-[10px] font-mono ${isActive ? 'active' : 'bg-base-300'} ${dragOver === idx ? 'drag-over' : ''}`;
    item.setAttribute('data-order-idx', String(idx));
    item.setAttribute('draggable', 'true');

    item.innerHTML = `
      <span class="font-bold">${String(patternId).padStart(2, '0')}</span>
      <span class="opacity-40 text-[8px]">${hasContent ? '*' : ''}</span>
    `;

    item.addEventListener('click', () => onPatternSelect(idx));
    item.addEventListener('dblclick', () => {
      duplicatePattern(mod, idx);
      onOrderChange();
    });

    item.addEventListener('dragstart', (e) => {
      dragFrom = idx;
      item.classList.add('dragging');
      (e as DragEvent).dataTransfer?.setData('text/plain', String(idx));
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      dragFrom = null;
      dragOver = null;
      item.classList.remove('dragging');
      renderPatternOrder(container, mod, currentOrderIndex, onOrderChange, onPatternSelect);
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      if (dragFrom !== null && dragFrom !== idx) {
        dragOver = idx;
        renderPatternOrder(container, mod, currentOrderIndex, onOrderChange, onPatternSelect);
      }
    });

    item.addEventListener('dragleave', () => {
      if (dragOver === idx) {
        dragOver = null;
        renderPatternOrder(container, mod, currentOrderIndex, onOrderChange, onPatternSelect);
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom === null || dragFrom === idx) return;

      const fromIdx = dragFrom;
      const toIdx = idx;
      const [moved] = mod.sequence.splice(fromIdx, 1);
      mod.sequence.splice(toIdx, 0, moved);

      dragFrom = null;
      dragOver = null;
      onOrderChange();
    });

    container.appendChild(item);
  });

  const activeItem = container.querySelector('.order-item.active');
  activeItem?.scrollIntoView({ block: 'nearest' });
}

export function handleAddPattern(mod: ModuleFile, index: number): void {
  insertPattern(mod, index);
}

export function handleRemovePattern(mod: ModuleFile, index: number): boolean {
  return removePattern(mod, index);
}

export function handleDuplicatePattern(mod: ModuleFile, index: number): number {
  return duplicatePattern(mod, index);
}

export function resetDragState(): void {
  dragFrom = null;
  dragOver = null;
}
