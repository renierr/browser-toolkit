import {
  loadUnitsDatabase,
  getUnitsForCategory,
  getUnitDefinition,
  convert,
  formatNumber,
  saveHistory,
  clearHistory,
  exportHistoryAsJSON,
  exportHistoryAsCSV,
  toggleFavorite,
  isFavorite,
  addRecentPair,
  saveLastState,
  loadLastState,
  loadCustomUnits,
  addCustomUnit,
} from './utils/converter';
import { createCalculator } from './utils/calculator';
import {
  renderCategories,
  updateActiveCategory,
  updateUnitLabels,
  renderUnitList,
  updateBatchTable,
  updateFavoriteIcon,
  updateVolatilityWarning,
  renderHistory,
  type UIDOM,
} from './utils/ui';
import type { UnitsDatabase, ConversionRecord, CustomUnit } from './types';

function convertProgrammingValue(
  value: string,
  fromId: string,
  toId: string
): { result: string; formula: string } | null {
  const baseById: Record<string, number> = {
    binary: 2,
    octal: 8,
    decimal: 10,
    hexadecimal: 16,
  };

  const fromBase = baseById[fromId] ?? 10;
  const toBase = baseById[toId] ?? 10;
  const raw = value.trim();

  if (!raw) return null;

  const normalized =
    fromId === 'hexadecimal' && raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw;

  const validators: Record<number, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^[-+]?\d+$/,
    16: /^[0-9a-fA-F]+$/,
  };

  if (!validators[fromBase]?.test(normalized)) {
    return null;
  }

  const decimalValue = parseInt(normalized, fromBase);
  if (!Number.isFinite(decimalValue)) {
    return null;
  }

  const result = decimalValue.toString(toBase).toUpperCase();
  return {
    result,
    formula: `${raw.toUpperCase()} (${fromId}) → ${result} (${toId})`,
  };
}

export default function init(): void | (() => void) {
  const container = document.getElementById('unit-converter');
  if (!container) return;

  let db: UnitsDatabase | null = null;
  let currentCategory = 'length';
  let currentFromUnit = 'meter';
  let currentToUnit = 'kilometer';
  let isScientific = false;
  let historyOpen = false;
  let calcOpen = false;

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
  const volatilityWarning = document.getElementById('uc-volatility-warning');
  const volatilityWarningText = document.getElementById('uc-volatility-warning-text');
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

  const uiDOM: UIDOM = {
    categoryScroll,
    fromUnitLabel,
    fromUnitList,
    fromSearch,
    toUnitLabel,
    toUnitList,
    toSearch,
    result,
    formula,
    volatilityWarning,
    volatilityWarningText,
    favoriteBtn,
    batchBody,
    historyList,
    historySearch,
    customCategory,
  };

  const { handlers: calc } = createCalculator({
    calcCurrent,
    calcLastOp,
    input,
  });

  function performConversion(options?: { saveHistory?: boolean }): void {
    if (!db || !input) return;
    const shouldSaveHistory = options?.saveHistory ?? true;
    const valueStr = input.value.trim();
    if (!valueStr) {
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      if (result) result.textContent = '—';
      if (formula) formula.textContent = 'Enter a value to convert';
      return;
    }

    const fromDef = getUnitDefinition(db, currentCategory, currentFromUnit);
    const toDef = getUnitDefinition(db, currentCategory, currentToUnit);
    if (!fromDef || !toDef) return;
    const pairKey = `${currentCategory}:${currentFromUnit}:${currentToUnit}`;

    updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);

    if (currentCategory === 'programming') {
      const programming = convertProgrammingValue(valueStr, currentFromUnit, currentToUnit);
      if (!programming) {
        if (result) result.textContent = 'Invalid value for selected base';
        return;
      }

      if (result) result.textContent = `${programming.result} ${toDef.symbol}`;
      if (formula) formula.textContent = programming.formula;

      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);

      if (shouldSaveHistory) {
        const record: ConversionRecord = {
          id: Date.now().toString(),
          category: db.categories[currentCategory]?.name || currentCategory,
          fromUnit: fromDef.name,
          toUnit: toDef.name,
          fromValue: valueStr,
          toValue: programming.result,
          formula: programming.formula,
          timestamp: Date.now(),
          isFavorite: isFavorite(pairKey),
        };
        saveHistory(record);
        addRecentPair(`${currentCategory}:${currentFromUnit}:${currentToUnit}`);
        renderHistory(uiDOM, (fromValue) => {
          if (input) input.value = fromValue;
          performConversion({ saveHistory: false });
        });
      }

      if (batchBody) {
        batchBody.innerHTML = '';
      }

      saveLastState({ category: currentCategory, fromUnit: currentFromUnit, toUnit: currentToUnit });
      return;
    }

    const value = parseFloat(valueStr);
    if (isNaN(value)) {
      if (result) result.textContent = 'Invalid number';
      return;
    }


    const { result: converted, formula: formulaStr } = convert(
      value,
      fromDef,
      toDef,
      currentFromUnit,
      currentToUnit
    );

    if (result) result.textContent = `${formatNumber(converted)} ${toDef.symbol}`;
    if (formula) formula.textContent = formulaStr;

    updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);

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
        isFavorite: isFavorite(pairKey),
      };
      saveHistory(record);
      addRecentPair(`${currentCategory}:${currentFromUnit}:${currentToUnit}`);
      renderHistory(uiDOM, (fromValue) => {
        if (input) input.value = fromValue;
        performConversion({ saveHistory: false });
      });
    }

    updateBatchTable(uiDOM, value, fromDef, db, currentCategory, currentFromUnit);

    saveLastState({ category: currentCategory, fromUnit: currentFromUnit, toUnit: currentToUnit });
  }

  function populateCustomCategorySelect(): void {
    if (!db || !customCategory) return;
    const categories = Object.entries(db.categories).map(([key, cat]) => ({
      key,
      name: cat.name,
    }));
    customCategory.innerHTML = categories
      .map((cat) => `<option value="${cat.key}">${cat.name}</option>`)
      .join('');
  }

  function handleCustomUnitSubmit(e: Event): void {
    e.preventDefault();
    if (!db) return;

    const name = customName.value.trim();
    const symbol = customSymbol.value.trim();
    const category = customCategory.value;
    const factor = parseFloat(customFactor.value);

    if (!name || !symbol || !category || isNaN(factor)) return;

    const unit: CustomUnit = {
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

    renderUnitList(
      fromUnitList,
      fromSearch,
      true,
      db,
      currentCategory,
      currentFromUnit,
      currentToUnit
    );
    renderUnitList(
      toUnitList,
      toSearch,
      false,
      db,
      currentCategory,
      currentFromUnit,
      currentToUnit
    );
  }

  async function initialize(): Promise<void> {
    try {
      db = await loadUnitsDatabase();
      renderCategories(uiDOM, db, currentCategory);
      loadCustomUnits();

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

      updateUnitLabels(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      renderHistory(uiDOM, (fromValue) => {
        if (input) input.value = fromValue;
        performConversion({ saveHistory: false });
      });
      populateCustomCategorySelect();
      updateActiveCategory(uiDOM, currentCategory);
    } catch (error) {
      console.error('[UnitConverter] Initialization failed:', error);
      if (result) result.textContent = 'Failed to load units database';
    }
  }

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

      updateActiveCategory(uiDOM, currentCategory);
      updateUnitLabels(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      renderUnitList(
        fromUnitList,
        fromSearch,
        true,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );
      renderUnitList(
        toUnitList,
        toSearch,
        false,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );

      if (input && input.value) {
        performConversion();
      }
    });
  }

  if (fromUnitBtn) {
    fromUnitBtn.addEventListener('click', () => {
      if (!db) return;
      renderUnitList(
        fromUnitList,
        fromSearch,
        true,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );
    });
  }

  if (toUnitBtn) {
    toUnitBtn.addEventListener('click', () => {
      if (!db) return;
      renderUnitList(
        toUnitList,
        toSearch,
        false,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );
    });
  }

  if (fromUnitList) {
    fromUnitList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-unit]') as HTMLElement | null;
      if (!btn || !db) return;
      const unitId = btn.getAttribute('data-unit');
      if (!unitId) return;

      currentFromUnit = unitId;
      updateUnitLabels(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      if (input && input.value) {
        performConversion();
      }
      if (fromUnitBtn) (fromUnitBtn as HTMLElement).blur();
    });
  }

  if (toUnitList) {
    toUnitList.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-unit]') as HTMLElement | null;
      if (!btn || !db) return;
      const unitId = btn.getAttribute('data-unit');
      if (!unitId) return;

      currentToUnit = unitId;
      updateUnitLabels(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      if (input && input.value) {
        performConversion();
      }
      if (toUnitBtn) (toUnitBtn as HTMLElement).blur();
    });
  }

  if (fromSearch) {
    fromSearch.addEventListener('input', () => {
      if (!db) return;
      renderUnitList(
        fromUnitList,
        fromSearch,
        true,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );
    });
  }

  if (toSearch) {
    toSearch.addEventListener('input', () => {
      if (!db) return;
      renderUnitList(
        toUnitList,
        toSearch,
        false,
        db,
        currentCategory,
        currentFromUnit,
        currentToUnit
      );
    });
  }

  if (input) {
    input.addEventListener('input', () => {
      performConversion();
    });
  }

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      if (!db) return;
      const temp = currentFromUnit;
      currentFromUnit = currentToUnit;
      currentToUnit = temp;
      updateUnitLabels(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      updateVolatilityWarning(uiDOM, db, currentCategory, currentFromUnit, currentToUnit);
      if (input && input.value) {
        performConversion();
      }
    });
  }

  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', () => {
      toggleFavorite(`${currentCategory}:${currentFromUnit}:${currentToUnit}`);
      updateFavoriteIcon(uiDOM, currentCategory, currentFromUnit, currentToUnit);
      if (db) {
        renderUnitList(
          fromUnitList,
          fromSearch,
          true,
          db,
          currentCategory,
          currentFromUnit,
          currentToUnit
        );
        renderUnitList(
          toUnitList,
          toSearch,
          false,
          db,
          currentCategory,
          currentFromUnit,
          currentToUnit
        );
      }
      renderHistory(uiDOM, (fromValue) => {
        if (input) input.value = fromValue;
        performConversion({ saveHistory: false });
      });
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
        if (val) calc.handleCalcInput(val);
      });
    });
  }

  if (calcClear) {
    calcClear.addEventListener('click', calc.handleCalcClear);
  }

  if (calcBackspace) {
    calcBackspace.addEventListener('click', calc.handleCalcBackspace);
  }

  if (calcBracket) {
    calcBracket.addEventListener('click', calc.handleCalcBracket);
  }

  if (calcEquals) {
    calcEquals.addEventListener('click', calc.handleCalcEquals);
  }

  if (calcCopy) {
    calcCopy.addEventListener('click', calc.handleCalcCopy);
  }

  if (calcSend) {
    calcSend.addEventListener('click', () => {
      calc.handleCalcSend();
      performConversion();
    });
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
    calcToggle.addEventListener('click', () => {
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
    });
  }

  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      historyOpen = !historyOpen;
      if (historyPanel) {
        historyPanel.classList.toggle('translate-x-full', !historyOpen);
      }
    });
  }

  if (historyClose) {
    historyClose.addEventListener('click', () => {
      historyOpen = !historyOpen;
      if (historyPanel) {
        historyPanel.classList.toggle('translate-x-full', !historyOpen);
      }
    });
  }

  if (historySearch) {
    historySearch.addEventListener('input', () => {
      renderHistory(uiDOM, (fromValue) => {
        if (input) input.value = fromValue;
        performConversion({ saveHistory: false });
      });
    });
  }

  if (historyClear) {
    historyClear.addEventListener('click', () => {
      clearHistory();
      renderHistory(uiDOM, (fromValue) => {
        if (input) input.value = fromValue;
        performConversion({ saveHistory: false });
      });
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

    if (/[0-9]/.test(e.key)) calc.handleCalcInput(e.key);
    if (['+', '-', '*', '/'].includes(e.key)) calc.handleCalcInput(e.key);
    if (e.key === '.') calc.handleCalcInput('.');
    if (e.key === '(' || e.key === ')') calc.handleCalcBracket();
    if (e.key === 'Backspace') calc.handleCalcBackspace();
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calc.handleCalcEquals();
    }
    if (e.key === 'Escape') {
      calc.handleCalcClear();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  initialize();

  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
