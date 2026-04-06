import type { DecodedRecord } from './types';

export const EMPTY_HEX_OUTPUT = 'No parsed output yet.';

type RenderRecordOptions = {
  disableLoadAction?: boolean;
};

export function renderRecords(
  host: HTMLElement,
  records: DecodedRecord[],
  options: RenderRecordOptions = {}
): void {
  host.replaceChildren();

  if (records.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-base-content/60';
    empty.textContent = 'No records read yet.';
    host.appendChild(empty);
    return;
  }

  for (const record of records) {
    const item = document.createElement('div');
    item.className = 'border border-base-300 rounded-lg p-3 bg-base-200 w-full max-w-full min-w-0 overflow-hidden';

    const title = document.createElement('div');
    title.className = 'flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0';
    title.textContent = `#${record.index + 1} ${record.recordType}`;

    const loadButton = document.createElement('button');
    loadButton.className = 'btn btn-xs btn-outline';
    loadButton.type = 'button';
    loadButton.dataset.loadRecordIndex = String(record.index);
    loadButton.textContent = 'Load into editor';
    loadButton.disabled = options.disableLoadAction === true;

    const summary = document.createElement('pre');
    summary.className =
      'text-xs whitespace-pre font-mono overflow-auto w-full max-w-full min-w-0 rounded-md bg-base-100 p-2';
    summary.textContent = JSON.stringify(
      {
        type: record.recordType,
        mediaType: record.mediaType,
        lang: record.lang,
        encoding: record.encoding,
        value: record.value,
        rawHex: record.rawHex,
      },
      null,
      2
    );

    title.appendChild(loadButton);
    item.appendChild(title);
    item.appendChild(summary);
    host.appendChild(item);
  }
}

export function formatRecordsForOutput(records: DecodedRecord[]): string {
  if (records.length === 0) {
    return EMPTY_HEX_OUTPUT;
  }

  return JSON.stringify(
    records.map((record) => ({
      index: record.index,
      type: record.recordType,
      mediaType: record.mediaType,
      lang: record.lang,
      encoding: record.encoding,
      value: record.value,
      rawHex: record.rawHex,
    })),
    null,
    2
  );
}
