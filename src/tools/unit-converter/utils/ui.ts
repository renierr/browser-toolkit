import {
  getCategories,
  getUnitsForCategory,
  getUnitDefinition,
  generateBatchTable,
  getHistory,
  searchHistory,
  getFavorites,
  getRecentPairs,
  isFavorite,
} from './converter';
import type { UnitsDatabase, UnitDefinition } from '../types';

export interface UIDOM {
  categoryScroll: HTMLElement | null;
  fromUnitLabel: HTMLElement | null;
  fromUnitList: HTMLElement | null;
  fromSearch: HTMLInputElement | null;
  toUnitLabel: HTMLElement | null;
  toUnitList: HTMLElement | null;
  toSearch: HTMLInputElement | null;
  result: HTMLElement | null;
  formula: HTMLElement | null;
  volatilityWarning: HTMLElement | null;
  volatilityWarningText: HTMLElement | null;
  favoriteBtn: HTMLElement | null;
  batchBody: HTMLElement | null;
  historyList: HTMLElement | null;
  historySearch: HTMLInputElement | null;
  customCategory: HTMLSelectElement | null;
}

export function createIcons(): void {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).lucide) {
    try {
      (
        (window as unknown as Record<string, Record<string, () => void>>).lucide
          .createIcons as () => void
      )();
    } catch {
      // Ignore
    }
  }
}

export function renderCategories(
  dom: Pick<UIDOM, 'categoryScroll'>,
  db: UnitsDatabase,
  currentCategory: string
): void {
  if (!dom.categoryScroll) return;
  const categories = getCategories(db);
  dom.categoryScroll.innerHTML = categories
    .map(
      (cat) => `
    <button
      class="btn btn-sm btn-ghost gap-1 shrink-0 uc-category-btn ${cat.key === currentCategory ? 'btn-active' : ''}"
      data-category="${cat.key}"
      role="tab"
      aria-selected="${cat.key === currentCategory}"
    >
      <i data-lucide="${cat.icon}" class="w-3.5 h-3.5"></i>
      <span class="hidden sm:inline">${cat.name}</span>
    </button>
  `
    )
    .join('');

  createIcons();
}

export function updateActiveCategory(
  dom: Pick<UIDOM, 'categoryScroll'>,
  currentCategory: string
): void {
  if (!dom.categoryScroll) return;
  dom.categoryScroll.querySelectorAll('.uc-category-btn').forEach((btn) => {
    const isActive = btn.getAttribute('data-category') === currentCategory;
    btn.classList.toggle('btn-active', isActive);
    btn.setAttribute('aria-selected', isActive.toString());
  });
}

export function updateUnitLabels(
  dom: Pick<UIDOM, 'fromUnitLabel' | 'toUnitLabel'>,
  db: UnitsDatabase,
  currentCategory: string,
  currentFromUnit: string,
  currentToUnit: string
): void {
  if (!db) return;
  const fromDef = getUnitDefinition(db, currentCategory, currentFromUnit);
  const toDef = getUnitDefinition(db, currentCategory, currentToUnit);
  if (dom.fromUnitLabel && fromDef) {
    dom.fromUnitLabel.textContent = `${fromDef.name} (${fromDef.symbol})`;
  }
  if (dom.toUnitLabel && toDef) {
    dom.toUnitLabel.textContent = `${toDef.name} (${toDef.symbol})`;
  }
}

export function renderUnitList(
  container: HTMLElement | null,
  searchInput: HTMLInputElement | null,
  isFrom: boolean,
  db: UnitsDatabase,
  currentCategory: string,
  currentFromUnit: string,
  currentToUnit: string
): void {
  if (!db || !container) return;
  const units = getUnitsForCategory(db, currentCategory);
  const favorites = getFavorites();
  const recent = getRecentPairs();
  const favoriteFromUnits = new Set<string>();
  const favoriteToUnits = new Set<string>();

  favorites.forEach((favoriteKey) => {
    if (!favoriteKey.startsWith(`${currentCategory}:`)) {
      return;
    }

    const parts = favoriteKey.split(':');
    if (parts.length === 3) {
      const fromId = parts[1];
      const toId = parts[2];
      favoriteFromUnits.add(fromId);
      favoriteToUnits.add(toId);
      return;
    }

    // Backward compatibility with legacy unit-only favorite keys.
    if (parts.length === 2) {
      favoriteFromUnits.add(parts[1]);
      favoriteToUnits.add(parts[1]);
    }
  });

  const favoriteUnits = isFrom ? favoriteFromUnits : favoriteToUnits;

  let html = '';

  if (!searchInput?.value && recent.length > 0) {
    const recentForCategory = recent.filter((p) => p.startsWith(`${currentCategory}:`));
    if (recentForCategory.length > 0) {
      html += '<div class="text-xs text-base-content/50 px-2 py-1 font-semibold">Recent</div>';
      recentForCategory.slice(0, 3).forEach((pair) => {
        const [, fromId, toId] = pair.split(':');
        const fromDef = getUnitDefinition(db, currentCategory, fromId);
        const toDef = getUnitDefinition(db, currentCategory, toId);
        if (fromDef && toDef) {
          const isCurrentFrom = isFrom ? fromId === currentFromUnit : toId === currentToUnit;
          html += `
            <button
              class="w-full text-left px-2 py-1.5 rounded hover:bg-base-200 text-sm flex items-center justify-between ${isCurrentFrom ? 'bg-primary/10' : ''}"
              data-unit="${isFrom ? fromId : toId}"
            >
              <span class="truncate">${isFrom ? fromDef.symbol : toDef.symbol}</span>
              <span class="text-xs text-base-content/50 truncate ml-2">${isFrom ? fromDef.name : toDef.name}</span>
            </button>
          `;
        }
      });
    }
  }

  if (!searchInput?.value) {
    const favUnits = units.filter((u) => favoriteUnits.has(u.id));
    if (favUnits.length > 0) {
      html +=
        '<div class="text-xs text-base-content/50 px-2 py-1 font-semibold mt-1">Favorites</div>';
      favUnits.forEach((unit) => {
        const isCurrent = isFrom ? unit.id === currentFromUnit : unit.id === currentToUnit;
        html += `
          <button
            class="w-full text-left px-2 py-1.5 rounded hover:bg-base-200 text-sm flex items-center gap-2 ${isCurrent ? 'bg-primary/10' : ''}"
            data-unit="${unit.id}"
          >
            <i data-lucide="star" class="w-3 h-3 text-warning shrink-0"></i>
            <span class="truncate">${unit.name}</span>
            <span class="text-xs text-base-content/50 ml-auto">${unit.symbol}</span>
          </button>
        `;
      });
    }
  }

  const searchTerm = searchInput?.value?.toLowerCase() || '';
  const filteredUnits = searchTerm
    ? units.filter(
        (u) =>
          u.name.toLowerCase().includes(searchTerm) ||
          u.symbol.toLowerCase().includes(searchTerm) ||
          u.id.toLowerCase().includes(searchTerm)
      )
    : units;

  if (filteredUnits.length > 0) {
    html +=
      '<div class="text-xs text-base-content/50 px-2 py-1 font-semibold mt-1">All Units</div>';
    filteredUnits.forEach((unit) => {
      const isCurrent = isFrom ? unit.id === currentFromUnit : unit.id === currentToUnit;
      const isFav = favoriteUnits.has(unit.id);
      html += `
        <button
          class="w-full text-left px-2 py-1.5 rounded hover:bg-base-200 text-sm flex items-center gap-2 ${isCurrent ? 'bg-primary/10' : ''}"
          data-unit="${unit.id}"
        >
          ${isFav ? '<i data-lucide="star" class="w-3 h-3 text-warning flex-shrink-0"></i>' : '<span class="w-3 shrink-0"></span>'}
          <span class="truncate">${unit.name}</span>
          <span class="text-xs text-base-content/50 ml-auto">${unit.symbol}</span>
        </button>
      `;
    });
  }

  container.innerHTML = html;
  createIcons();
}

export function updateBatchTable(
  dom: Pick<UIDOM, 'batchBody'>,
  value: number,
  fromDef: UnitDefinition,
  db: UnitsDatabase,
  currentCategory: string,
  currentFromUnit: string
): void {
  if (!db || !dom.batchBody) return;
  const units = getUnitsForCategory(db, currentCategory);
  const toUnits = units
    .filter((u) => u.id !== currentFromUnit)
    .slice(0, 8)
    .map((u) => ({
      id: u.id,
      unit: getUnitDefinition(db, currentCategory, u.id)!,
    }))
    .filter((u) => u.unit);

  const rows = generateBatchTable(value, fromDef, toUnits);
  dom.batchBody.innerHTML = rows
    .map(
      (row) => `
    <tr class="hover">
      <td class="font-medium">${row.symbol}</td>
      <td class="text-right font-mono">${row.value}</td>
    </tr>
  `
    )
    .join('');
}

export function updateFavoriteIcon(
  dom: Pick<UIDOM, 'favoriteBtn'>,
  currentCategory: string,
  currentFromUnit: string,
  currentToUnit: string
): void {
  if (!dom.favoriteBtn) return;
  const pair = `${currentCategory}:${currentFromUnit}:${currentToUnit}`;
  const fav = isFavorite(pair);
  const icon = dom.favoriteBtn.querySelector('.uc-fav-icon');
  if (icon) {
    icon.setAttribute('data-lucide', fav ? 'star' : 'star-off');
    icon.classList.toggle('fill-warning', fav);
    icon.classList.toggle('text-warning', fav);
  }
}

export function renderHistory(
  dom: Pick<UIDOM, 'historyList' | 'historySearch'>,
  onHistoryItemClick: (fromValue: string) => void
): void {
  if (!dom.historyList) return;
  const query = dom.historySearch?.value || '';
  const records = query ? searchHistory(query) : getHistory();

  if (records.length === 0) {
    dom.historyList.innerHTML =
      '<div class="text-center text-base-content/40 py-8">No conversions yet</div>';
    return;
  }

  dom.historyList.innerHTML = records
    .map(
      (record) => `
    <div class="card bg-base-100 p-3 cursor-pointer hover:bg-base-300 transition-colors" data-history-id="${record.id}">
      <div class="flex items-center justify-between">
        <div class="text-xs text-base-content/50">${new Date(record.timestamp).toLocaleString()}</div>
        ${record.isFavorite ? '<i data-lucide="star" class="w-3 h-3 text-warning"></i>' : ''}
      </div>
      <div class="text-sm font-medium truncate mt-1">${record.formula}</div>
      <div class="text-xs text-base-content/60">${record.category}</div>
    </div>
  `
    )
    .join('');

  createIcons();

  dom.historyList.querySelectorAll('[data-history-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-history-id');
      const records = getHistory();
      const record = records.find((r) => r.id === id);
      if (record) {
        onHistoryItemClick(record.fromValue);
      }
    });
  });
}

export function updateVolatilityWarning(
  dom: Pick<UIDOM, 'volatilityWarning' | 'volatilityWarningText'>,
  db: UnitsDatabase,
  currentCategory: string,
  currentFromUnit: string,
  currentToUnit: string
): void {
  if (!dom.volatilityWarning || !dom.volatilityWarningText) return;

  const category = db.categories[currentCategory];
  const fromDef = getUnitDefinition(db, currentCategory, currentFromUnit);
  const toDef = getUnitDefinition(db, currentCategory, currentToUnit);

  const isVolatile =
    Boolean(category?.volatile) || Boolean(fromDef?.volatile) || Boolean(toDef?.volatile);

  if (!isVolatile) {
    dom.volatilityWarning.classList.add('hidden');
    dom.volatilityWarningText.textContent = '';
    return;
  }

  const warningText =
    fromDef?.volatilityWarning ||
    toDef?.volatilityWarning ||
    category?.volatilityWarning ||
    'This conversion uses non-static rates and may be inaccurate.';

  dom.volatilityWarningText.textContent = warningText;
  dom.volatilityWarning.classList.remove('hidden');
}

