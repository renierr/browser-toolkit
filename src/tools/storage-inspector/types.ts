export type KeyValueEntry = {
  key: string;
  value: string;
  bytes: number;
};

export type CacheEntry = {
  name: string;
  entryCount: number;
};

export type IdbEntry = {
  name: string;
  version?: number;
  objectStoreCount: number;
  totalRecords?: number;
  stores: IdbStoreEntry[];
  inspectError?: string;
};

export type IdbStoreEntry = {
  name: string;
  keyPath: string;
  autoIncrement: boolean;
  recordCount?: number;
};

export type CookieEntry = {
  name: string;
  value: string;
  bytes: number;
};

export type StorageEstimateData = {
  usage: number;
  quota: number;
};

export type IdDatabaseInfo = {
  name?: string;
  version?: number;
};

export type Supports = {
  estimate: boolean;
  caches: boolean;
  indexedDB: boolean;
  indexedDBList: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  cookies: boolean;
};

export type StorageSnapshot = {
  estimateData: StorageEstimateData;
  localEntries: KeyValueEntry[];
  sessionEntries: KeyValueEntry[];
  cacheEntries: CacheEntry[];
  idbEntries: IdbEntry[];
  cookieEntries: CookieEntry[];
};

export type StorageInspectorElements = {
  supportAlert: HTMLDivElement;
  supportAlertText: HTMLSpanElement;
  quotaValue: HTMLDivElement;
  usageValue: HTMLDivElement;
  quotaPercent: HTMLSpanElement;
  quotaProgress: HTMLProgressElement;
  summaryLocalCount: HTMLDivElement;
  summaryLocalSize: HTMLDivElement;
  summarySessionCount: HTMLDivElement;
  summarySessionSize: HTMLDivElement;
  summaryCacheCount: HTMLDivElement;
  summaryCacheSize: HTMLDivElement;
  summaryIdbCount: HTMLDivElement;
  summaryCookieSize: HTMLDivElement;
  localBody: HTMLTableSectionElement;
  sessionBody: HTMLTableSectionElement;
  cacheBody: HTMLTableSectionElement;
  idbBody: HTMLTableSectionElement;
  cookieBody: HTMLTableSectionElement;
  localEmpty: HTMLDivElement;
  sessionEmpty: HTMLDivElement;
  cacheEmpty: HTMLDivElement;
  idbEmpty: HTMLDivElement;
  cookieEmpty: HTMLDivElement;
  idbUnsupported: HTMLDivElement;
};
