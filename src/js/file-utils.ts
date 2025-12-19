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


export function openPdfInViewerFrame(iframe: HTMLIFrameElement, pdfUrl: string) {

  const start = Date.now();
  const timeoutMs = 10000;

  const tryOpen = async () => {
    try {
      const win = iframe.contentWindow as any;
      if (!win) return;

      const app = win?.PDFViewerApplication;
      if (app) {
        if (app.initializedPromise && typeof app.initializedPromise.then === 'function') {
          await app.initializedPromise;
        }
        if (typeof app.open === 'function') {
          try {
            app.open({ url: pdfUrl });
            return;
          } catch (err) {
            console.error('PDFViewerApplication.open failed', err);
            return;
          }
        }
      }
    } catch (err) {
      // likely cross-origin or not yet available
      console.error('Cannot access iframe PDFViewerApplication', err);
      return;
    }

    if (Date.now() - start < timeoutMs) {
      setTimeout(tryOpen, 50);
    } else {
      console.error('Timed out waiting for PDFViewerApplication in iframe');
    }
  };

  // attempt immediately (covers case where iframe already loaded)
  tryOpen();

  // also try on future load events
  iframe.addEventListener('load', () => {
    tryOpen();
  });

}
