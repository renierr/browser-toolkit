import { setupFileDropzone, downloadFile } from '../../js/file-utils';
import { showProgress, showMessage, yieldToUI, hideProgress } from '../../js/ui';
import { identifyFileType } from './magic-bytes';
import { HexBufferManager, BYTES_PER_LINE } from './hex-utils';
import HexWorker from './hex.worker?worker';
import type { SharedFilesPayload } from '../../js/share-target';
import type { WorkerInMessage, WorkerOutMessage, HexLine } from './worker-protocol';

export default function init(payload?: SharedFilesPayload) {
  const dropzone = document.getElementById('hex-dropzone')!;
  const fileInput = document.getElementById('hex-file-input') as HTMLInputElement;
  const fileInfo = document.getElementById('file-info')!;
  const editorContainer = document.getElementById('editor-container')!;
  const hexViewer = document.getElementById('hex-viewer')!;
  const hexContent = document.getElementById('hex-content')!;
  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  const infoFilename = document.getElementById('info-filename')!;
  const infoType = document.getElementById('info-type')!;
  const infoSize = document.getElementById('info-size')!;
  const infoModified = document.getElementById('info-modified')!;

  const toggleHex = document.getElementById('toggle-hex') as HTMLInputElement;
  const toggleAscii = document.getElementById('toggle-ascii') as HTMLInputElement;
  const hexHeader = document.getElementById('hex-header')!;
  const asciiHeader = document.getElementById('ascii-header')!;

  const statusSelection = document.getElementById('status-selection')!;
  const statusStats = document.getElementById('status-stats')!;

  const editModal = document.getElementById('edit-modal') as HTMLDialogElement;
  const editHexInput = document.getElementById('edit-hex-input') as HTMLInputElement;
  const editAsciiInput = document.getElementById('edit-ascii-input') as HTMLInputElement;
  const cancelEdit = document.getElementById('cancel-edit')!;
  const saveEdit = document.getElementById('save-edit')!;

  let bufferManager: HexBufferManager | null = null;
  let currentFile: File | null = null;
  let selectedOffset: number | null = null;

  // Worker for fast formatting
  const worker = new HexWorker();

  // Browser height limit for scrollable elements (~33M in Chrome, ~17M in FF)
  const MAX_PHYSICAL_HEIGHT = 10000000;
  const LINE_HEIGHT = 20;

  let totalLines = 0;
  let totalLogicalHeight = 0;
  let scrollScale = 1;
  let isRendering = false;

  const updateFileInfo = async (file: File) => {
    showProgress('Analyzing file...');
    await yieldToUI(true);

    try {
      currentFile = file;
      bufferManager = new HexBufferManager(file);

      fileInfo.classList.remove('hidden');
      editorContainer.classList.remove('hidden');
      dropzone.classList.add('hidden');

      infoFilename.textContent = file.name;
      infoSize.textContent = `${file.size.toLocaleString()} bytes`;
      infoModified.textContent = new Date(file.lastModified).toLocaleString();

      // Identify type (read first 32 bytes)
      const firstChunk = await bufferManager.getRange(0, 32);
      const id = identifyFileType(firstChunk);
      if (id) {
        infoType.textContent = id.name;
        infoType.className = 'badge badge-primary';
      } else {
        infoType.textContent = 'Unknown Type';
        infoType.className = 'badge badge-ghost';
      }

      totalLines = Math.ceil(file.size / BYTES_PER_LINE);
      totalLogicalHeight = totalLines * LINE_HEIGHT;

      // Scale height if it exceeds MAX_PHYSICAL_HEIGHT
      if (totalLogicalHeight > MAX_PHYSICAL_HEIGHT) {
        scrollScale = MAX_PHYSICAL_HEIGHT / totalLogicalHeight;
        hexContent.style.height = `${MAX_PHYSICAL_HEIGHT}px`;
      } else {
        scrollScale = 1;
        hexContent.style.height = `${totalLogicalHeight}px`;
      }

      renderVisibleLines();
    } catch (err) {
      console.error(err);
      showMessage('Error loading file', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  const resetTool = () => {
    currentFile = null;
    bufferManager = null;
    selectedOffset = null;

    fileInfo.classList.add('hidden');
    editorContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');

    fileInput.value = '';
    hexContent.innerHTML = '';
    hexContent.style.height = '0px';
    statusSelection.textContent = 'Offset: 0x00000000';
    statusStats.textContent = 'Visible: 0 bytes';
  };

  const renderVisibleLines = async () => {
    if (!bufferManager || isRendering) return;
    isRendering = true;

    const scrollTop = hexViewer.scrollTop;
    const containerHeight = hexViewer.clientHeight;

    // Convert physical scroll position back to logical
    const logicalScrollTop = scrollTop / scrollScale;

    const startLine = Math.floor(logicalScrollTop / LINE_HEIGHT);
    const visibleLineCount = Math.ceil(containerHeight / LINE_HEIGHT) + 3;
    const endLine = Math.min(totalLines, startLine + visibleLineCount);

    const startOffset = startLine * BYTES_PER_LINE;
    const bytesToRead = Math.min((endLine - startLine) * BYTES_PER_LINE, bufferManager.totalSize - startOffset);

    if (bytesToRead <= 0) {
      isRendering = false;
      return;
    }

    try {
      const buffer = await bufferManager.getRange(startOffset, bytesToRead);

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type !== 'format-result') return;

        const fragment = document.createDocumentFragment();
        msg.lines.forEach((line: HexLine) => {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'flex items-center hover:bg-base-200 px-4 group';
          lineDiv.style.height = `${LINE_HEIGHT}px`;
          lineDiv.style.position = 'absolute';
          // Calculate physical top position
          lineDiv.style.top = `${Math.floor((line.lineIndex * LINE_HEIGHT) * scrollScale)}px`;
          lineDiv.style.width = '100%';

          const offsetDiv = document.createElement('div');
          offsetDiv.className = 'w-16 sm:w-20 shrink-0 text-primary opacity-50 text-[10px] sm:text-xs font-bold';
          offsetDiv.textContent = line.offset;
          lineDiv.appendChild(offsetDiv);

          const hexContainer = document.createElement('div');
          hexContainer.className = 'flex-1 flex justify-center gap-1 sm:gap-2 hex-col';
          if (!toggleHex.checked) hexContainer.classList.add('hidden');

          line.hex.forEach((h: string, i: number) => {
            const byteSpan = document.createElement('span');
            byteSpan.className = h !== '  ' ? 'cursor-pointer hover:text-primary transition-colors w-5 text-center' : 'w-5 text-center';
            byteSpan.textContent = h;
            if (h !== '  ') {
              const currentOffset = line.lineIndex * BYTES_PER_LINE + i;
              byteSpan.onclick = () => {
                selectedOffset = currentOffset;
                editHexInput.value = h;
                editAsciiInput.value = line.ascii[i];
                statusSelection.textContent = `Offset: 0x${currentOffset.toString(16).padStart(8, '0').toUpperCase()}`;
                editModal.showModal();
              };
            }
            hexContainer.appendChild(byteSpan);
          });
          lineDiv.appendChild(hexContainer);

          const asciiDiv = document.createElement('div');
          asciiDiv.className = 'w-32 sm:w-48 shrink-0 flex justify-center text-secondary opacity-70 ascii-col';
          if (!toggleAscii.checked) asciiDiv.classList.add('hidden');
          asciiDiv.textContent = line.ascii;
          lineDiv.appendChild(asciiDiv);

          fragment.appendChild(lineDiv);
        });

        hexContent.innerHTML = '';
        hexContent.appendChild(fragment);
        statusStats.textContent = `Offset Range: 0x${startOffset.toString(16).toUpperCase()} - 0x${(startOffset + bytesToRead - 1).toString(16).toUpperCase()}`;
        isRendering = false;
      };

      const workerMsg: WorkerInMessage = {
        type: 'format-lines',
        buffer,
        startLine,
        bytesPerLine: BYTES_PER_LINE
      };
      worker.postMessage(workerMsg);
    } catch (err) {
      console.error(err);
      isRendering = false;
    }
  };

  // Simple throttle for scrolling
  let scrollTimeout: number | null = null;
  hexViewer.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = window.setTimeout(() => {
      renderVisibleLines();
      scrollTimeout = null;
    }, 16); // ~60fps
  });

  toggleHex.addEventListener('change', () => {
    hexHeader.classList.toggle('hidden', !toggleHex.checked);
    renderVisibleLines();
  });

  toggleAscii.addEventListener('change', () => {
    asciiHeader.classList.toggle('hidden', !toggleAscii.checked);
    renderVisibleLines();
  });

  editHexInput.oninput = () => {
    const val = editHexInput.value.toUpperCase();
    if (/^[0-9A-F]{0,2}$/.test(val)) {
      if (val.length === 2) {
        const byte = parseInt(val, 16);
        editAsciiInput.value = (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
      }
    } else {
      editHexInput.value = val.replace(/[^0-9A-F]/g, '');
    }
  };

  editAsciiInput.oninput = () => {
    const val = editAsciiInput.value;
    if (val.length === 1) {
      const byte = val.charCodeAt(0);
      editHexInput.value = byte.toString(16).padStart(2, '0').toUpperCase();
    }
  };

  saveEdit.onclick = () => {
    if (selectedOffset !== null && bufferManager) {
      const byte = parseInt(editHexInput.value, 16);
      bufferManager.setByte(selectedOffset, byte);
      renderVisibleLines();
      editModal.close();
      showMessage('Byte updated', { type: 'info', timeoutMs: 2000 });
    }
  };

  cancelEdit.onclick = () => editModal.close();
  btnReset.onclick = resetTool;

  downloadBtn.onclick = async () => {
    if (!bufferManager || !currentFile) return;

    showProgress('Creating file...');
    await yieldToUI(true);

    try {
      const buffer = await bufferManager.getFullBuffer();
      await downloadFile(buffer, `edited_${currentFile.name}`);
      showMessage('File ready for download', { type: 'info' });
    } catch (e) {
      console.error(e);
      showMessage('Export failed', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  setupFileDropzone('hex-dropzone', 'hex-file-input', (files) => {
    if (files.length > 0) updateFileInfo(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    updateFileInfo(payload.sharedFiles[0]);
  }

  window.addEventListener('resize', renderVisibleLines);

  return () => {
    window.removeEventListener('resize', renderVisibleLines);
    worker.terminate();
  };
}
