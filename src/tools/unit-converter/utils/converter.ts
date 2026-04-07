/**
 * Core conversion engine for Unit Converter Pro.
 * All conversions use factor-based math with special handling for temperature,
 * inverse units (fuel economy), and base conversions (programming).
 */

import type {
  UnitsDatabase,
  CategoryDefinition,
  UnitDefinition,
  ConversionRecord,
  CustomUnit,
  CalculatorResult,
} from '../types';

const STORAGE_KEYS = {
  CUSTOM_UNITS: 'unitconverter:customUnits',
  HISTORY: 'unitconverter:history',
  FAVORITES: 'unitconverter:favorites',
  RECENT: 'unitconverter:recent',
  LAST_STATE: 'unitconverter:lastState',
};

export async function loadUnitsDatabase(): Promise<UnitsDatabase> {
  try {
    const response = await import('../data/units.json');
    return response.default as UnitsDatabase;
  } catch (error) {
    console.error('[UnitConverter] Failed to load units database:', error);
    throw error;
  }
}

export function loadCustomUnits(): CustomUnit[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CUSTOM_UNITS);
    return stored ? (JSON.parse(stored) as CustomUnit[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomUnits(units: CustomUnit[]): void {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_UNITS, JSON.stringify(units));
}

export function addCustomUnit(unit: CustomUnit): void {
  const units = loadCustomUnits();
  units.push(unit);
  saveCustomUnits(units);
}

export function removeCustomUnit(id: string): void {
  const units = loadCustomUnits().filter((u) => u.id !== id);
  saveCustomUnits(units);
}

export function getCategories(db: UnitsDatabase): { key: string; name: string; icon: string }[] {
  return Object.entries(db.categories).map(([key, cat]) => ({
    key,
    name: cat.name,
    icon: cat.icon,
  }));
}

export function getCategory(db: UnitsDatabase, key: string): CategoryDefinition | null {
  return db.categories[key] || null;
}

export function getUnitsForCategory(
  db: UnitsDatabase,
  categoryKey: string,
  includeCustom = true
): { id: string; name: string; symbol: string }[] {
  const category = db.categories[categoryKey];
  if (!category) return [];

  const units = Object.entries(category.units).map(([id, unit]) => ({
    id,
    name: unit.name,
    symbol: unit.symbol,
  }));

  if (includeCustom) {
    const custom = loadCustomUnits()
      .filter((u) => u.category === categoryKey)
      .map((u) => ({ id: u.id, name: `${u.name} (custom)`, symbol: u.symbol }));
    units.push(...custom);
  }

  return units;
}

export function getUnitDefinition(
  db: UnitsDatabase,
  categoryKey: string,
  unitId: string
): UnitDefinition | null {
  const category = db.categories[categoryKey];
  if (!category) return null;

  const unit = category.units[unitId];
  if (unit) return unit;

  const custom = loadCustomUnits().find((u) => u.id === unitId && u.category === categoryKey);
  if (custom) {
    return { name: custom.name, symbol: custom.symbol, toBase: custom.toBase };
  }

  return null;
}

export function convert(
  value: number,
  fromUnit: UnitDefinition,
  toUnit: UnitDefinition,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  if (fromUnit.isTemperature && toUnit.isTemperature) {
    return convertTemperature(value, fromId, toId);
  }

  if (fromUnit.isInverse || toUnit.isInverse) {
    return convertInverse(value, fromUnit, toUnit);
  }

  if (fromUnit.isBase && toUnit.isBase) {
    return convertBase(value, fromId, toId);
  }

  const baseValue = value * fromUnit.toBase;
  const result = baseValue / toUnit.toBase;

  const formula = generateFormula(value, fromUnit.symbol, result, toUnit.symbol);

  return { result, formula };
}

function convertTemperature(
  value: number,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  let celsius: number;

  switch (fromId) {
    case 'celsius':
      celsius = value;
      break;
    case 'fahrenheit':
      celsius = (value - 32) * (5 / 9);
      break;
    case 'kelvin':
      celsius = value - 273.15;
      break;
    case 'rankine':
      celsius = (value - 491.67) * (5 / 9);
      break;
    case 'reaumur':
      celsius = value * 1.25;
      break;
    case 'newton':
      celsius = value * (100 / 33);
      break;
    case 'delisle':
      celsius = 100 - value * (2 / 3);
      break;
    case 'romer':
      celsius = (value - 7.5) * (40 / 21);
      break;
    default:
      celsius = value;
  }

  let result: number;
  let formulaStr: string;

  switch (toId) {
    case 'celsius':
      result = celsius;
      formulaStr = `°C = ${formatNumber(value)}°${fromId.charAt(0).toUpperCase()}`;
      break;
    case 'fahrenheit':
      result = celsius * (9 / 5) + 32;
      formulaStr = `°F = (${formatNumber(celsius)} × 9/5) + 32`;
      break;
    case 'kelvin':
      result = celsius + 273.15;
      formulaStr = `K = ${formatNumber(celsius)} + 273.15`;
      break;
    case 'rankine':
      result = (celsius + 273.15) * (9 / 5);
      formulaStr = `°R = (${formatNumber(celsius)} + 273.15) × 9/5`;
      break;
    case 'reaumur':
      result = celsius * 0.8;
      formulaStr = `°Ré = ${formatNumber(celsius)} × 0.8`;
      break;
    case 'newton':
      result = celsius * (33 / 100);
      formulaStr = `°N = ${formatNumber(celsius)} × 33/100`;
      break;
    case 'delisle':
      result = (100 - celsius) * (3 / 2);
      formulaStr = `°D = (100 - ${formatNumber(celsius)}) × 3/2`;
      break;
    case 'romer':
      result = celsius * (21 / 40) + 7.5;
      formulaStr = `°Rø = ${formatNumber(celsius)} × 21/40 + 7.5`;
      break;
    default:
      result = celsius;
      formulaStr = `${formatNumber(celsius)}`;
  }

  return { result, formula: formulaStr };
}

function convertInverse(
  value: number,
  fromUnit: UnitDefinition,
  toUnit: UnitDefinition
): { result: number; formula: string } {
  let result: number;

  if (fromUnit.isInverse && toUnit.isInverse) {
    result = value;
  } else if (fromUnit.isInverse) {
    const directValue = value === 0 ? 0 : 1 / value;
    const baseValue = directValue * fromUnit.toBase;
    result = baseValue / toUnit.toBase;
    result = result === 0 ? 0 : 1 / result;
  } else {
    const baseValue = value * fromUnit.toBase;
    const directResult = baseValue / toUnit.toBase;
    result = directResult === 0 ? 0 : 1 / directResult;
  }

  const formula = `${formatNumber(value)} ${fromUnit.symbol} → ${formatNumber(result)} ${toUnit.symbol}`;
  return { result, formula };
}

function convertBase(
  value: number,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  const intValue = Math.round(value);
  let decimalValue: number;

  switch (fromId) {
    case 'binary':
      decimalValue = parseInt(intValue.toString(), 2);
      break;
    case 'octal':
      decimalValue = parseInt(intValue.toString(), 8);
      break;
    case 'hexadecimal':
      decimalValue = parseInt(intValue.toString(), 16);
      break;
    default:
      decimalValue = intValue;
  }

  let result: number;
  switch (toId) {
    case 'binary':
      result = parseInt(decimalValue.toString(2), 10);
      break;
    case 'octal':
      result = parseInt(decimalValue.toString(8), 10);
      break;
    case 'hexadecimal':
      result = parseInt(decimalValue.toString(16), 10);
      break;
    default:
      result = decimalValue;
  }

  const formula = `${formatNumber(value)} (${fromId}) → ${formatNumber(result)} (${toId})`;
  return { result, formula };
}

function generateFormula(
  fromValue: number,
  fromSymbol: string,
  toValue: number,
  toSymbol: string
): string {
  return `${formatNumber(fromValue)} ${fromSymbol} = ${formatNumber(toValue)} ${toSymbol}`;
}

export function formatNumber(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 'Error';
  }

  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toLocaleString('en-US');
  }

  if (Math.abs(value) > 1e12 || (Math.abs(value) < 1e-7 && value !== 0)) {
    return value.toExponential(6);
  }

  const formatted = parseFloat(value.toPrecision(10));
  return formatted.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export function evaluateExpression(expression: string): CalculatorResult {
  try {
    let sanitized = expression
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\)\(/g, ')*(')
      .replace(/(?<=\d)\(/g, '*(')
      .replace(/(\d+(?:\.\d+)?|\([^)]*\))%/g, '($1/100)')
      .replace(/\bpow\(/gi, 'Math.pow(')
      .replace(/\^/g, '**')
      .replace(/\bsqrt\(/gi, 'Math.sqrt(')
      .replace(/\bsin\(/gi, 'Math.sin(')
      .replace(/\bcos\(/gi, 'Math.cos(')
      .replace(/\btan\(/gi, 'Math.tan(')
      .replace(/\basin\(/gi, 'Math.asin(')
      .replace(/\bacos\(/gi, 'Math.acos(')
      .replace(/\batan\(/gi, 'Math.atan(')
      .replace(/\basinh\(/gi, 'Math.asinh(')
      .replace(/\bacosh\(/gi, 'Math.acosh(')
      .replace(/\batanh\(/gi, 'Math.atanh(')
      .replace(/\bsinh\(/gi, 'Math.sinh(')
      .replace(/\bcosh\(/gi, 'Math.cosh(')
      .replace(/\btanh\(/gi, 'Math.tanh(')
      .replace(/\bexp\(/gi, 'Math.exp(')
      .replace(/\blog\(/gi, 'Math.log10(')
      .replace(/\bln\(/gi, 'Math.log(')
      .replace(/\babs\(/gi, 'Math.abs(')
      .replace(/\bfloor\(/gi, 'Math.floor(')
      .replace(/\bceil\(/gi, 'Math.ceil(')
      .replace(/\bround\(/gi, 'Math.round(')
      .replace(/\bPI\b/gi, 'Math.PI')
      .replace(/\bE\b/gi, 'Math.E');

    const result = new Function(`return ${sanitized}`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return { expression, result: 'Error', error: 'Invalid calculation' };
    }

    const formattedResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(10));

    return { expression, result: formattedResult };
  } catch {
    return { expression, result: 'Error', error: 'Syntax Error' };
  }
}

export function saveHistory(record: ConversionRecord): void {
  try {
    const history = getHistory();
    history.unshift(record);
    if (history.length > 100) {
      history.pop();
    }
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (error) {
    console.error('[UnitConverter] Failed to save history:', error);
  }
}

export function getHistory(): ConversionRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return stored ? (JSON.parse(stored) as ConversionRecord[]) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

export function searchHistory(query: string): ConversionRecord[] {
  const history = getHistory();
  if (!query.trim()) return history;

  const lowerQuery = query.toLowerCase();
  return history.filter(
    (r) =>
      r.category.toLowerCase().includes(lowerQuery) ||
      r.fromUnit.toLowerCase().includes(lowerQuery) ||
      r.toUnit.toLowerCase().includes(lowerQuery) ||
      r.formula.toLowerCase().includes(lowerQuery)
  );
}

export function exportHistoryAsJSON(): string {
  const history = getHistory();
  return JSON.stringify(history, null, 2);
}

export function exportHistoryAsCSV(): string {
  const history = getHistory();
  if (history.length === 0) return '';

  const headers = ['Date', 'Category', 'From', 'To', 'Value', 'Result', 'Formula'];
  const rows = history.map((r) => [
    new Date(r.timestamp).toISOString(),
    r.category,
    r.fromUnit,
    r.toUnit,
    r.fromValue,
    r.toValue,
    `"${r.formula}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function getFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    const arr = stored ? (JSON.parse(stored) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function toggleFavorite(pair: string): Set<string> {
  const favorites = getFavorites();
  if (favorites.has(pair)) {
    favorites.delete(pair);
  } else {
    favorites.add(pair);
  }
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...favorites]));
  return favorites;
}

export function isFavorite(pair: string): boolean {
  return getFavorites().has(pair);
}

export function getRecentPairs(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECENT);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

export function addRecentPair(pair: string): void {
  const recent = getRecentPairs();
  const filtered = recent.filter((p) => p !== pair);
  filtered.unshift(pair);
  if (filtered.length > 10) {
    filtered.pop();
  }
  localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(filtered));
}

export function saveLastState(state: { category: string; fromUnit: string; toUnit: string }): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_STATE, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function loadLastState(): { category: string; fromUnit: string; toUnit: string } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LAST_STATE);
    return stored
      ? (JSON.parse(stored) as { category: string; fromUnit: string; toUnit: string })
      : null;
  } catch {
    return null;
  }
}

export function generateBatchTable(
  value: number,
  fromUnit: UnitDefinition,
  toUnits: { id: string; unit: UnitDefinition }[]
): { id: string; symbol: string; value: string }[] {
  return toUnits.map(({ id, unit }) => {
    const { result } = convert(value, fromUnit, unit, '', id);
    return {
      id,
      symbol: unit.symbol,
      value: formatNumber(result),
    };
  });
}
