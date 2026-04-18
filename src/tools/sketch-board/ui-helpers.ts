import type { SketchDom } from './dom.ts';
import type { SketchElement } from './types.ts';
import { getCropBounds, getRecursiveStats } from './drawing.ts';

/**
 * Confirm if user wants to discard unsaved changes.
 */
export function confirmDiscardIfNeeded(hasUnsavedChanges: boolean): boolean {
  if (!hasUnsavedChanges) return true;
  return window.confirm('Discard current unsaved changes?');
}

/**
 * Populates and shows the information modal with current drawing stats.
 */
export function showInfoModal(
  dom: SketchDom,
  elements: SketchElement[],
  currentBgClass: string
): void {
  const bounds = getCropBounds(elements);
  const stats = getRecursiveStats(elements);

  if (bounds) {
    const dpr = window.devicePixelRatio || 1;
    const physW = Math.round(bounds.w * dpr);
    const physH = Math.round(bounds.h * dpr);
    dom.infoDimensions.innerHTML = `
      <div class="flex flex-col">
        <span>${bounds.w} &times; ${bounds.h} <span class="text-[10px] opacity-50">LOGICAL PX</span></span>
        <span class="text-xs opacity-70">${physW} &times; ${physH} <span class="text-[10px] opacity-50">EXPORT PX (DPI)</span></span>
      </div>
    `;
  } else {
    dom.infoDimensions.textContent = '0 &times; 0 px';
  }

  dom.infoLocation.textContent = bounds
    ? `X: ${Math.round(bounds.x)}, Y: ${Math.round(bounds.y)}`
    : 'X: 0, Y: 0';

  // Element breakdown
  const topLevelCount = elements.length;
  if (stats.groupCount > 0) {
    const gLabel = stats.groupCount === 1 ? 'group' : 'groups';
    dom.infoElements.textContent = `${topLevelCount} (${stats.groupCount} ${gLabel}, ${stats.totalCount} elements)`;
  } else {
    dom.infoElements.textContent = String(topLevelCount);
  }

  // Clean-up background name for display
  const bgDisplay = currentBgClass
    .replace('-bg', '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  dom.infoBackground.textContent = bgDisplay;

  // Render color swatches
  dom.infoColors.innerHTML = '';
  Array.from(stats.colorSet).forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'w-6 h-6 rounded border border-base-300 shadow-sm';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    dom.infoColors.appendChild(swatch);
  });

  dom.infoModal.showModal();
}

