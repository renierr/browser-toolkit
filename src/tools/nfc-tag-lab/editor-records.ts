import type { DecodedRecord, EditorRecord, EditorValues, NormalizedRecord } from './types';

export function buildEditorRecord(values: EditorValues): EditorRecord {
  if (values.recordType === 'url') {
    const trimmedUrl = values.url.trim();
    if (!trimmedUrl) {
      throw new Error('URI is required for URL records.');
    }

    return {
      ndef: {
        recordType: 'url',
        data: trimmedUrl,
      },
      normalized: {
        recordType: 'url',
        mediaType: '',
        lang: '',
        value: trimmedUrl,
      },
    };
  }

  if (values.recordType === 'mime') {
    const trimmedType = values.mimeType.trim().toLowerCase();
    if (!trimmedType.includes('/')) {
      throw new Error('A valid MIME type is required (example: application/json).');
    }

    return {
      ndef: {
        recordType: 'mime',
        mediaType: trimmedType,
        data: new TextEncoder().encode(values.payload),
      },
      normalized: {
        recordType: 'mime',
        mediaType: trimmedType,
        lang: '',
        value: values.payload.trim(),
      },
    };
  }

  const normalizedLang = /^[a-zA-Z0-9-]{1,8}$/.test(values.lang.trim()) ? values.lang.trim() : 'en';
  return {
    ndef: {
      recordType: 'text',
      data: values.payload,
      lang: normalizedLang,
      encoding: 'utf-8',
    },
    normalized: {
      recordType: 'text',
      mediaType: '',
      lang: normalizedLang,
      value: values.payload.trim(),
    },
  };
}

export function normalizeRecord(record: DecodedRecord): NormalizedRecord {
  return {
    recordType: record.recordType,
    mediaType: record.mediaType,
    lang: record.lang,
    value: record.value.trim(),
  };
}

export function areRecordsEqual(left: NormalizedRecord[], right: NormalizedRecord[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.recordType !== b.recordType ||
      a.mediaType !== b.mediaType ||
      a.lang !== b.lang ||
      a.value !== b.value
    ) {
      return false;
    }
  }

  return true;
}

export function getTemplateValues(templateId: string): EditorValues | null {
  if (templateId === 'url-homepage') {
    return {
      recordType: 'url',
      url: 'https://example.com',
      payload: '',
      lang: 'en',
      mimeType: '',
    };
  }

  if (templateId === 'text-note') {
    return {
      recordType: 'text',
      url: '',
      payload: 'Hello from NFC Tag Lab',
      lang: 'en',
      mimeType: '',
    };
  }

  if (templateId === 'mime-json') {
    return {
      recordType: 'mime',
      url: '',
      payload: '{\n  "name": "NFC Tag Lab",\n  "version": 1\n}',
      lang: 'en',
      mimeType: 'application/json',
    };
  }

  if (templateId === 'mime-vcard') {
    return {
      recordType: 'mime',
      url: '',
      payload: 'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nTEL:+123456789\nEND:VCARD',
      lang: 'en',
      mimeType: 'text/vcard',
    };
  }

  return null;
}

export function decodedRecordToEditorValues(record: DecodedRecord): EditorValues {
  if (record.recordType === 'url') {
    return {
      recordType: 'url',
      payload: '',
      lang: 'en',
      url: record.value,
      mimeType: '',
    };
  }

  if (record.recordType === 'mime') {
    return {
      recordType: 'mime',
      payload: record.value,
      lang: 'en',
      url: '',
      mimeType: record.mediaType || 'application/octet-stream',
    };
  }

  return {
    recordType: 'text',
    payload: record.value,
    lang: record.lang || 'en',
    url: '',
    mimeType: '',
  };
}
