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
  FxRatesSnapshot,
} from '../types';

const STORAGE_KEYS = {
  CUSTOM_UNITS: 'unitconverter:customUnits',
  HISTORY: 'unitconverter:history',
  FAVORITES: 'unitconverter:favorites',
  RECENT: 'unitconverter:recent',
  LAST_STATE: 'unitconverter:lastState',
};

const SPEED_OF_LIGHT_MPS = 299792458;
const FX_DB_NAME = 'unitconverter-db';
const FX_DB_VERSION = 1;
const FX_STORE = 'fx-rates';
const FX_CACHE_KEY = 'currency-usd';
const FX_ENDPOINTS = [
  'https://open.er-api.com/v6/latest/USD',
  'https://api.frankfurter.app/latest?from=USD',
];

type FxApiResponse = {
  rates?: Record<string, number>;
};

const FX_UNIT_IDS = [
  'usd',
  'eur',
  'gbp',
  'jpy',
  'cny',
  'inr',
  'aud',
  'cad',
  'chf',
  'krw',
  'sgd',
  'hkd',
  'nok',
  'sek',
  'dkk',
  'nzd',
  'mxn',
  'brl',
  'zar',
  'rub',
  'try',
  'thb',
  'idr',
  'myr',
  'php',
  'pln',
  'czk',
  'huf',
  'ils',
  'clp',
  'aed',
  'sar',
];

function openFxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FX_DB_NAME, FX_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FX_STORE)) {
        db.createObjectStore(FX_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open FX DB'));
  });
}

function readFxSnapshot(db: IDBDatabase): Promise<FxRatesSnapshot | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FX_STORE, 'readonly');
    const store = tx.objectStore(FX_STORE);
    const request = store.get(FX_CACHE_KEY);

    request.onsuccess = () => {
      resolve((request.result as FxRatesSnapshot | undefined) ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read FX cache'));
  });
}

function writeFxSnapshot(db: IDBDatabase, snapshot: FxRatesSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FX_STORE, 'readwrite');
    const store = tx.objectStore(FX_STORE);
    const request = store.put(snapshot, FX_CACHE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to write FX cache'));
  });
}

export async function loadCachedCurrencyRates(): Promise<FxRatesSnapshot | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  try {
    const db = await openFxDb();
    return await readFxSnapshot(db);
  } catch (error) {
    console.error('[UnitConverter] Failed to load cached FX rates', error);
    return null;
  }
}

export async function refreshCurrencyRates(): Promise<FxRatesSnapshot> {
  let payload: FxApiResponse | null = null;
  let usedEndpoint = '';
  let lastError: unknown = null;

  for (const endpoint of FX_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        lastError = new Error(`Rate refresh failed (${response.status})`);
        continue;
      }

      payload = (await response.json()) as FxApiResponse;
      usedEndpoint = endpoint;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!payload) {
    throw new Error(
      `[UnitConverter] Currency refresh failed for all endpoints: ${String(lastError)}`
    );
  }

  const apiRates = payload.rates ?? {};

  const rates: Record<string, number> = { usd: 1 };

  for (const unitId of FX_UNIT_IDS) {
    if (unitId === 'usd') continue;
    const quote = apiRates[unitId.toUpperCase()];
    if (typeof quote === 'number' && quote > 0) {
      // API gives target currency per 1 USD; converter expects USD per unit.
      rates[unitId] = 1 / quote;
    }
  }

  const snapshot: FxRatesSnapshot = {
    base: 'USD',
    source: usedEndpoint,
    timestamp: Date.now(),
    rates,
  };

  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openFxDb();
      await writeFxSnapshot(db, snapshot);
    } catch (error) {
      console.error('[UnitConverter] Failed to persist FX rates', error);
    }
  }

  return snapshot;
}

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

  if (isWavelengthUnit(fromId, fromUnit) || isWavelengthUnit(toId, toUnit)) {
    return convertFrequencyWavelength(value, fromUnit, toUnit, fromId, toId);
  }

  if (fromUnit.isInverse || toUnit.isInverse) {
    return convertInverse(value, fromUnit, toUnit, fromId, toId);
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
  toUnit: UnitDefinition,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  const directBase = toDirectBase(value, fromUnit, fromId);
  const result = fromDirectBase(directBase, toUnit, toId);

  const formula = `${formatNumber(value)} ${fromUnit.symbol} → ${formatNumber(result)} ${toUnit.symbol}`;
  return { result, formula };
}

function convertBase(
  value: number,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  const intValue = Math.trunc(value);
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
      // Numeric return type cannot represent A-F digits; fall back to decimal value.
      result = decimalValue;
      break;
    default:
      result = decimalValue;
  }

  const formula = `${formatNumber(value)} (${fromId}) → ${formatNumber(result)} (${toId})`;
  return { result, formula };
}

function isWavelengthUnit(unitId: string, unit: UnitDefinition): boolean {
  return unitId === 'wavelength_in_metres' || unit.symbol === 'λ';
}

function convertFrequencyWavelength(
  value: number,
  fromUnit: UnitDefinition,
  toUnit: UnitDefinition,
  fromId: string,
  toId: string
): { result: number; formula: string } {
  const fromIsWavelength = isWavelengthUnit(fromId, fromUnit);
  const toIsWavelength = isWavelengthUnit(toId, toUnit);

  if (fromIsWavelength && toIsWavelength) {
    return {
      result: value,
      formula: `${formatNumber(value)} ${fromUnit.symbol} = ${formatNumber(value)} ${toUnit.symbol}`,
    };
  }

  if (fromIsWavelength) {
    if (value === 0) {
      return { result: NaN, formula: 'λ cannot be 0' };
    }

    const frequencyHz = SPEED_OF_LIGHT_MPS / value;
    const result = frequencyHz / toUnit.toBase;
    return {
      result,
      formula: `f = c/λ, c = ${SPEED_OF_LIGHT_MPS.toLocaleString('en-US')} m/s`,
    };
  }

  const frequencyHz = value * fromUnit.toBase;
  if (frequencyHz === 0) {
    return { result: NaN, formula: 'f cannot be 0' };
  }

  const result = SPEED_OF_LIGHT_MPS / frequencyHz;
  return {
    result,
    formula: `λ = c/f, c = ${SPEED_OF_LIGHT_MPS.toLocaleString('en-US')} m/s`,
  };
}

function isLiterPer100Km(unitId: string, unit: UnitDefinition): boolean {
  return unitId === 'liter_per_100km' || unit.symbol === 'L/100km';
}

function toDirectBase(value: number, unit: UnitDefinition, unitId: string): number {
  if (!unit.isInverse) {
    return value * unit.toBase;
  }

  if (isLiterPer100Km(unitId, unit)) {
    return value === 0 ? NaN : 100 / value;
  }

  if (unit.toBase === 0) {
    return NaN;
  }

  const directValue = value === 0 ? NaN : 1 / value;
  return directValue * unit.toBase;
}

function fromDirectBase(value: number, unit: UnitDefinition, unitId: string): number {
  if (!unit.isInverse) {
    return value / unit.toBase;
  }

  if (isLiterPer100Km(unitId, unit)) {
    return value === 0 ? NaN : 100 / value;
  }

  if (unit.toBase === 0) {
    return NaN;
  }

  const directResult = value / unit.toBase;
  return directResult === 0 ? NaN : 1 / directResult;
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
