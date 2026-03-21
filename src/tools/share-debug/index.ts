import type { SharedFilesPayload } from '../../js/share-target';
import { getMimeTypeFromFileName } from '../../js/mime-types';
import { setupFileDropzone } from '../../js/file-utils';

export default function init(payload?: SharedFilesPayload): (() => void) | undefined {
  setupFileDropzone('dropzone', 'file-input', (files) => {
    if (files[0]) displayFileInfo(files[0]);
  });

  const shareStatus = document.getElementById('share-status') as HTMLElement;
  const urlParams = document.getElementById('url-params') as HTMLElement;

  const params = new URLSearchParams(window.location.search);
  const hasShared = params.get('shared') === '1';
  const keysCount = params.get('keys')?.split(',').filter(Boolean).length ?? 0;
  const error = params.get('sw_error');

  const debugInfo: Record<string, unknown> = {};
  params.forEach((value, key) => {
    debugInfo[key] = value;
  });
  urlParams.textContent = JSON.stringify(debugInfo, null, 2);

  if (error) {
    shareStatus.textContent = `Service Worker Error: ${decodeURIComponent(error)}`;
    (shareStatus.closest('.alert') as HTMLElement)?.classList.replace('alert-info', 'alert-error');
  } else if (hasShared) {
    shareStatus.textContent = `${keysCount} shared file(s) detected`;
    (shareStatus.closest('.alert') as HTMLElement)?.classList.replace(
      'alert-info',
      'alert-success'
    );
  } else {
    shareStatus.textContent = 'No shared files detected - use the dropzone below to test';
  }

  if (payload?.sharedFiles?.length) {
    displayFileInfo(payload.sharedFiles[0]);
  }

  function displayFileInfo(file: File) {
    const container = document.getElementById('file-info-container') as HTMLElement;
    const noFilesCard = document.getElementById('no-files-card') as HTMLElement;
    container.classList.remove('hidden');
    noFilesCard.classList.add('hidden');

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const calculatedMime = getMimeTypeFromFileName(file.type, file.name);

    document.getElementById('info-name')!.textContent = file.name || '(unnamed)';
    document.getElementById('info-size')!.textContent = formatBytes(file.size);
    document.getElementById('info-raw-mime')!.textContent = file.type || '(empty)';
    document.getElementById('info-calc-mime')!.textContent = calculatedMime;
    document.getElementById('info-extension')!.textContent = extension ? `.${extension}` : '(none)';
    document.getElementById('info-last-modified')!.textContent = new Date(
      file.lastModified
    ).toLocaleString();

    const contentTypeEl = document.getElementById('info-content-type') as HTMLElement;
    const isBinary = isLikelyBinary(file.type, calculatedMime, extension);
    contentTypeEl.textContent = isBinary ? 'Binary' : 'Text';
    contentTypeEl.className = `badge ${isBinary ? 'badge-error' : 'badge-success'}`;

    loadPreview(file);
    checkBinaryContent(file);
  }

  function loadPreview(file: File) {
    const previewText = document.querySelector('#preview-text pre') as HTMLElement;
    const previewHex = document.querySelector('#preview-hex pre') as HTMLElement;
    const previewSize = document.getElementById('preview-size') as HTMLElement;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as ArrayBuffer;
      const previewBytes = content.slice(0, 1024);
      previewSize.textContent = `${Math.min(1024, file.size)} / ${formatBytes(file.size)} bytes`;

      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      const text = textDecoder.decode(previewBytes);
      previewText.textContent = text;

      const uint8 = new Uint8Array(previewBytes);
      let hexLines = '';
      for (let i = 0; i < uint8.length; i += 16) {
        const chunk = uint8.slice(i, i + 16);
        const hex = Array.from(chunk)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        const ascii = Array.from(chunk)
          .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
          .join('');
        hexLines += `${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  ${ascii}\n`;
      }
      previewHex.textContent = hexLines || '(empty file)';
    };
    reader.readAsArrayBuffer(file.slice(0, 1024));
  }

  function checkBinaryContent(file: File) {
    const resultEl = document.getElementById('binary-result') as HTMLElement;
    const explanationEl = document.getElementById('binary-explanation') as HTMLElement;

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const calculatedMime = getMimeTypeFromFileName(file.type, file.name);
    const isBinary = isLikelyBinary(file.type, calculatedMime, extension);

    resultEl.textContent = isBinary ? 'Binary' : 'Text';
    resultEl.className = `badge badge-lg ${isBinary ? 'badge-error' : 'badge-success'}`;

    const reasons: string[] = [];
    if (file.type && file.type !== 'application/octet-stream') {
      reasons.push(`MIME type: ${file.type}`);
    }
    if (extension) {
      reasons.push(`extension: .${extension}`);
    }
    if (reasons.length > 0) {
      explanationEl.textContent = `Based on: ${reasons.join(', ')}`;
    } else {
      explanationEl.textContent = 'No type information available';
    }
  }

  document.getElementById('tab-text')?.addEventListener('change', () => {
    document.getElementById('preview-text')?.classList.remove('hidden');
    document.getElementById('preview-hex')?.classList.add('hidden');
  });

  document.getElementById('tab-hex')?.addEventListener('change', () => {
    document.getElementById('preview-text')?.classList.add('hidden');
    document.getElementById('preview-hex')?.classList.remove('hidden');
  });

  return () => {};
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function isLikelyBinary(rawMime: string, calculatedMime: string, extension: string): boolean {
  if (rawMime && rawMime !== 'application/octet-stream') {
    return !rawMime.startsWith('text/');
  }
  if (calculatedMime && calculatedMime !== 'application/octet-stream') {
    return !calculatedMime.startsWith('text/');
  }
  const binaryExtensions = [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'bmp',
    'ico',
    'tiff',
    'tif',
    'heic',
    'avif',
    'psd',
    'pdf',
    'zip',
    'rar',
    '7z',
    'tar',
    'gz',
    'bz2',
    'mp3',
    'mp4',
    'wav',
    'ogg',
    'flac',
    'm4a',
    'aac',
    'opus',
    'avi',
    'mkv',
    'webm',
    'mov',
    'exe',
    'msi',
    'dll',
    'bin',
    'dat',
    'dmp',
    'iso',
    'img',
    'dmg',
    'sqlite',
    'sqlite3',
    'db',
    'epub',
    'mobi',
    'azw',
  ];
  return binaryExtensions.includes(extension);
}
