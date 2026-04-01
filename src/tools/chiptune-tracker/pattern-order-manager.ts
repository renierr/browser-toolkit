import type { ModuleFile } from '../../js/chiptune/types';
import {
  patternHasContent,
  insertPattern,
  removePattern,
  duplicatePattern,
} from './module-factory';

type RenderCallback = () => void;
export type DragState = { from: number | null; over: number | null };

export function renderPatternOrder(
  container: HTMLElement,
  mod: ModuleFile,
  currentOrderIndex: number,
  dragState: DragState,
  onOrderChange: RenderCallback,
  onPatternSelect: (index: number) => void
): void {
  container.innerHTML = '';

  mod.sequence.forEach((patternId, idx) => {
    const item = document.createElement('div');
    const isActive = idx === currentOrderIndex;
    const hasContent = patternHasContent(mod, patternId);

    item.className = `order-item flex items-center justify-between px-1 py-0.5 rounded text-[10px] font-mono ${isActive ? 'active' : 'bg-base-300'} ${dragState.over === idx ? 'drag-over' : ''}`;
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
      dragState.from = idx;
      item.classList.add('dragging');
      (e as DragEvent).dataTransfer?.setData('text/plain', String(idx));
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      dragState.from = null;
      dragState.over = null;
      item.classList.remove('dragging');
      renderPatternOrder(
        container,
        mod,
        currentOrderIndex,
        dragState,
        onOrderChange,
        onPatternSelect
      );
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      if (dragState.from !== null && dragState.from !== idx) {
        dragState.over = idx;
        renderPatternOrder(
          container,
          mod,
          currentOrderIndex,
          dragState,
          onOrderChange,
          onPatternSelect
        );
      }
    });

    item.addEventListener('dragleave', () => {
      if (dragState.over === idx) {
        dragState.over = null;
        renderPatternOrder(
          container,
          mod,
          currentOrderIndex,
          dragState,
          onOrderChange,
          onPatternSelect
        );
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragState.from === null || dragState.from === idx) return;

      const fromIdx = dragState.from;
      const toIdx = idx;
      const [moved] = mod.sequence.splice(fromIdx, 1);
      mod.sequence.splice(toIdx, 0, moved);

      dragState.from = null;
      dragState.over = null;
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
