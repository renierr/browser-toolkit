import { getRegisteredToolIconIds, renderToolIconSvg } from '../../../js/tool-icons.ts';

export default function init() {
  const root = document.getElementById('icon-gallery');
  if (!root) return;

  const ids = getRegisteredToolIconIds();

  const countEl = document.getElementById('icon-count');
  if (countEl) {
    countEl.textContent = `${ids.length} icons registered`;
  }

  root.innerHTML = ids
    .map((id) => {
      const svg = renderToolIconSvg(id, 'w-6 h-6');
      return `
      <div class="rounded-xl border p-3 bg-base-100 flex items-center gap-3">
        <div class="shrink-0 text-muted">${svg}</div>
        <div class="min-w-0">
          <div class="text-xs text-muted">id</div>
          <div class="text-sm font-semibold text-heading truncate">${id}</div>
        </div>
      </div>
    `;
    })
    .join('');
}
