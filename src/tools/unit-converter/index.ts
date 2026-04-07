/**
 * Unit Converter Pro - Main entry point.
 * Initializes the converter UI, handles all interactions, and manages state.
 */

import {
  loadUnitsDatabase,
  getCategories,
  getUnitsForCategory,
  getUnitDefinition,
  convert,
  formatNumber,
  evaluateExpression,
  saveHistory,
  getHistory,
  searchHistory,
  clearHistory,
  exportHistoryAsJSON,
  exportHistoryAsCSV,
  getFavorites,
  toggleFavorite,
  isFavorite,
  getRecentPairs,
  addRecentPair,
  saveLastState,
  loadLastState,
  loadCustomUnits,
  addCustomUnit,
  generateBatchTable,
} from './utils/converter';
import type { UnitsDatabase, UnitDefinition, ConversionRecord } from './types';

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const container = document.getElementById('unit-converter');
  if (!container) return;

  let db: UnitsDatabase | null = null;
  let currentCategory = 'length';
  let currentFromUnit = 'meter';
  let currentToUnit = 'kilometer';
  let calcInput = '0';
  let isScientific = false;
  let historyOpen = false;
  let calcOpen = false;

  // DOM references
  const categoryScroll = document.getElementById('uc-category-scroll');
  const fromUnitBtn = document.getElementById('uc-from-unit-btn');
  const fromUnitLabel = document.getElementById('uc-from-unit-label');
  const fromUnitList = document.getElementById('uc-from-unit-list');
  const fromSearch = document.getElementById('uc-from-search') as HTMLInputElement;
  const toUnitBtn = document.getElementById('uc-to-unit-btn');
  const toUnitLabel = document.getElementById('uc-to-unit-label');
  const toUnitList = document.getElementById('uc-to-unit-list');
  const toSearch = document.getElementById('uc-to-search') as HTMLInputElement;
  const input = document.getElementById('uc-input') as HTMLInputElement;
  const result = document.getElementById('uc-result');
  const formula = document.getElementById('uc-formula');
  const swapBtn = document.getElementById('uc-swap');
  const favoriteBtn = document.getElementById('uc-favorite');
  const copyResultBtn = document.getElementById('uc-copy-result');
  const batchBody = document.getElementById('uc-batch-body');
  const calcPanel = document.getElementById('uc-calc-panel');
  const calcDisplay = document.getElementById('uc-calc-display');
  const calcLastOp = document.getElementById('uc-calc-last-op');
  const calcCurrent = document.getElementById('uc-calc-current');
  const calcSciToggle = document.getElementById('uc-calc-sci-toggle');
  const calcSciButtons = document.getElementById('uc-calc-sci-buttons');
  const calcClose = document.getElementById('uc-calc-close');
  const calcToggle = document.getElementById('uc-calc-toggle');
  const calcClear = document.getElementById('uc-calc-clear');
  const calcBackspace = document.getElementById('uc-calc-backspace');
  const calcBracket = document.getElementById('uc-calc-bracket');
  const calcEquals = document.getElementById('uc-calc-equals');
  const calcCopy = document.getElementById('uc-calc-copy');
  const calcSend = document.getElementById('uc-calc-send');
  const historyPanel = document.getElementById('uc-history-panel');
  const historyToggle = document.getElementById('uc-history-toggle');
  const historyClose = document.getElementById('uc-history-close');
  const historySearch = document.getElementById('uc-history-search') as HTMLInputElement;
  const historyList = document.getElementById('uc-history-list');
  const historyClear = document.getElementById('uc-history-clear');
  const historyExportJson = document.getElementById('uc-history-export/json');
  const historyExportCsv = document.getElementById('uc-history-export/csv');
  const customUnitBtn = document.getElementById('uc-custom-unit-btn');
  const customModal = document.getElementById('uc-custom-modal') as HTMLDialogElement;
  const customForm = document.getElementById('uc-custom-form') as HTMLFormElement;
  const customName = document.getElementById('uc-custom-name') as HTMLInputElement;
  const customSymbol = document.getElementById('uc-custom-symbol') as HTMLInputElement;
  const customCategory = document.getElementById('uc-custom-category') as HTMLSelectElement;
  const customFactor = document.getElementById('uc-custom-factor') as HTMLInputElement;

  // Initialize
  async function initialize(): Promise<void> {
    try {
      db = await loadUnitsDatabase();
      renderCategories();
      loadCustomUnits();

      // Restore last state
      const lastState = loadLastState();
      if (lastState && db.categories[lastState.category]) {
        currentCategory = lastState.category;
        const units = getUnitsForCategory(db, currentCategory);
        if (units.find((u) => u.id === lastState.fromUnit)) {
          currentFromUnit = lastState.fromUnit;
        }
        if (units.find((u) => u.id === lastState.toUnit)) {
          currentToUnit = lastState.toUnit;
        }
      } else {
        const units = getUnitsForCategory(db, currentCategory);
        if (units.length >= 2) {
          currentFromUnit = units[0].id;
          currentToUnit = units[1].id;
        }
      }

      updateUnitLabels();
      updateFavoriteIcon();
      renderHistory();
      populateCustomCategorySelect();
      updateActiveCategory();
    } catch (error) {
      console.error('[UnitConverter] Initialization failed:', error);
      if (result) result.textContent = 'Failed to load units database';
    }
  }

  function renderCategories(): void {
    if (!db || !categoryScroll) return;
    const categories = getCategories(db);
    categoryScroll.innerHTML = categories
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

  function updateActiveCategory(): void {
    if (!categoryScroll) return;
    categoryScroll.querySelectorAll('.uc-category-btn').forEach((btn) => {
      const isActive = btn.getAttribute('data-category') === currentCategory;
      btn.classList.toggle('btn-active', isActive);
      btn.setAttribute('aria-selected', isActive.toString());
    });
  }

  function updateUnitLabels(): void {
    if (!db) return;
    const fromDef = getUnitDefinition(db, currentCategory, currentFromUnit);
    const toDef = getUnitDefinition(db, currentCategory, currentToUnit);
    if (fromUnitLabel && fromDef) {
      fromUnitLabel.textContent = `${fromDef.name} (${fromDef.symbol})`;
    }
    if (toUnitLabel && toDef) {
      toUnitLabel.textContent = `${toDef.name} (${toDef.symbol})`;
    }
  }

  function renderUnitList(
    container: HTMLElement | null,
    searchInput: HTMLInputElement | null,
    isFrom: boolean
  ): void {
    if (!db || !container) return;
    const database = db;
    const units = getUnitsForCategory(database, currentCategory);
    const favorites = getFavorites();
    const recent = getRecentPairs();

    let html = '';

    // Recent pairs section
    if (!searchInput?.value && recent.length > 0) {
      const recentForCategory = recent.filter((p) => p.startsWith(`${currentCategory}:`));
      if (recentForCategory.length > 0) {
        html += '<div class="text-xs text-base-content/50 px-2 py-1 font-semibold">Recent</div>';
        recentForCategory.slice(0, 3).forEach((pair) => {
          const [, fromId, toId] = pair.split(':');
          const fromDef = getUnitDefinition(database, currentCategory, fromId);
          const toDef = getUnitDefinition(database, currentCategory, toId);
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

    // Favorites section
    if (!searchInput?.value) {
      const favUnits = units.filter((u) => favorites.has(`${currentCategory}:${u.id}`));
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

    // All units
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
        const isFav = favorites.has(`${currentCategory}:${unit.id}`);
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

  function performConversion(options?: { saveHistory?: boolean }): void {
    if (!db || !input) return;
    const shouldSaveHistory = options?.saveHistory ?? true;
    const valueStr = input.value.trim();
    if (!valueStr) {
      if (result) result.textContent = '—';
      if (formula) formula.textContent = 'Enter a value to convert';
      return;
    }

    const value = parseFloat(valueStr);
    if (isNaN(value)) {
      if (result) result.textContent = 'Invalid number';
      return;
    }

    const fromDef = getUnitDefinition(db, currentCategory, currentFromUnit);
    const toDef = getUnitDefinition(db, currentCategory, currentToUnit);
    if (!fromDef || !toDef) return;

    const { result: converted, formula: formulaStr } = convert(
      value,
      fromDef,
      toDef,
      currentFromUnit,
      currentToUnit
    );

    if (result) result.textContent = `${formatNumber(converted)} ${toDef.symbol}`;
    if (formula) formula.textContent = formulaStr;

    updateFavoriteIcon();

    if (shouldSaveHistory) {
      const record: ConversionRecord = {
        id: Date.now().toString(),
        category: db.categories[currentCategory]?.name || currentCategory,
        fromUnit: fromDef.name,
        toUnit: toDef.name,
        fromValue: valueStr,
        toValue: formatNumber(converted),
        formula: formulaStr,
        timestamp: Date.now(),
        isFavorite: isFavorite(`${currentCategory}:${currentFromUnit}:${currentToUnit}`),
      };
      saveHistory(record);
      addRecentPair(`${currentCategory}:${currentFromUnit}:${currentToUnit}`);
      renderHistory();
    }

    updateBatchTable(value, fromDef);

    saveLastState({ category: currentCategory, fromUnit: currentFromUnit, toUnit: currentToUnit });
  }

  function updateBatchTable(value: number, fromDef: UnitDefinition): void {
    if (!db || !batchBody) return;
    const database = db;
    const units = getUnitsForCategory(database, currentCategory);
    const toUnits = units
      .filter((u) => u.id !== currentFromUnit)
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        unit: getUnitDefinition(database, currentCategory, u.id)!,
      }))
      .filter((u) => u.unit);

    const rows = generateBatchTable(value, fromDef, toUnits);
    batchBody.innerHTML = rows
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

  function updateFavoriteIcon(): void {
    if (!favoriteBtn) return;
    const pair = `${currentCategory}:${currentFromUnit}:${currentToUnit}`;
    const fav = isFavorite(pair);
    const icon = favoriteBtn.querySelector('.uc-fav-icon');
    if (icon) {
      icon.setAttribute('data-lucide', fav ? 'star' : 'star-off');
      icon.classList.toggle('fill-warning', fav);
      icon.classList.toggle('text-warning', fav);
    }
  }

  function renderHistory(): void {
    if (!historyList) return;
    const query = historySearch?.value || '';
    const records = query ? searchHistory(query) : getHistory();

    if (records.length === 0) {
      historyList.innerHTML =
        '<div class="text-center text-base-content/40 py-8">No conversions yet</div>';
      return;
    }

    historyList.innerHTML = records
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

    historyList.querySelectorAll('[data-history-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-history-id');
        const records = getHistory();
        const record = records.find((r) => r.id === id);
        if (record) {
          if (input) input.value = record.fromValue;
          performConversion({ saveHistory: false });
        }
      });
    });
  }

  function toggleHistory(): void {
    historyOpen = !historyOpen;
    if (historyPanel) {
      historyPanel.classList.toggle('translate-x-full', !historyOpen);
    }
  }

  function toggleCalc(): void {
    calcOpen = !calcOpen;
    if (calcPanel) {
      calcPanel.classList.toggle('hidden', !calcOpen);
      calcPanel.classList.toggle('lg:block', true);
      if (calcOpen) {
        calcPanel.classList.remove('hidden');
      } else if (window.innerWidth < 1024) {
        calcPanel.classList.add('hidden');
      }
    }
  }

  function updateCalcDisplay(): void {
    if (calcCurrent) calcCurrent.textContent = calcInput;
  }

  function handleCalcInput(val: string): void {
    if (calcInput === 'Error') {
      calcInput = '0';
      if (calcLastOp) calcLastOp.textContent = '';
    }

    const isOperator = (s: string): boolean => /[+\-*/^]/.test(s);

    if (calcInput === '0') {
      if (/[0-9.]/.test(val)) {
        calcInput = val;
        updateCalcDisplay();
        return;
      }
      if (/\w+\($/.test(val) || /^PI$/.test(val) || /^E$/.test(val) || val === '(') {
        calcInput = val;
        updateCalcDisplay();
        return;
      }
      calcInput = '0' + val;
      updateCalcDisplay();
      return;
    }

    const lastChar = calcInput[calcInput.length - 1];
    if (isOperator(lastChar) && isOperator(val)) {
      calcInput = calcInput.slice(0, -1) + val;
      updateCalcDisplay();
      return;
    }

    calcInput += val;
    updateCalcDisplay();
  }

  function handleCalcBackspace(): void {
    if (calcInput.length > 1) {
      calcInput = calcInput.slice(0, -1);
    } else {
      calcInput = '0';
    }
    updateCalcDisplay();
  }

  function handleCalcBracket(): void {
    if (calcInput === '0') {
      calcInput = '(';
      updateCalcDisplay();
      return;
    }

    const lastChar = calcInput[calcInput.length - 1];
    if (lastChar === '(' || lastChar === ')') {
      calcInput += '(';
    } else {
      const openCount = (calcInput.match(/\(/g) || []).length;
      const closeCount = (calcInput.match(/\)/g) || []).length;
      calcInput += openCount > closeCount ? ')' : '(';
    }
    updateCalcDisplay();
  }

  function handleCalcEquals(): void {
    if (calcInput === '0' && calcLastOp?.textContent === '') return;

    let balancedInput = calcInput;
    const opens = (balancedInput.match(/\(/g) || []).length;
    const closes = (balancedInput.match(/\)/g) || []).length;
    if (opens > closes) {
      balancedInput = balancedInput + ')'.repeat(opens - closes);
    }

    const sanitizedInput = balancedInput.replace(/[+\-*/^]$/, '');
    const calculation = evaluateExpression(sanitizedInput);

    if (calculation.error) {
      if (calcLastOp) calcLastOp.textContent = 'Error';
      calcInput = calculation.result.toString();
    } else {
      if (calcLastOp) calcLastOp.textContent = `${calculation.expression} =`;
      calcInput = calculation.result.toString();
    }
    updateCalcDisplay();
  }

  function handleCalcCopy(): void {
    if (navigator.clipboard && calcInput) {
      navigator.clipboard.writeText(calcInput).catch((err) => {
        console.error('[UnitConverter] Failed to copy:', err);
      });
    }
  }

  function handleCalcSend(): void {
    if (input && calcInput && calcInput !== '0' && calcInput !== 'Error') {
      input.value = calcInput;
      performConversion();
    }
  }

  function handleCustomUnitSubmit(e: Event): void {
    e.preventDefault();
    if (!db) return;

    const name = customName.value.trim();
    const symbol = customSymbol.value.trim();
    const category = customCategory.value;
    const factor = parseFloat(customFactor.value);

    if (!name || !symbol || !category || isNaN(factor)) return;

    const unit: import('./types').CustomUnit = {
      id: `custom_${Date.now()}`,
      name,
      symbol,
      category,
      toBase: factor,
      createdAt: Date.now(),
    };

    addCustomUnit(unit);
    customModal.close();
    customForm.reset();

    renderUnitList(fromUnitList, fromSearch, true);
    renderUnitList(toUnitList, toSearch, false);
  }

  function populateCustomCategorySelect(): void {
    if (!db || !customCategory) return;
    const categories = getCategories(db);
    customCategory.innerHTML = categories
      .map((cat) => `<option value="${cat.key}">${cat.name}</option>`)
      .join('');
  }

  function createIcons(): void {
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

  // Event listeners
  if (categoryScroll) {
    categoryScroll.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.uc-category-btn') as HTMLElement | null;
      if (!btn || !db) return;
      const category = btn.getAttribute('data-category');
      if (!category) return;

      currentCategory = category;
      const units = getUnitsForCategory(db, currentCategory);
      if (units.length >= 2) {
        currentFromUnit = units[0].id;
        currentToUnit = units[1].id;
      }

      updateActiveCategory();
      updateUnitLabels();
      updateFavoriteIcon();
      renderUnitList(fromUnitList, fromSearch, true);
      renderUnitList(toUnitList, toSearch, false);

      if (input && input.value) {
        performConversion();
      }
    });
  }

  if (fromUnitBtn) {
    fromUnitBtn.addEventListener('click', () => {
      renderUnitList(fromUnitList, fromSearch, true);
    });
  }

  if (toUnitBtn) {
    toUnitBtn.addEventListener('click', () => {
      renderUnitList(toUnitList, toSearch, true);
    });
  }

  if (fromUnitList) {
    fromUnitList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-unit]') as HTMLElement | null;
      if (!btn) return;
      const unitId = btn.getAttribute('data-unit');
      if (!unitId) return;

      currentFromUnit = unitId;
      updateUnitLabels();
      updateFavoriteIcon();
      if (input && input.value) {
        performConversion();
      }
      if (fromUnitBtn) (fromUnitBtn as HTMLElement).blur();
    });
  }

  if (toUnitList) {
    toUnitList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-unit]') as HTMLElement | null;
      if (!btn) return;
      const unitId = btn.getAttribute('data-unit');
      if (!unitId) return;

      currentToUnit = unitId;
      updateUnitLabels();
      updateFavoriteIcon();
      if (input && input.value) {
        performConversion();
      }
      if (toUnitBtn) (toUnitBtn as HTMLElement).blur();
    });
  }

  if (fromSearch) {
    fromSearch.addEventListener('input', () => {
      renderUnitList(fromUnitList, fromSearch, true);
    });
  }

  if (toSearch) {
    toSearch.addEventListener('input', () => {
      renderUnitList(toUnitList, toSearch, true);
    });
  }

  if (input) {
    input.addEventListener('input', () => {
      performConversion();
    });
  }

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const temp = currentFromUnit;
      currentFromUnit = currentToUnit;
      currentToUnit = temp;
      updateUnitLabels();
      updateFavoriteIcon();
      if (input && input.value) {
        performConversion();
      }
    });
  }

  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', () => {
      const pair = `${currentCategory}:${currentFromUnit}:${currentToUnit}`;
      toggleFavorite(pair);
      updateFavoriteIcon();
      renderHistory();
    });
  }

  if (copyResultBtn) {
    copyResultBtn.addEventListener('click', () => {
      if (result && navigator.clipboard) {
        navigator.clipboard.writeText(result.textContent || '').catch((err) => {
          console.error('[UnitConverter] Failed to copy:', err);
        });
      }
    });
  }

  if (calcPanel) {
    calcPanel.querySelectorAll('[data-calc-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-calc-val');
        if (val) handleCalcInput(val);
      });
    });
  }

  if (calcClear) {
    calcClear.addEventListener('click', () => {
      calcInput = '0';
      if (calcLastOp) calcLastOp.textContent = '';
      updateCalcDisplay();
    });
  }

  if (calcBackspace) {
    calcBackspace.addEventListener('click', handleCalcBackspace);
  }

  if (calcBracket) {
    calcBracket.addEventListener('click', handleCalcBracket);
  }

  if (calcEquals) {
    calcEquals.addEventListener('click', handleCalcEquals);
  }

  if (calcCopy) {
    calcCopy.addEventListener('click', handleCalcCopy);
  }

  if (calcSend) {
    calcSend.addEventListener('click', handleCalcSend);
  }

  if (calcSciToggle) {
    calcSciToggle.addEventListener('click', () => {
      isScientific = !isScientific;
      if (calcSciButtons) {
        calcSciButtons.classList.toggle('hidden', !isScientific);
      }
    });
  }

  if (calcClose) {
    calcClose.addEventListener('click', () => {
      calcOpen = false;
      if (calcPanel) {
        calcPanel.classList.add('hidden');
      }
    });
  }

  if (calcToggle) {
    calcToggle.addEventListener('click', toggleCalc);
  }

  if (historyToggle) {
    historyToggle.addEventListener('click', toggleHistory);
  }

  if (historyClose) {
    historyClose.addEventListener('click', toggleHistory);
  }

  if (historySearch) {
    historySearch.addEventListener('input', renderHistory);
  }

  if (historyClear) {
    historyClear.addEventListener('click', () => {
      clearHistory();
      renderHistory();
    });
  }

  if (historyExportJson) {
    historyExportJson.addEventListener('click', () => {
      const json = exportHistoryAsJSON();
      if (json && navigator.clipboard) {
        navigator.clipboard.writeText(json).catch((err) => {
          console.error('[UnitConverter] Failed to copy JSON:', err);
        });
      }
    });
  }

  if (historyExportCsv) {
    historyExportCsv.addEventListener('click', () => {
      const csv = exportHistoryAsCSV();
      if (csv && navigator.clipboard) {
        navigator.clipboard.writeText(csv).catch((err) => {
          console.error('[UnitConverter] Failed to copy CSV:', err);
        });
      }
    });
  }

  if (customUnitBtn) {
    customUnitBtn.addEventListener('click', () => {
      if (customModal) customModal.showModal();
    });
  }

  if (customForm) {
    customForm.addEventListener('submit', handleCustomUnitSubmit);
  }

  // Global keyboard support for calculator
  const onKeyDown = (e: KeyboardEvent): void => {
    if (
      document.activeElement === input ||
      document.activeElement === calcDisplay ||
      document.activeElement === historySearch ||
      document.activeElement === fromSearch ||
      document.activeElement === toSearch
    ) {
      return;
    }

    if (/[0-9]/.test(e.key)) handleCalcInput(e.key);
    if (['+', '-', '*', '/'].includes(e.key)) handleCalcInput(e.key);
    if (e.key === '.') handleCalcInput('.');
    if (e.key === '(' || e.key === ')') handleCalcBracket();
    if (e.key === 'Backspace') handleCalcBackspace();
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      handleCalcEquals();
    }
    if (e.key === 'Escape') {
      calcInput = '0';
      if (calcLastOp) calcLastOp.textContent = '';
      updateCalcDisplay();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  // Initialize
  initialize();

  // Cleanup
  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
