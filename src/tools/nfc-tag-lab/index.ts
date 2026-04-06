import { showMessage } from '@js/ui';
import { copyTextToClipboard } from '@js/utils';
import {
  areRecordsEqual,
  buildEditorRecord,
  decodedRecordToEditorValues,
  getTemplateValues,
  normalizeRecord,
} from './editor-records';
import { decodeWebNfcRecord, encodeSingleRecordNdefHex, parseNdefMessageHex } from './ndef-codec';
import { EMPTY_HEX_OUTPUT, formatRecordsForOutput, renderRecords } from './render';
import { classifyScannedNfcTarget, getDefaultScanProfile } from './scan-profile';
import type {
  DecodedRecord,
  EditorValues,
  NfcScanProfile,
  NDEFReaderLike,
  NDEFReaderWindow,
  NDEFReadingEventLike,
  NormalizedRecord,
} from './types';

type DomElements = {
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  writeButton: HTMLButtonElement;
  clearSessionButton: HTMLButtonElement;
  copyHexButton: HTMLButtonElement;
  scanState: HTMLDivElement;
  unsupportedBanner: HTMLDivElement;
  lastScan: HTMLParagraphElement;
  editorLockNote: HTMLDivElement;
  templateSelect: HTMLSelectElement;
  recordTypeSelect: HTMLSelectElement;
  payloadInput: HTMLTextAreaElement;
  payloadHint: HTMLSpanElement;
  urlInput: HTMLInputElement;
  langInput: HTMLInputElement;
  mimeTypeInput: HTMLInputElement;
  urlField: HTMLDivElement;
  langField: HTMLDivElement;
  mimeTypeField: HTMLDivElement;
  serialLabel: HTMLDivElement;
  recordCountLabel: HTMLDivElement;
  scanCategoryLabel: HTMLDivElement;
  scanTechnologyLabel: HTMLDivElement;
  scanCapabilitiesLabel: HTMLDivElement;
  recordList: HTMLDivElement;
  hexInput: HTMLTextAreaElement;
  parseHexButton: HTMLButtonElement;
  clearHexButton: HTMLButtonElement;
  hexOutput: HTMLPreElement;
};

function getElements(): DomElements | null {
  const startButton = document.getElementById('nfc-start-scan') as HTMLButtonElement | null;
  const stopButton = document.getElementById('nfc-stop-scan') as HTMLButtonElement | null;
  const writeButton = document.getElementById('nfc-write-tag') as HTMLButtonElement | null;
  const clearSessionButton = document.getElementById('nfc-clear-session') as HTMLButtonElement | null;
  const copyHexButton = document.getElementById('nfc-copy-hex') as HTMLButtonElement | null;
  const scanState = document.getElementById('nfc-scan-state') as HTMLDivElement | null;
  const unsupportedBanner = document.getElementById('nfc-unsupported') as HTMLDivElement | null;
  const lastScan = document.getElementById('nfc-last-scan') as HTMLParagraphElement | null;
  const editorLockNote = document.getElementById('nfc-editor-lock-note') as HTMLDivElement | null;
  const templateSelect = document.getElementById('nfc-template') as HTMLSelectElement | null;
  const recordTypeSelect = document.getElementById('nfc-record-type') as HTMLSelectElement | null;
  const payloadInput = document.getElementById('nfc-payload') as HTMLTextAreaElement | null;
  const payloadHint = document.getElementById('nfc-payload-hint') as HTMLSpanElement | null;
  const urlInput = document.getElementById('nfc-url') as HTMLInputElement | null;
  const langInput = document.getElementById('nfc-lang') as HTMLInputElement | null;
  const mimeTypeInput = document.getElementById('nfc-mime-type') as HTMLInputElement | null;
  const urlField = document.getElementById('nfc-url-field') as HTMLDivElement | null;
  const langField = document.getElementById('nfc-lang-field') as HTMLDivElement | null;
  const mimeTypeField = document.getElementById('nfc-mime-type-field') as HTMLDivElement | null;
  const serialLabel = document.getElementById('nfc-tag-serial') as HTMLDivElement | null;
  const recordCountLabel = document.getElementById('nfc-record-count') as HTMLDivElement | null;
  const scanCategoryLabel = document.getElementById('nfc-scan-category') as HTMLDivElement | null;
  const scanTechnologyLabel = document.getElementById('nfc-scan-technology') as HTMLDivElement | null;
  const scanCapabilitiesLabel = document.getElementById('nfc-scan-capabilities') as HTMLDivElement | null;
  const recordList = document.getElementById('nfc-record-list') as HTMLDivElement | null;
  const hexInput = document.getElementById('nfc-hex-input') as HTMLTextAreaElement | null;
  const parseHexButton = document.getElementById('nfc-parse-hex') as HTMLButtonElement | null;
  const clearHexButton = document.getElementById('nfc-clear-hex') as HTMLButtonElement | null;
  const hexOutput = document.getElementById('nfc-hex-output') as HTMLPreElement | null;

  if (
    !startButton ||
    !stopButton ||
    !writeButton ||
    !clearSessionButton ||
    !copyHexButton ||
    !scanState ||
    !unsupportedBanner ||
    !lastScan ||
    !editorLockNote ||
    !templateSelect ||
    !recordTypeSelect ||
    !payloadInput ||
    !payloadHint ||
    !urlInput ||
    !langInput ||
    !mimeTypeInput ||
    !urlField ||
    !langField ||
    !mimeTypeField ||
    !serialLabel ||
    !recordCountLabel ||
    !scanCategoryLabel ||
    !scanTechnologyLabel ||
    !scanCapabilitiesLabel ||
    !recordList ||
    !hexInput ||
    !parseHexButton ||
    !clearHexButton ||
    !hexOutput
  ) {
    return null;
  }

  return {
    startButton,
    stopButton,
    writeButton,
    clearSessionButton,
    copyHexButton,
    scanState,
    unsupportedBanner,
    lastScan,
    editorLockNote,
    templateSelect,
    recordTypeSelect,
    payloadInput,
    payloadHint,
    urlInput,
    langInput,
    mimeTypeInput,
    urlField,
    langField,
    mimeTypeField,
    serialLabel,
    recordCountLabel,
    scanCategoryLabel,
    scanTechnologyLabel,
    scanCapabilitiesLabel,
    recordList,
    hexInput,
    parseHexButton,
    clearHexButton,
    hexOutput,
  };
}

function setScanState(elements: DomElements, text: string, scanning: boolean): void {
  elements.scanState.textContent = text;
  elements.scanState.classList.toggle('badge-success', scanning);
  elements.scanState.classList.toggle('badge-outline', !scanning);
  elements.startButton.classList.toggle('hidden', scanning);
  elements.stopButton.classList.toggle('hidden', !scanning);
}

function syncVisibleRecordFields(elements: DomElements, allowEditor: boolean): void {
  const currentType = elements.recordTypeSelect.value;
  const isUrl = currentType === 'url';
  const isText = currentType === 'text';
  const isMime = currentType === 'mime';

  elements.urlField.classList.toggle('hidden', !isUrl);
  elements.langField.classList.toggle('hidden', !isText);
  elements.mimeTypeField.classList.toggle('hidden', !isMime);

  // Disable controls that are not used by the selected record type.
  elements.templateSelect.disabled = !allowEditor;
  elements.recordTypeSelect.disabled = !allowEditor;
  elements.urlInput.disabled = !allowEditor || !isUrl;
  elements.langInput.disabled = !allowEditor || !isText;
  elements.mimeTypeInput.disabled = !allowEditor || !isMime;
  elements.payloadInput.disabled = !allowEditor || isUrl;
  elements.payloadInput.classList.toggle('opacity-60', !allowEditor || isUrl);
  elements.copyHexButton.disabled = !allowEditor;
  elements.payloadHint.textContent = isUrl
    ? 'Not used for URI records. The URI field is encoded instead.'
    : 'Used when creating Text and MIME records.';
}

function setScanProfileDetails(elements: DomElements, profile: NfcScanProfile): void {
  elements.scanCategoryLabel.textContent = `${profile.categoryLabel} (${profile.confidence})`;
  elements.scanTechnologyLabel.textContent = profile.technology;
  elements.scanCapabilitiesLabel.textContent = `${profile.reason} Rule: ${profile.matchedRule}.`;
}

function getEditorValues(elements: DomElements): EditorValues {
  const recordType = elements.recordTypeSelect.value;
  return {
    recordType: recordType === 'url' || recordType === 'mime' ? recordType : 'text',
    payload: elements.payloadInput.value,
    lang: elements.langInput.value,
    url: elements.urlInput.value,
    mimeType: elements.mimeTypeInput.value,
  };
}

function setEditorValues(elements: DomElements, values: EditorValues, allowEditor = true): void {
  elements.recordTypeSelect.value = values.recordType;
  elements.payloadInput.value = values.payload;
  elements.langInput.value = values.lang;
  elements.urlInput.value = values.url;
  elements.mimeTypeInput.value = values.mimeType;
  syncVisibleRecordFields(elements, allowEditor);
}

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const elements = getElements();
  if (!elements) {
    console.error('[NFCTagLab] Required DOM elements were not found.');
    return;
  }

  const ndefReaderConstructor = (window as NDEFReaderWindow).NDEFReader;
  const hasWebNfc = typeof ndefReaderConstructor === 'function';

  const state = {
    reader: null as NDEFReaderLike | null,
    scanAbortController: null as AbortController | null,
    isScanning: false,
    lastReadRecords: [] as DecodedRecord[],
    expectedVerifyRecords: null as NormalizedRecord[] | null,
    scanProfile: getDefaultScanProfile(),
  };

  const canUseWebNfc = hasWebNfc;

  const updateActionState = (): void => {
    const editorEnabled = state.scanProfile.allowsEditor;
    syncVisibleRecordFields(elements, editorEnabled);
    elements.editorLockNote.classList.toggle('hidden', editorEnabled);
    elements.writeButton.disabled = !canUseWebNfc || !state.scanProfile.allowsWrite;
  };

  const applyScanProfile = (profile: NfcScanProfile): void => {
    state.scanProfile = profile;
    setScanProfileDetails(elements, profile);
    updateActionState();
    renderDecodedRecords(state.lastReadRecords);
  };

  const getOrCreateReader = (): NDEFReaderLike => {
    if (!ndefReaderConstructor) {
      throw new Error('Web NFC is not supported in this browser/device.');
    }

    if (!state.reader) {
      state.reader = new ndefReaderConstructor();
    }

    return state.reader;
  };

  const loadDecodedRecordIntoEditor = (record: DecodedRecord): boolean => {
    if (!state.scanProfile.allowsEditor) {
      return false;
    }
    setEditorValues(elements, decodedRecordToEditorValues(record), state.scanProfile.allowsEditor);
    elements.templateSelect.value = 'custom';
    return true;
  };

  const renderDecodedRecords = (records: DecodedRecord[]): void => {
    renderRecords(elements.recordList, records, {
      disableLoadAction: !state.scanProfile.allowsEditor,
    });
    elements.recordCountLabel.textContent = String(records.length);
  };

  const handleRead = (event: NDEFReadingEventLike): void => {
    const decoded = Array.from(event.message.records).map((record, index) =>
      decodeWebNfcRecord(record, index)
    );

    state.lastReadRecords = decoded;
    elements.serialLabel.textContent = event.serialNumber || '-';
    renderDecodedRecords(decoded);
    applyScanProfile(
      classifyScannedNfcTarget({
        source: 'reading',
        serialNumber: event.serialNumber || '',
        records: decoded,
      })
    );

    const now = new Date().toLocaleTimeString();
    elements.lastScan.textContent = `Tag read at ${now}.`;

    if (state.expectedVerifyRecords) {
      const actual = decoded.map(normalizeRecord);
      const verified = areRecordsEqual(state.expectedVerifyRecords, actual);

      if (verified) {
        showMessage('Verification succeeded: tag content matches the last write.', {
          type: 'info',
          hideTypeText: false,
        });
        state.expectedVerifyRecords = null;
      } else {
        showMessage('Verification mismatch: scanned records differ from the last write.', {
          type: 'warning',
          hideTypeText: false,
        });
      }
    }
  };

  const stopScan = (): void => {
    if (state.scanAbortController) {
      state.scanAbortController.abort();
      state.scanAbortController = null;
    }

    if (state.reader) {
      state.reader.onreading = null;
      state.reader.onreadingerror = null;
    }

    state.isScanning = false;
    setScanState(elements, canUseWebNfc ? 'Idle' : 'Unsupported', false);
  };

  const startScan = async (): Promise<void> => {
    if (state.isScanning) {
      return;
    }

    try {
      const reader = getOrCreateReader();
      const abortController = new AbortController();

      reader.onreading = handleRead;
      reader.onreadingerror = () => {
        state.lastReadRecords = [];
        renderDecodedRecords([]);
        elements.serialLabel.textContent = '-';
        applyScanProfile(
          classifyScannedNfcTarget({
            source: 'reading-error',
            serialNumber: '',
            records: [],
          })
        );
        elements.lastScan.textContent =
          'NFC target detected, but no NDEF records were readable for this target.';
        showMessage('NFC target detected, but the data could not be decoded.', {
          type: 'warning',
          hideTypeText: false,
        });
      };

      await reader.scan({ signal: abortController.signal });
      state.scanAbortController = abortController;
      state.isScanning = true;
      setScanState(elements, 'Scanning', true);
      showMessage('NFC scan started. Bring an NFC target close to your device.', {
        type: 'info',
        hideTypeText: false,
      });
    } catch (error) {
      console.error('[NFCTagLab] Failed to start NFC scan:', error);
      showMessage('Could not start NFC scan. Check permissions and NFC settings.', {
        type: 'alert',
        hideTypeText: false,
      });
      stopScan();
    }
  };

  const handleWrite = async (): Promise<void> => {
    try {
      const editorRecord = buildEditorRecord(getEditorValues(elements));

      const reader = getOrCreateReader();
      await reader.write({ records: [editorRecord.ndef] });
      state.expectedVerifyRecords = [editorRecord.normalized];

      elements.lastScan.textContent = 'Write complete. Scan the same tag again to verify.';
      showMessage('Tag write completed. Now scan to verify.', {
        type: 'info',
        hideTypeText: false,
      });
    } catch (error) {
      console.error('[NFCTagLab] Failed to write NFC tag:', error);
      const message = error instanceof Error ? error.message : 'Failed to write NFC tag.';
      showMessage(message, { type: 'alert', hideTypeText: false });
    }
  };

  const handleCopyHex = async (): Promise<void> => {
    try {
      const editorRecord = buildEditorRecord(getEditorValues(elements));
      const ndefHex = encodeSingleRecordNdefHex(editorRecord.ndef);
      const copied = await copyTextToClipboard(ndefHex);

      if (!copied) {
        showMessage('Clipboard is not available in this browser/device.', {
          type: 'warning',
          hideTypeText: false,
        });
        return;
      }

      elements.hexOutput.textContent = ndefHex;
      showMessage('NDEF hex copied to clipboard.', { type: 'info', hideTypeText: false });
    } catch (error) {
      console.error('[NFCTagLab] Failed to copy NDEF hex:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate NDEF hex.';
      showMessage(message, { type: 'alert', hideTypeText: false });
    }
  };

  const handleParseHex = (): void => {
    try {
      const parsed = parseNdefMessageHex(elements.hexInput.value);
      state.lastReadRecords = parsed;
      renderDecodedRecords(parsed);
      elements.serialLabel.textContent = 'Hex parser';
      elements.hexOutput.textContent = formatRecordsForOutput(parsed);
      applyScanProfile(
        classifyScannedNfcTarget({
          source: 'hex-parser',
          serialNumber: 'hex-parser',
          records: parsed,
        })
      );
    } catch (error) {
      console.error('[NFCTagLab] Failed to parse NDEF hex:', error);
      const message = error instanceof Error ? error.message : 'Invalid NDEF hex input.';
      elements.hexOutput.textContent = message;
      showMessage(message, { type: 'alert', hideTypeText: false });
    }
  };

  const handleClearHex = (): void => {
    elements.hexInput.value = '';
    elements.hexOutput.textContent = EMPTY_HEX_OUTPUT;
  };

  const handleClearSession = (): void => {
    stopScan();
    state.lastReadRecords = [];
    state.expectedVerifyRecords = null;
    renderDecodedRecords([]);
    elements.serialLabel.textContent = '-';
    elements.lastScan.textContent = 'Waiting for NFC activity.';
    applyScanProfile(getDefaultScanProfile());
    setEditorValues(
      elements,
      {
        recordType: 'text',
        payload: '',
        lang: 'en',
        url: '',
        mimeType: '',
      },
      true
    );
    elements.templateSelect.value = 'custom';
  };

  const handleRecordListClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const button = target.closest('button[data-load-record-index]') as HTMLButtonElement | null;
    if (!button) {
      return;
    }

    const index = Number(button.dataset.loadRecordIndex);
    if (!Number.isInteger(index) || index < 0 || index >= state.lastReadRecords.length) {
      return;
    }

    const loaded = loadDecodedRecordIntoEditor(state.lastReadRecords[index]);
    if (loaded) {
      showMessage(`Loaded record #${index + 1} into editor.`, { type: 'info' });
    }
  };

  const handleTemplateChange = (): void => {
    const values = getTemplateValues(elements.templateSelect.value);
    if (!values) {
      return;
    }
    setEditorValues(elements, values, state.scanProfile.allowsEditor);
  };

  if (!hasWebNfc) {
    elements.unsupportedBanner.classList.remove('hidden');
    elements.startButton.disabled = true;
    elements.stopButton.disabled = true;
    elements.writeButton.disabled = true;
    setScanState(elements, 'Unsupported', false);
  }

  applyScanProfile(getDefaultScanProfile());
  setEditorValues(
    elements,
    {
      recordType: 'text',
      payload: '',
      lang: 'en',
      url: '',
      mimeType: '',
    },
    state.scanProfile.allowsEditor
  );
  elements.templateSelect.value = 'custom';
  elements.hexOutput.textContent = EMPTY_HEX_OUTPUT;

  const handleStartClick = (): void => {
    void startScan();
  };
  const handleWriteClick = (): void => {
    void handleWrite();
  };
  const handleCopyHexClick = (): void => {
    void handleCopyHex();
  };
  const handleRecordTypeChange = (): void => {
    syncVisibleRecordFields(elements, state.scanProfile.allowsEditor);
  };

  elements.startButton.addEventListener('click', handleStartClick);
  elements.stopButton.addEventListener('click', stopScan);
  elements.writeButton.addEventListener('click', handleWriteClick);
  elements.clearSessionButton.addEventListener('click', handleClearSession);
  elements.copyHexButton.addEventListener('click', handleCopyHexClick);
  elements.templateSelect.addEventListener('change', handleTemplateChange);
  elements.recordTypeSelect.addEventListener('change', handleRecordTypeChange);
  elements.parseHexButton.addEventListener('click', handleParseHex);
  elements.clearHexButton.addEventListener('click', handleClearHex);
  elements.recordList.addEventListener('click', handleRecordListClick);

  return () => {
    stopScan();
    elements.startButton.removeEventListener('click', handleStartClick);
    elements.stopButton.removeEventListener('click', stopScan);
    elements.writeButton.removeEventListener('click', handleWriteClick);
    elements.clearSessionButton.removeEventListener('click', handleClearSession);
    elements.copyHexButton.removeEventListener('click', handleCopyHexClick);
    elements.templateSelect.removeEventListener('change', handleTemplateChange);
    elements.recordTypeSelect.removeEventListener('change', handleRecordTypeChange);
    elements.parseHexButton.removeEventListener('click', handleParseHex);
    elements.clearHexButton.removeEventListener('click', handleClearHex);
    elements.recordList.removeEventListener('click', handleRecordListClick);
  };
}
