// Sets up drag-and-drop and click-to-select for a file input and dropzone
export function setupFileDropzone(dropzoneId: string, inputId: string, onFile: (file: File) => void) {
  const dropzone = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(inputId) as HTMLInputElement | null;
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dropzone-active');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone-active');
    const files = (e.dataTransfer?.files || []);
    if (files.length) {
      onFile(files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) onFile(file);
  });
}

export function toUint8Array(data: ArrayBuffer | ArrayBufferView | SharedArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array(data as ArrayBuffer);
}

export type DownloadBuffer = {
  data: ArrayBuffer | ArrayBufferView | SharedArrayBuffer;
  name: string;
};
export async function downloadAsZip(files: DownloadBuffer[], zipFilename: string): Promise<void> {
  // Each file.data is converted to Uint8Array to avoid ArrayBuffer vs SharedArrayBuffer issues.
  if (!files || files.length === 0) return;

  // If there's only one file, just download it directly (useful fallback)
  if (files.length === 1) {
    const f = files[0];
    await downloadFile(new Uint8Array(f.data as any), f.name);
    return;
  }

  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const f of files) {
      const bytes = toUint8Array(f.data);
      zip.file(f.name, bytes);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    await downloadFile(blob, zipFilename, 'application/zip');
  } catch (e) {
    // If jszip isn't available, throw a clear error so callers know why ZIP failed.
    throw new Error(
      'downloadAsZip requires the "jszip" package to be installed.'
    );
  }
}


export async function downloadFile(
  source: string | Uint8Array | ArrayBuffer | Blob,
  filename?: string,
  mimeType = 'application/octet-stream'
): Promise<void> {
  const trigger = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const guessNameFromUrl = (url: string) => {
    try {
      const p = new URL(url).pathname;
      const last = p.split('/').pop();
      return last || 'download';
    } catch {
      return 'download';
    }
  };

  if (typeof source === 'string') {
    const name = filename || guessNameFromUrl(source);
    trigger(source, name);
    return;
  }

  let blob;
  if (source instanceof Blob) {
    blob = source;
  } else {
    blob = new Blob([source as ArrayBuffer], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  try {
    trigger(url, filename || 'download');
  } finally {
    URL.revokeObjectURL(url);
  }
}
