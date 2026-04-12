import type { DecodedRecord, NfcScanProfile, ScanConfidence } from './types';

type ScanSource = 'reading' | 'reading-error' | 'hex-parser';

type ScanContext = {
  source: ScanSource;
  serialNumber: string;
  records: DecodedRecord[];
};

type ProfileRule = {
  id: string;
  categoryId: NfcScanProfile['categoryId'];
  categoryLabel: string;
  technology: string;
  confidence: ScanConfidence;
  supportsNdefRead: boolean;
  allowsEditor: boolean;
  allowsWrite: boolean;
  reason: string;
  matches: (context: ScanContext) => boolean;
};

const PAYMENT_SIGNATURES = [
  '2PAY.SYS.DDF01',
  'A000000003',
  'A000000004',
  'A000000025',
  'A000000152',
];
const PASSPORT_SIGNATURES = ['A0000002471001', 'ICAO', 'LDS'];
const ID_SIGNATURES = ['A000000167455349474E', 'A000000248', 'EID', 'IDENTITY'];

const KNOWN_RULES: ProfileRule[] = [
  {
    id: 'payment-card-signature',
    categoryId: 'payment-card',
    categoryLabel: 'Payment Card',
    technology: 'ISO-DEP / EMV (best effort)',
    confidence: 'medium',
    supportsNdefRead: false,
    allowsEditor: false,
    allowsWrite: false,
    reason: 'Detected EMV-like application identifiers. Editing and writing are disabled.',
    matches: (context) => hasAnySignature(context, PAYMENT_SIGNATURES),
  },
  {
    id: 'passport-signature',
    categoryId: 'passport',
    categoryLabel: 'ePassport',
    technology: 'ISO-DEP / ICAO LDS (best effort)',
    confidence: 'medium',
    supportsNdefRead: false,
    allowsEditor: false,
    allowsWrite: false,
    reason: 'Detected ICAO passport-like signatures. Editing and writing are disabled.',
    matches: (context) => hasAnySignature(context, PASSPORT_SIGNATURES),
  },
  {
    id: 'id-card-signature',
    categoryId: 'id-card',
    categoryLabel: 'ID Card',
    technology: 'Secure document applet (best effort)',
    confidence: 'low',
    supportsNdefRead: false,
    allowsEditor: false,
    allowsWrite: false,
    reason: 'Detected ID-document-like signatures. Editing and writing are disabled.',
    matches: (context) => hasAnySignature(context, ID_SIGNATURES),
  },
];

export function getDefaultScanProfile(): NfcScanProfile {
  return {
    categoryId: 'unknown',
    categoryLabel: 'No scan yet',
    technology: '-',
    confidence: 'low',
    supportsNdefRead: false,
    allowsEditor: true,
    allowsWrite: true,
    reason: 'Scan an NFC target to classify it and show supported actions.',
    matchedRule: 'none',
  };
}

export function classifyScannedNfcTarget(context: ScanContext): NfcScanProfile {
  for (const rule of KNOWN_RULES) {
    if (rule.matches(context)) {
      return toProfile(rule);
    }
  }

  if (context.source === 'reading-error') {
    return {
      categoryId: 'secure-card',
      categoryLabel: 'Non-NDEF NFC target',
      technology: 'Secure NFC applet or card emulation (best effort)',
      confidence: 'low',
      supportsNdefRead: false,
      allowsEditor: false,
      allowsWrite: false,
      reason:
        'This target responded to NFC, but no NDEF payload could be decoded. Editing and writing are disabled.',
      matchedRule: 'non-ndef-reading-error',
    };
  }

  if (context.records.length > 0) {
    return {
      categoryId: 'ndef-data',
      categoryLabel: 'NDEF Data',
      technology: 'NDEF-compatible target',
      confidence: 'high',
      supportsNdefRead: true,
      allowsEditor: true,
      allowsWrite: true,
      reason: 'NDEF records decoded successfully. Editor and writing are available.',
      matchedRule: 'decoded-ndef-records',
    };
  }

  return {
    categoryId: 'unknown',
    categoryLabel: 'Unknown NFC target',
    technology: 'Unidentified technology',
    confidence: 'low',
    supportsNdefRead: false,
    allowsEditor: false,
    allowsWrite: false,
    reason: 'No signatures or NDEF records were available for reliable classification.',
    matchedRule: 'fallback-unknown',
  };
}

function toProfile(rule: ProfileRule): NfcScanProfile {
  return {
    categoryId: rule.categoryId,
    categoryLabel: rule.categoryLabel,
    technology: rule.technology,
    confidence: rule.confidence,
    supportsNdefRead: rule.supportsNdefRead,
    allowsEditor: rule.allowsEditor,
    allowsWrite: rule.allowsWrite,
    reason: rule.reason,
    matchedRule: rule.id,
  };
}

function hasAnySignature(context: ScanContext, signatures: string[]): boolean {
  const haystack = buildScanHaystack(context);
  return signatures.some((signature) => haystack.includes(signature));
}

function buildScanHaystack(context: ScanContext): string {
  const joinedRecords = context.records
    .map((record) => `${record.recordType}|${record.mediaType}|${record.value}|${record.rawHex}`)
    .join('|');

  return `${context.serialNumber}|${joinedRecords}`.toUpperCase();
}
