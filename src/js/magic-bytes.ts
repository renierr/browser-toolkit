/**
 * Common magic bytes for file identification
 * Format: { name, type, bytes, offset? }
 * null in bytes array acts as a wildcard (match anything).
 */
export const MAGIC_BYTES = [
  // Images
  { name: 'JPEG Image', type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { name: 'PNG Image', type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'GIF Image', type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  {
    name: 'WebP Image',
    type: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  { name: 'BMP Image', type: 'image/bmp', bytes: [0x42, 0x4d] },
  { name: 'ICO Icon', type: 'image/x-icon', bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: 'TIFF Image (LE)', type: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: 'TIFF Image (BE)', type: 'image/tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: 'PSD Document', type: 'image/vnd.adobe.photoshop', bytes: [0x38, 0x42, 0x50, 0x53] },
  {
    name: 'HEIC Image',
    type: 'image/heic',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  },
  {
    name: 'AVIF Image',
    type: 'image/avif',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
  },
  { name: 'SVG Image', type: 'image/svg+xml', bytes: [0x3c, 0x73, 0x76, 0x67] },
  { name: 'JPEG 2000', type: 'image/jp2', bytes: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20] },
  { name: 'BPG Image', type: 'image/bpg', bytes: [0x42, 0x50, 0x47, 0xfb] },
  { name: 'FLIF Image', type: 'image/flif', bytes: [0x46, 0x4c, 0x49, 0x46] },
  { name: 'OpenEXR Image', type: 'image/x-exr', bytes: [0x76, 0x2f, 0x31, 0x01] },
  { name: 'TGA Image', type: 'image/x-tga', bytes: [0x00, 0x00, 0x02, 0x00, 0x00] },
  { name: 'PCX Image', type: 'image/x-pcx', bytes: [0x0a, 0x05, 0x01, 0x08] },
  {
    name: 'Nikon NEF',
    type: 'image/x-nikon-nef',
    bytes: [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00],
  },
  {
    name: 'Canon CR2',
    type: 'image/x-canon-cr2',
    bytes: [0x49, 0x49, 0x2a, 0x00, 0x10, 0x00, 0x00, 0x00, 0x43, 0x52],
  },

  // Documents
  { name: 'PDF Document', type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { name: 'RTF Document', type: 'application/rtf', bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31] },
  { name: 'PostScript', type: 'application/postscript', bytes: [0x25, 0x21, 0x50, 0x53] },
  {
    name: 'EPUB',
    type: 'application/epub+zip',
    bytes: [
      0x50,
      0x4b,
      0x03,
      0x04,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0x6d,
      0x69,
      0x6d,
      0x65,
      0x74,
      0x79,
      0x70,
      0x65,
      0x61,
      0x70,
      0x70,
      0x6c,
      0x69,
      0x63,
      0x61,
      0x74,
      0x69,
      0x6f,
      0x6e,
      0x2f,
      0x65,
      0x70,
      0x75,
      0x62,
      0x2b,
      0x7a,
      0x69,
      0x70,
    ],
  },
  {
    name: 'MS Word (Legacy)',
    type: 'application/msword',
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
  {
    name: 'MS Excel (Legacy)',
    type: 'application/vnd.ms-excel',
    bytes: [0x09, 0x08, 0x10, 0x00, 0x00, 0x06, 0x05, 0x00],
  },
  {
    name: 'InDesign Doc',
    type: 'application/x-indesign',
    bytes: [
      0x06, 0x06, 0xed, 0xf5, 0xd8, 0x1d, 0x46, 0xe5, 0xbd, 0x31, 0xef, 0xe7, 0xfe, 0x74, 0xb7,
      0x1d,
    ],
  },

  // Archives / Compressed
  { name: 'ZIP Archive', type: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  {
    name: 'RAR Archive',
    type: 'application/x-rar-compressed',
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
  },
  {
    name: 'RAR Archive (v5)',
    type: 'application/x-rar-compressed',
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01],
  },
  {
    name: '7z Archive',
    type: 'application/x-7z-compressed',
    bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  },
  { name: 'GZIP Compressed', type: 'application/gzip', bytes: [0x1f, 0x8b] },
  { name: 'BZIP2 Compressed', type: 'application/x-bzip2', bytes: [0x42, 0x5a, 0x68] },
  { name: 'XZ Compressed', type: 'application/x-xz', bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { name: 'LZMA Compressed', type: 'application/x-lzma', bytes: [0x5d, 0x00, 0x00, 0x80, 0x00] },
  {
    name: 'LZH Compressed',
    type: 'application/x-lzh-compressed',
    bytes: [null, null, null, 0x2d, 0x6c, 0x68],
  },
  {
    name: 'CAB Archive',
    type: 'application/vnd.ms-cab-compressed',
    bytes: [0x4d, 0x53, 0x43, 0x46],
  },
  {
    name: 'Tar Archive',
    type: 'application/x-tar',
    bytes: [0x75, 0x73, 0x74, 0x61, 0x72],
    offset: 257,
  },
  {
    name: 'ISO CD Image',
    type: 'application/x-iso9660-image',
    bytes: [0x43, 0x44, 0x30, 0x30, 0x31],
    offset: 32769,
  },
  { name: 'LZ4 Compressed', type: 'application/x-lz4', bytes: [0x04, 0x22, 0x4d, 0x18] },
  { name: 'Zstd Compressed', type: 'application/zstd', bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: 'Z Compressed', type: 'application/x-compress', bytes: [0x1f, 0x9d] },
  { name: 'CPIO Archive', type: 'application/x-cpio', bytes: [0x30, 0x37, 0x30, 0x37, 0x30, 0x31] },
  { name: 'Zlib Compressed', type: 'application/zlib', bytes: [0x78, 0x01] },
  { name: 'Zlib (Default)', type: 'application/zlib', bytes: [0x78, 0x9c] },
  { name: 'Zlib (Best)', type: 'application/zlib', bytes: [0x78, 0xda] },

  // Executables / System
  { name: 'EXE / DLL', type: 'application/x-msdownload', bytes: [0x4d, 0x5a] },
  { name: 'ELF Executable', type: 'application/x-elf', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Java Class', type: 'application/java-vm', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'Mach-O (32-bit)', type: 'application/x-mach-binary', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'Mach-O (64-bit)', type: 'application/x-mach-binary', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'WASM Binary', type: 'application/wasm', bytes: [0x00, 0x61, 0x73, 0x6d] },
  {
    name: 'Dalvik Executable',
    type: 'application/vnd.android.dex',
    bytes: [0x64, 0x65, 0x78, 0x0a],
  },
  {
    name: 'Debian Package',
    type: 'application/vnd.debian.binary-package',
    bytes: [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e],
  },
  { name: 'RPM Package', type: 'application/x-rpm', bytes: [0xed, 0xab, 0xee, 0xdb] },
  {
    name: 'Windows Shortcut',
    type: 'application/x-ms-shortcut',
    bytes: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00],
  },
  {
    name: 'Apple Disk Image',
    type: 'application/x-apple-diskimage',
    bytes: [0x6b, 0x6f, 0x6c, 0x79],
    offset: 0,
  },
  { name: 'LNK Shortcut', type: 'application/x-ms-shortcut', bytes: [0x4c, 0x00, 0x00, 0x00] },
  { name: 'Windows Dump', type: 'application/x-dmp', bytes: [0x4d, 0x44, 0x4d, 0x50, 0x93, 0xa7] },
  { name: 'COFF Object', type: 'application/x-coff', bytes: [0x4c, 0x01] },

  // ROMs / Emulation
  { name: 'NES ROM', type: 'application/x-nintendo-nes-rom', bytes: [0x4e, 0x45, 0x53, 0x1a] },
  { name: 'GameBoy ROM', type: 'application/x-gameboy-rom', bytes: [0x00, 0xc3], offset: 0 },
  {
    name: 'Sega Genesis ROM',
    type: 'application/x-genesis-rom',
    bytes: [0x53, 0x45, 0x47, 0x41],
    offset: 256,
  },
  { name: 'N64 ROM (BE)', type: 'application/x-n64-rom', bytes: [0x80, 0x37, 0x12, 0x40] },
  { name: 'N64 ROM (LE)', type: 'application/x-n64-rom', bytes: [0x40, 0x12, 0x37, 0x80] },
  {
    name: 'Dreamcast ROM',
    type: 'application/x-dreamcast-rom',
    bytes: [0x53, 0x45, 0x47, 0x41, 0x20, 0x53, 0x45, 0x47, 0x41, 0x44, 0x45, 0x4e, 0x4b, 0x55],
  },
  {
    name: 'PS2 Executable',
    type: 'application/x-ps2-exe',
    bytes: [
      0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x08, 0x00,
    ],
  },
  {
    name: 'PSX Executable',
    type: 'application/x-psx-exe',
    bytes: [0x50, 0x53, 0x2d, 0x58, 0x20, 0x45, 0x58, 0x45],
  },
  {
    name: 'GBA ROM',
    type: 'application/x-gba-rom',
    bytes: [0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21],
    offset: 4,
  },
  {
    name: 'GC/Wii Image',
    type: 'application/x-gamecube-rom',
    bytes: [0xc2, 0x33, 0x9f, 0x3d],
    offset: 28,
  },

  // Media
  {
    name: 'MP4 Video',
    type: 'video/mp4',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32],
  },
  {
    name: 'MP4 Video (QuickTime)',
    type: 'video/quicktime',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20],
  },
  {
    name: 'MOV Video',
    type: 'video/quicktime',
    bytes: [null, null, null, null, 0x6d, 0x6f, 0x6f, 0x76],
  },
  {
    name: 'AVI Video',
    type: 'video/x-msvideo',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x49, 0x20],
  },
  { name: 'MKV Video', type: 'video/x-matroska', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'WebM Video', type: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'FLV Video', type: 'video/x-flv', bytes: [0x46, 0x4c, 0x56, 0x01] },
  { name: 'MP3 Audio (ID3)', type: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { name: 'MP3 Audio (Header)', type: 'audio/mpeg', bytes: [0xff, 0xfb] },
  {
    name: 'WAV Audio',
    type: 'audio/wav',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45],
  },
  { name: 'Ogg Media', type: 'application/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { name: 'FLAC Audio', type: 'audio/x-flac', bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: 'MIDI Audio', type: 'audio/midi', bytes: [0x4d, 0x54, 0x68, 0x64] },
  { name: 'AAC Audio', type: 'audio/aac', bytes: [0xff, 0xf1] },
  {
    name: 'WMA Audio',
    type: 'audio/x-ms-wma',
    bytes: [
      0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce,
      0x6c,
    ],
  },
  {
    name: 'AIFF Audio',
    type: 'audio/x-aiff',
    bytes: [0x46, 0x4f, 0x52, 0x4d, null, null, null, null, 0x41, 0x49, 0x46, 0x46],
  },
  { name: 'AU Audio', type: 'audio/basic', bytes: [0x2e, 0x73, 0x6e, 0x64] },
  { name: 'AC3 Audio', type: 'audio/ac3', bytes: [0x0b, 0x77] },
  {
    name: 'M4A Audio',
    type: 'audio/mp4',
    bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20],
  },
  { name: 'SWF Flash', type: 'application/x-shockwave-flash', bytes: [0x46, 0x57, 0x53] },
  { name: 'CWS Flash', type: 'application/x-shockwave-flash', bytes: [0x43, 0x57, 0x53] },

  // Forensics / Security
  {
    name: 'Pcap Network Trace',
    type: 'application/vnd.tcpdump.pcap',
    bytes: [0xd4, 0xc3, 0xb2, 0xa1],
  },
  {
    name: 'Pcap Network Trace (BE)',
    type: 'application/vnd.tcpdump.pcap',
    bytes: [0xa1, 0xb2, 0xc3, 0xd4],
  },
  { name: 'Pcapng Trace', type: 'application/x-pcapng', bytes: [0x0a, 0x0d, 0x0d, 0x0a] },
  {
    name: 'DICOM Medical Image',
    type: 'application/dicom',
    bytes: [0x44, 0x49, 0x43, 0x4d],
    offset: 128,
  },
  { name: 'SQLite WAL', type: 'application/x-sqlite3-wal', bytes: [0x37, 0x7f, 0x06, 0x82] },
  {
    name: 'EWF Evidence (EnCase)',
    type: 'application/x-encase-evidence',
    bytes: [0x45, 0x56, 0x46, 0x09, 0x0d, 0x0a, 0xff, 0x00],
  },

  // Databases / Data
  {
    name: 'SQLite DB',
    type: 'application/vnd.sqlite3',
    bytes: [
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33,
      0x00,
    ],
  },
  { name: 'XML file', type: 'application/xml', bytes: [0x3c, 0x3f, 0x78, 0x6d, 0x6c] },
  { name: 'JSON file', type: 'application/json', bytes: [0x7b, 0x22] },
  { name: 'Lua Bytecode', type: 'application/x-lua-bytecode', bytes: [0x1b, 0x4c, 0x75, 0x61] },
  { name: 'Compiled Python', type: 'application/x-python-code', bytes: [0x03, 0xf3, 0x0d, 0x0a] },
  {
    name: 'DS_Store',
    type: 'application/octet-stream',
    bytes: [0x00, 0x00, 0x00, 0x01, 0x42, 0x75, 0x64, 0x31],
  },
  {
    name: 'PEM Keys',
    type: 'application/x-pem-file',
    bytes: [0x2d, 0x2d, 0x2d, 0x2d, 0x2d, 0x42, 0x45, 0x47, 0x49, 0x4e],
  },
  { name: 'DER Certificate', type: 'application/x-x509-ca-cert', bytes: [0x30, 0x82] },
  { name: 'PGP Private Key', type: 'application/pgp-keys', bytes: [0x95, 0x01] },
  {
    name: 'Torrent File',
    type: 'application/x-bittorrent',
    bytes: [0x64, 0x38, 0x3a, 0x61, 0x6e, 0x6e, 0x6f, 0x75, 0x6e, 0x63, 0x65],
  },
  {
    name: 'Windows Registry',
    type: 'application/x-ms-registry',
    bytes: [
      0x57, 0x69, 0x6e, 0x64, 0x6f, 0x77, 0x73, 0x20, 0x52, 0x65, 0x67, 0x69, 0x73, 0x74, 0x72,
      0x79,
    ],
  },
  { name: 'Bencode Object', type: 'application/x-bencode', bytes: [0x64, 0x31, 0x3a] },

  // Niche / Other
  {
    name: 'VHD Disk Image',
    type: 'application/x-vhd',
    bytes: [0x63, 0x6f, 0x6e, 0x65, 0x63, 0x74, 0x69, 0x78],
    offset: 511,
  },
  { name: 'VMDK Disk Image', type: 'application/x-vmdk', bytes: [0x4b, 0x44, 0x4d, 0x56] },
  {
    name: 'Blender Project',
    type: 'application/x-blender',
    bytes: [0x42, 0x4c, 0x45, 0x4e, 0x44, 0x45, 0x52],
  },
  {
    name: 'Photoshop Pattern',
    type: 'application/x-photoshop-pattern',
    bytes: [0x38, 0x42, 0x50, 0x54],
  },
  {
    name: 'Unity Asset',
    type: 'application/x-unity-asset',
    bytes: [0x55, 0x6e, 0x69, 0x74, 0x79, 0x57, 0x65, 0x62],
  },
  {
    name: 'WORDPRESS Export',
    type: 'application/rss+xml',
    bytes: [0x3c, 0x72, 0x73, 0x73, 0x20, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x3d],
  },
  { name: 'PST Mailbox', type: 'application/vnd.ms-outlook', bytes: [0x21, 0x42, 0x44, 0x4e] },
  {
    name: 'EDB Database',
    type: 'application/vnd.ms-exchange-edb',
    bytes: [0xef, 0xcd, 0xab, 0x89],
    offset: 4,
  },
  { name: 'Windows Dump', type: 'application/x-dmp', bytes: [0x4d, 0x44, 0x4d, 0x50, 0x93, 0xa7] },
];

const PANDOC_SUPPORTED_PREFIXES = [
  'text/html',
  'text/markdown',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml',
  'application/vnd.ms-word',
  'application/msword',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
  'application/rtf',
  'text/rtf',
];

export function isPandocSupportedInput(mimeType: string): boolean {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  return PANDOC_SUPPORTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function getFileTypeLabel(mimeType: string): string {
  if (!mimeType) return 'Unknown';
  if (mimeType.startsWith('image/')) return `${mimeType.split('/')[1].toUpperCase()} Image`;
  if (mimeType.startsWith('video/')) return `${mimeType.split('/')[1].toUpperCase()} Video`;
  if (mimeType.startsWith('audio/')) return `${mimeType.split('/')[1].toUpperCase()} Audio`;
  if (mimeType.startsWith('application/')) {
    const name = mimeType.split('/')[1].split('+')[0];
    return name.replace(/-/g, ' ').replace(/\./g, ' ').toUpperCase();
  }
  return mimeType.split('/')[1] || mimeType;
}

/**
 * Identifies a file type based on its leading bytes.
 */
export function identifyFileType(buffer: Uint8Array): { name: string; type: string } | null {
  for (const entry of MAGIC_BYTES) {
    const offset = entry.offset || 0;
    const requiredLength = offset + entry.bytes.length;
    if (buffer.length < requiredLength) continue;

    let match = true;
    for (let i = 0; i < entry.bytes.length; i++) {
      const expected = entry.bytes[i];
      if (expected !== null && buffer[offset + i] !== expected) {
        match = false;
        break;
      }
    }
    if (match) return { name: entry.name, type: entry.type };
  }

  let nulls = 0;
  const scanLimit = Math.min(buffer.length, 2048);
  for (let i = 0; i < scanLimit; i++) if (buffer[i] === 0) nulls++;

  if (nulls === 0 && buffer.length > 0) {
    const head = new TextDecoder().decode(buffer.slice(0, 4096));
    const lowerHead = head.toLowerCase();

    if (lowerHead.includes('<!doctype html') || lowerHead.includes('<html'))
      return { name: 'HTML Document', type: 'text/html' };
    if (lowerHead.includes('<svg') && lowerHead.includes('xmlns='))
      return { name: 'SVG Image', type: 'image/svg+xml' };
    if (head.includes('<?php')) return { name: 'PHP Script', type: 'application/x-php' };
    if (
      head.includes('body {') ||
      head.includes('.cls {') ||
      head.includes('@import') ||
      head.includes('@media ')
    )
      return { name: 'CSS Stylesheet', type: 'text/css' };

    if (head.startsWith('#!/bin/bash') || head.startsWith('#!/bin/sh'))
      return { name: 'Shell Script', type: 'application/x-sh' };
    if (
      head.startsWith('#!/usr/bin/env pwsh') ||
      head.startsWith('#!/usr/bin/env powershell') ||
      head.includes('Write-Host ') ||
      head.includes('$global:')
    )
      return { name: 'PowerShell Script', type: 'application/x-powershell' };
    if (
      head.startsWith('#!/usr/bin/env python') ||
      head.includes('import os\n') ||
      head.includes('def main():')
    )
      return { name: 'Python Script', type: 'text/x-python' };
    if (head.includes('public class ') && head.includes('static void main'))
      return { name: 'Java Source', type: 'text/x-java' };
    if (head.includes('#include <') && (head.includes('int main') || head.includes('void main')))
      return { name: 'C/C++ Source', type: 'text/x-c' };
    if (head.startsWith('FROM ') && head.includes('RUN '))
      return { name: 'Dockerfile', type: 'text/x-dockerfile' };
    if (
      head.includes('\t') &&
      head.includes(':') &&
      (head.includes('.PHONY') || head.includes('all:'))
    )
      return { name: 'Makefile', type: 'text/x-makefile' };
    if (head.includes('package main') && head.includes('func main()'))
      return { name: 'Go Source', type: 'text/x-go' };
    if (head.includes('fn main()') && head.includes('use std::'))
      return { name: 'Rust Source', type: 'text/x-rust' };
    if (head.includes('require "rspec"') || head.includes('def initialize'))
      return { name: 'Ruby Script', type: 'text/x-ruby' };
    if ((head.includes('using System;') || head.includes('namespace ')) && head.includes('class '))
      return { name: 'C# Source', type: 'text/x-csharp' };
    if (head.includes('import kotlin.') || head.includes('fun main('))
      return { name: 'Kotlin Source', type: 'text/x-kotlin' };
    if (head.includes('import Swift') || (head.includes('func ') && head.includes('-> ')))
      return { name: 'Swift Source', type: 'text/x-swift' };

    if (head.startsWith('---') && (head.includes('\n- ') || head.includes(': ')))
      return { name: 'YAML/Frontmatter', type: 'text/yaml' };
    if (head.startsWith('BEGIN:VCARD')) return { name: 'vCard Contact', type: 'text/vcard' };
    if (head.startsWith('BEGIN:VCALENDAR'))
      return { name: 'iCalendar Event', type: 'text/calendar' };
    if (head.includes('<?xml')) return { name: 'XML Document', type: 'application/xml' };

    if (head.includes('# ') && head.includes('\n## '))
      return { name: 'Markdown Document', type: 'text/markdown' };

    if (
      head.startsWith('#!/usr/bin/env node') ||
      head.includes('\nconst ') ||
      head.includes('\nlet ') ||
      head.includes('\nvar ') ||
      head.includes('function ') ||
      head.includes('=>') ||
      head.includes('export ') ||
      head.includes('export default') ||
      head.includes('async function') ||
      (head.includes('import ') && head.includes('from ')) ||
      head.includes('require(')
    )
      return { name: 'JavaScript / Node', type: 'application/javascript' };

    if (
      head.includes('[Section]') ||
      head.includes('[Config]') ||
      (head.includes('=') && head.includes('\n['))
    )
      return { name: 'INI / Config', type: 'text/x-ini' };
    if (
      head.includes('DEBUG: ') ||
      head.includes('INFO: ') ||
      head.includes('ERROR: ') ||
      head.includes('FATAL: ')
    )
      return { name: 'Log File', type: 'text/x-log' };
    if (head.includes('DB_HOST=') || head.includes('API_KEY=') || head.includes('PORT='))
      return { name: 'Environment File', type: 'text/plain' };

    return { name: 'Plain Text', type: 'text/plain' };
  }

  return null;
}
