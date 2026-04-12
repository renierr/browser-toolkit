export type NDEFRecordInitLike = {
  recordType: string;
  data?: string | BufferSource;
  id?: string;
  mediaType?: string;
  lang?: string;
  encoding?: 'utf-8' | 'utf-16';
};

export type NDEFMessageInitLike = {
  records: NDEFRecordInitLike[];
};

export type NDEFRecordLike = {
  recordType: string;
  id?: string;
  mediaType?: string;
  encoding?: string;
  lang?: string;
  data?: DataView | null;
};

export type NDEFReadingMessageLike = {
  records: Iterable<NDEFRecordLike>;
};

export type NDEFReadingEventLike = Event & {
  serialNumber?: string;
  message: NDEFReadingMessageLike;
};

export type NDEFReaderLike = {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: NDEFMessageInitLike): Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: (() => void) | null;
};

export type NDEFReaderWindow = Window & {
  NDEFReader?: new () => NDEFReaderLike;
};

export type DecodedRecord = {
  index: number;
  recordType: string;
  mediaType: string;
  lang: string;
  encoding: string;
  value: string;
  rawHex: string;
};

export type NormalizedRecord = {
  recordType: string;
  mediaType: string;
  lang: string;
  value: string;
};

export type EditorRecord = {
  ndef: NDEFRecordInitLike;
  normalized: NormalizedRecord;
};

export type EditorValues = {
  recordType: 'url' | 'text' | 'mime';
  payload: string;
  lang: string;
  url: string;
  mimeType: string;
};

export type NfcCategoryId =
  | 'ndef-data'
  | 'payment-card'
  | 'passport'
  | 'id-card'
  | 'secure-card'
  | 'unknown';

export type ScanConfidence = 'high' | 'medium' | 'low';

export type NfcScanProfile = {
  categoryId: NfcCategoryId;
  categoryLabel: string;
  technology: string;
  confidence: ScanConfidence;
  supportsNdefRead: boolean;
  allowsEditor: boolean;
  allowsWrite: boolean;
  reason: string;
  matchedRule: string;
};
