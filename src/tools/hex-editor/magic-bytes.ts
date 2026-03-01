/**
 * Common magic bytes for file identification
 */
export const MAGIC_BYTES = [
  { name: 'JPEG Image', type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { name: 'PNG Image', type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { name: 'GIF Image', type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'WebP Image', type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  { name: 'PDF Document', type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2D] },
  { name: 'ZIP Archive', type: 'application/zip', bytes: [0x50, 0x4B, 0x03, 0x04] },
  { name: 'ZIP Archive (Empty)', type: 'application/zip', bytes: [0x50, 0x4B, 0x05, 0x06] },
  { name: 'ZIP Archive (Spanned)', type: 'application/zip', bytes: [0x50, 0x4B, 0x07, 0x08] },
  { name: 'RAR Archive', type: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] },
  { name: 'RAR Archive (v5)', type: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01] },
  { name: '7z Archive', type: 'application/x-7z-compressed', bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: 'GZIP Compressed', type: 'application/gzip', bytes: [0x1F, 0x8B] },
  { name: 'BZIP2 Compressed', type: 'application/x-bzip2', bytes: [0x42, 0x5A, 0x68] },
  { name: 'Tar Archive (posix)', type: 'application/x-tar', bytes: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x75, 0x73, 0x74, 0x61, 0x72] }, // 'ustar' at offset 257
  { name: 'EXE / DLL', type: 'application/x-msdownload', bytes: [0x4D, 0x5A] },
  { name: 'ELF Executable', type: 'application/x-elf', bytes: [0x7F, 0x45, 0x4C, 0x46] },
  { name: 'Java Class', type: 'application/java-vm', bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
  { name: 'SQLite Database', type: 'application/vnd.sqlite3', bytes: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00] },
  { name: 'MP4 Video', type: 'video/mp4', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D] },
  { name: 'MP3 Audio', type: 'audio/mpeg', bytes: [0xFF, 0xFB] },
  { name: 'MP3 Audio (ID3)', type: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { name: 'WAV Audio', type: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45] },
  { name: 'Ogg Media', type: 'application/ogg', bytes: [0x4F, 0x67, 0x67, 0x53] },
  { name: 'FLAC Audio', type: 'audio/x-flac', bytes: [0x66, 0x4C, 0x61, 0x43] },
  { name: 'MIDI Audio', type: 'audio/midi', bytes: [0x4D, 0x54, 0x68, 0x64] },
  { name: 'BMP Image', type: 'image/bmp', bytes: [0x42, 0x4D] },
  { name: 'ICO Icon', type: 'image/x-icon', bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: 'TIFF Image (LE)', type: 'image/tiff', bytes: [0x49, 0x49, 0x2A, 0x00] },
  { name: 'TIFF Image (BE)', type: 'image/tiff', bytes: [0x4D, 0x4D, 0x00, 0x2A] },
  { name: 'PSD Document', type: 'image/vnd.adobe.photoshop', bytes: [0x38, 0x42, 0x50, 0x53] },
  { name: 'XML Document', type: 'application/xml', bytes: [0x3C, 0x3F, 0x78, 0x6D, 0x6C] },
];

/**
 * Identifies a file type based on its leading bytes.
 * @param buffer The first few bytes of the file.
 * @returns The identified file type or null.
 */
export function identifyFileType(buffer: Uint8Array): { name: string; type: string } | null {
  for (const entry of MAGIC_BYTES) {
    if (buffer.length < entry.bytes.length) continue;

    let match = true;
    for (let i = 0; i < entry.bytes.length; i++) {
      if (entry.bytes[i] !== null && buffer[i] !== entry.bytes[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { name: entry.name, type: entry.type };
    }
  }

  return null;
}
