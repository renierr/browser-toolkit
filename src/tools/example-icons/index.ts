import { getRegisteredToolIconIds, renderToolIconSvg } from '../../js/tool-icons';

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
      <div class="rounded-xl border border-card bg-card p-3 flex items-center gap-3">
        <div class="shrink-0 text-card-title/90">${svg}</div>
        <div class="min-w-0">
          <div class="text-xs text-card-desc">id</div>
          <div class="text-sm font-semibold text-card-title truncate">${id}</div>
        </div>
      </div>
    `;
    })
    .join('');
}
