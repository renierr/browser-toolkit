/**
 * TypeScript definitions for Unit Converter Pro.
 */

export type UnitCategoryKey = string;

export type UnitDefinition = {
  name: string;
  symbol: string;
  toBase: number;
  isTemperature?: boolean;
  isInverse?: boolean;
  isBase?: boolean;
  note?: string;
  volatile?: boolean;
  volatilityWarning?: string;
};

export type CategoryDefinition = {
  name: string;
  icon: string;
  baseUnit: string;
  units: Record<string, UnitDefinition>;
  volatile?: boolean;
  volatilityWarning?: string;
};

export type UnitsDatabase = {
  categories: Record<UnitCategoryKey, CategoryDefinition>;
};

export type ConversionRecord = {
  id: string;
  category: string;
  fromUnit: string;
  toUnit: string;
  fromValue: string;
  toValue: string;
  formula: string;
  timestamp: number;
  isFavorite: boolean;
};

export type CustomUnit = {
  id: string;
  name: string;
  symbol: string;
  category: UnitCategoryKey;
  toBase: number;
  createdAt: number;
};

export type ConverterState = {
  category: UnitCategoryKey;
  fromUnit: string;
  toUnit: string;
  value: string;
  result: string;
  formula: string;
};

export type FavoritePair = string; // Format: "category:fromUnit:toUnit"


export type FxRatesSnapshot = {
  base: string;
  timestamp: number;
  source: string;
  rates: Record<string, number>;
};
