import type { StorageInspectorElements } from './types';

export function getElements(): StorageInspectorElements {
  return {
    supportAlert: document.getElementById('support-alert') as HTMLDivElement,
    supportAlertText: document.getElementById('support-alert-text') as HTMLSpanElement,
    quotaValue: document.getElementById('quota-value') as HTMLDivElement,
    usageValue: document.getElementById('usage-value') as HTMLDivElement,
    quotaPercent: document.getElementById('quota-percent') as HTMLSpanElement,
    quotaProgress: document.getElementById('quota-progress') as HTMLProgressElement,
    summaryLocalCount: document.getElementById('summary-local-count') as HTMLDivElement,
    summaryLocalSize: document.getElementById('summary-local-size') as HTMLDivElement,
    summarySessionCount: document.getElementById('summary-session-count') as HTMLDivElement,
    summarySessionSize: document.getElementById('summary-session-size') as HTMLDivElement,
    summaryCacheCount: document.getElementById('summary-cache-count') as HTMLDivElement,
    summaryCacheSize: document.getElementById('summary-cache-size') as HTMLDivElement,
    summaryIdbCount: document.getElementById('summary-idb-count') as HTMLDivElement,
    summaryCookieSize: document.getElementById('summary-cookie-size') as HTMLDivElement,
    localBody: document.getElementById('local-body') as HTMLDivElement,
    sessionBody: document.getElementById('session-body') as HTMLDivElement,
    cacheBody: document.getElementById('cache-body') as HTMLDivElement,
    idbBody: document.getElementById('idb-body') as HTMLDivElement,
    cookieBody: document.getElementById('cookie-body') as HTMLDivElement,
    localEmpty: document.getElementById('local-empty') as HTMLDivElement,
    sessionEmpty: document.getElementById('session-empty') as HTMLDivElement,
    cacheEmpty: document.getElementById('cache-empty') as HTMLDivElement,
    idbEmpty: document.getElementById('idb-empty') as HTMLDivElement,
    cookieEmpty: document.getElementById('cookie-empty') as HTMLDivElement,
    idbUnsupported: document.getElementById('idb-unsupported') as HTMLDivElement,
  };
}
