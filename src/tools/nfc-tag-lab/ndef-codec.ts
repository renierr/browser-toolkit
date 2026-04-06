import type { DecodedRecord, NDEFRecordInitLike, NDEFRecordLike } from './types';

const URI_PREFIXES = [
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
  'ftp://anonymous:anonymous@',
  'ftp://ftp.',
  'ftps://',
  'sftp://',
  'smb://',
  'nfs://',
  'ftp://',
  'dav://',
  'news:',
  'telnet://',
  'imap:',
  'rtsp://',
  'urn:',
  'pop:',
  'sip:',
  'sips:',
  'tftp:',
  'btspp://',
  'btl2cap://',
  'btgoep://',
  'tcpobex://',
  'irdaobex://',
  'file://',
  'urn:epc:id:',
  'urn:epc:tag:',
  'urn:epc:pat:',
  'urn:epc:raw:',
  'urn:epc:',
  'urn:nfc:',
] as const;

function asUint8Array(view: DataView | null | undefined): Uint8Array<ArrayBufferLike> {
  if (!view) {
    return new Uint8Array(0);
  }

  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function toHex(bytes: Uint8Array<ArrayBufferLike>): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase();
}

function decodeText(bytes: Uint8Array<ArrayBufferLike>): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    console.error('[NFCTagLab] Failed to decode UTF-8 payload:', error);
    return '';
  }
}

function decodeUriPayload(payload: Uint8Array<ArrayBufferLike>): string {
  if (payload.length === 0) {
    return '';
  }

  const prefix = URI_PREFIXES[payload[0]] ?? '';
  const rest = decodeText(payload.slice(1));
  return `${prefix}${rest}`;
}

function asBytes(data: string | BufferSource | undefined): Uint8Array<ArrayBufferLike> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(0);
}

function encodeUriPayload(uri: string): Uint8Array<ArrayBufferLike> {
  const trimmedUri = uri.trim();
  let bestPrefixIndex = 0;

  for (let index = URI_PREFIXES.length - 1; index > 0; index -= 1) {
    const prefix = URI_PREFIXES[index];
    if (trimmedUri.startsWith(prefix)) {
      bestPrefixIndex = index;
      break;
    }
  }

  const suffix = trimmedUri.slice(URI_PREFIXES[bestPrefixIndex].length);
  const suffixBytes = new TextEncoder().encode(suffix);
  const payload = new Uint8Array(suffixBytes.length + 1);
  payload[0] = bestPrefixIndex;
  payload.set(suffixBytes, 1);
  return payload;
}

function encodeTextPayload(text: string, lang: string): Uint8Array<ArrayBufferLike> {
  const normalizedLang = /^[a-zA-Z0-9-]{1,8}$/.test(lang.trim()) ? lang.trim() : 'en';
  const languageBytes = new TextEncoder().encode(normalizedLang);
  const textBytes = new TextEncoder().encode(text);
  const payload = new Uint8Array(1 + languageBytes.length + textBytes.length);
  payload[0] = languageBytes.length & 0x3f;
  payload.set(languageBytes, 1);
  payload.set(textBytes, 1 + languageBytes.length);
  return payload;
}

function toBigEndianLength(length: number): Uint8Array<ArrayBufferLike> {
  return new Uint8Array([
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  ]);
}

function concatBytes(...chunks: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBufferLike> {
  const totalLength = chunks.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function decodeWellKnownTextPayload(payload: Uint8Array): {
  lang: string;
  value: string;
  encoding: string;
} {
  if (payload.length === 0) {
    return { lang: '', value: '', encoding: 'utf-8' };
  }

  const status = payload[0];
  const languageLength = status & 0x3f;
  const isUtf16 = (status & 0x80) !== 0;
  const langBytes = payload.slice(1, 1 + languageLength);
  const textBytes = payload.slice(1 + languageLength);

  const lang = decodeText(langBytes);
  const value = isUtf16 ? new TextDecoder('utf-16').decode(textBytes) : decodeText(textBytes);
  return { lang, value, encoding: isUtf16 ? 'utf-16' : 'utf-8' };
}

function decodeRawRecord(
  typeNameFormat: number,
  typeBytes: Uint8Array,
  payload: Uint8Array
): DecodedRecord {
  const typeString = decodeText(typeBytes);

  if (typeNameFormat === 0x01 && typeString === 'T') {
    const text = decodeWellKnownTextPayload(payload);
    return {
      index: 0,
      recordType: 'text',
      mediaType: '',
      lang: text.lang,
      encoding: text.encoding,
      value: text.value,
      rawHex: toHex(payload),
    };
  }

  if (typeNameFormat === 0x01 && typeString === 'U') {
    return {
      index: 0,
      recordType: 'url',
      mediaType: '',
      lang: '',
      encoding: 'utf-8',
      value: decodeUriPayload(payload),
      rawHex: toHex(payload),
    };
  }

  if (typeNameFormat === 0x02) {
    return {
      index: 0,
      recordType: 'mime',
      mediaType: typeString,
      lang: '',
      encoding: 'utf-8',
      value: decodeText(payload),
      rawHex: toHex(payload),
    };
  }

  return {
    index: 0,
    recordType: `tnf-${typeNameFormat}:${typeString || 'unknown'}`,
    mediaType: '',
    lang: '',
    encoding: '',
    value: decodeText(payload),
    rawHex: toHex(payload),
  };
}

export function parseNdefMessageHex(input: string): DecodedRecord[] {
  const cleaned = input.replace(/0x/gi, '').replace(/[^a-fA-F0-9]/g, '');
  if (cleaned.length === 0) {
    return [];
  }

  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex input has an odd number of characters.');
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }

  const records: DecodedRecord[] = [];
  let cursor = 0;

  while (cursor < bytes.length) {
    if (cursor + 2 > bytes.length) {
      throw new Error('Unexpected end of NDEF data while reading record header.');
    }

    const header = bytes[cursor++];
    const shortRecord = (header & 0x10) !== 0;
    const idLengthPresent = (header & 0x08) !== 0;
    const chunkFlag = (header & 0x20) !== 0;
    const typeNameFormat = header & 0x07;

    if (chunkFlag) {
      throw new Error('Chunked NDEF records are not supported by this parser yet.');
    }

    const typeLength = bytes[cursor++];

    if (cursor >= bytes.length) {
      throw new Error('Unexpected end of NDEF data while reading payload length.');
    }

    let payloadLength = 0;
    if (shortRecord) {
      payloadLength = bytes[cursor++];
    } else {
      if (cursor + 4 > bytes.length) {
        throw new Error('Unexpected end of NDEF data while reading payload length (32-bit).');
      }

      payloadLength =
        (bytes[cursor] << 24) |
        (bytes[cursor + 1] << 16) |
        (bytes[cursor + 2] << 8) |
        bytes[cursor + 3];
      cursor += 4;
    }

    let idLength = 0;
    if (idLengthPresent) {
      if (cursor >= bytes.length) {
        throw new Error('Unexpected end of NDEF data while reading ID length.');
      }
      idLength = bytes[cursor++];
    }

    if (cursor + typeLength + idLength + payloadLength > bytes.length) {
      throw new Error('NDEF payload length exceeds available bytes.');
    }

    const typeBytes = bytes.slice(cursor, cursor + typeLength);
    cursor += typeLength;
    cursor += idLength;

    const payload = bytes.slice(cursor, cursor + payloadLength);
    cursor += payloadLength;

    const decoded = decodeRawRecord(typeNameFormat, typeBytes, payload);
    decoded.index = records.length;
    records.push(decoded);
  }

  return records;
}

export function decodeWebNfcRecord(record: NDEFRecordLike, index: number): DecodedRecord {
  const dataBytes = asUint8Array(record.data);
  const rawHex = toHex(dataBytes);
  const recordType = record.recordType || 'unknown';

  if (recordType === 'text') {
    const text = decodeWellKnownTextPayload(dataBytes);
    return {
      index,
      recordType,
      mediaType: '',
      lang: record.lang || text.lang,
      encoding: record.encoding || text.encoding,
      value: text.value,
      rawHex,
    };
  }

  if (recordType === 'url') {
    const decodedAsUtf8 = decodeText(dataBytes);
    const value = decodedAsUtf8.startsWith('http') ? decodedAsUtf8 : decodeUriPayload(dataBytes);

    return {
      index,
      recordType,
      mediaType: '',
      lang: '',
      encoding: 'utf-8',
      value,
      rawHex,
    };
  }

  if (recordType === 'mime') {
    return {
      index,
      recordType,
      mediaType: record.mediaType || 'application/octet-stream',
      lang: '',
      encoding: record.encoding || 'utf-8',
      value: decodeText(dataBytes),
      rawHex,
    };
  }

  return {
    index,
    recordType,
    mediaType: record.mediaType || '',
    lang: record.lang || '',
    encoding: record.encoding || '',
    value: decodeText(dataBytes),
    rawHex,
  };
}

export function encodeSingleRecordNdefHex(record: NDEFRecordInitLike): string {
  let typeNameFormat = 0x01;
  let typeBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let payload: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  if (record.recordType === 'text') {
    if (record.encoding === 'utf-16') {
      throw new Error('UTF-16 text encoding is not supported for NDEF hex export yet.');
    }
    typeBytes = new TextEncoder().encode('T');
    payload = encodeTextPayload(
      typeof record.data === 'string' ? record.data : '',
      record.lang || 'en'
    );
  } else if (record.recordType === 'url') {
    typeBytes = new TextEncoder().encode('U');
    payload = encodeUriPayload(typeof record.data === 'string' ? record.data : '');
  } else if (record.recordType === 'mime') {
    typeNameFormat = 0x02;
    const mediaType = record.mediaType?.trim().toLowerCase();
    if (!mediaType || !mediaType.includes('/')) {
      throw new Error('A valid MIME type is required to export NDEF hex.');
    }
    typeBytes = new TextEncoder().encode(mediaType);
    payload = asBytes(record.data);
  } else {
    throw new Error(`Unsupported record type for NDEF hex export: ${record.recordType}`);
  }

  const shortRecord = payload.length <= 0xff;
  const header = 0x80 | 0x40 | (shortRecord ? 0x10 : 0x00) | typeNameFormat;
  const payloadLengthBytes = shortRecord
    ? new Uint8Array([payload.length])
    : toBigEndianLength(payload.length);

  const message = concatBytes(
    new Uint8Array([header]),
    new Uint8Array([typeBytes.length]),
    payloadLengthBytes,
    typeBytes,
    payload
  );

  return toHex(message);
}
