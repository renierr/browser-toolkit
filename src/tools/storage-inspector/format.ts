import { formatBytes as sharedFormatBytes } from '../../js/format';

export function roughBytes(value: string): number {
  return value.length * 2;
}

export function sumBytes(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

export function formatBytes(bytes: number): string {
  return sharedFormatBytes(bytes);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function encodeData(value: string): string {
  return encodeURIComponent(value);
}

export function decodeData(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}
