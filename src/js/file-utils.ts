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
