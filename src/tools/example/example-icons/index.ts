// noinspection CssUnresolvedCustomProperty

import { getRegisteredToolIconIds, renderToolIconSvg } from '../../../js/tool-icons.ts';
import { isDarkMode } from '../../../js/theme.ts';

export default function init() {
  const root = document.getElementById('icon-gallery');
  if (!root) return;

  const ids = getRegisteredToolIconIds();

  const countEl = document.getElementById('icon-count');
  if (countEl) {
    countEl.textContent = `${ids.length} icons registered`;
  }

  const initialColor = isDarkMode() ? '#ffffff' : '#000000';
  root.style.setProperty('--icon-color', initialColor);
  const colorEl = document.getElementById('icon-color') as HTMLInputElement | null;
  if (colorEl) {
    colorEl.value = initialColor;
    colorEl.addEventListener('input', () => {
      root.style.setProperty('--icon-color', colorEl.value);
    });
  }

  root.innerHTML = ids
    .map((id) => {
      const svg = renderToolIconSvg(id, 'w-6 h-6');
      return `
      <div class="rounded-xl border p-3 bg-base-100 flex items-center gap-3">
        <div class="shrink-0" style="color: var(--icon-color)">${svg}</div>
        <div class="min-w-0 text-base-content/50">
          <div class="text-sm">${id}</div>
        </div>
      </div>
    `;
    })
    .join('');
}
