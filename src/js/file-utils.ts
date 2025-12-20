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
