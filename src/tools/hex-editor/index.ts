import { setupFileDropzone, downloadFile } from '../../js/file-utils';
import { showProgress, showMessage } from '../../js/ui';
import { identifyFileType } from './magic-bytes';
import { HexBufferManager, BYTES_PER_LINE, formatHex, formatAscii } from './hex-utils';
import type { SharedFilesPayload } from '../../js/share-target';

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

  // Virtual Scrolling State
  const LINE_HEIGHT = 20;
  let totalLines = 0;

  const updateFileInfo = async (file: File) => {
    currentFile = file;
    bufferManager = new HexBufferManager(file);

    fileInfo.classList.remove('hidden');
    editorContainer.classList.remove('hidden');
    dropzone.classList.add('hidden');

    infoFilename.textContent = file.name;
    infoSize.textContent = `${file.size.toLocaleString()} bytes`;
    infoModified.textContent = new Date(file.lastModified).toLocaleString();

    // Identify type
    const firstChunk = await bufferManager.getRange(0, 16);
    const id = identifyFileType(firstChunk);
    if (id) {
      infoType.textContent = id.name;
      infoType.className = 'badge badge-primary';
    } else {
      infoType.textContent = 'Unknown Type';
      infoType.className = 'badge badge-ghost';
    }

    totalLines = Math.ceil(file.size / BYTES_PER_LINE);
    hexContent.style.height = `${totalLines * LINE_HEIGHT}px`;

    renderVisibleLines();
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

  const renderLine = (lineIndex: number, bytes: Uint8Array) => {
    const offset = lineIndex * BYTES_PER_LINE;
    const lineDiv = document.createElement('div');
    lineDiv.className = 'flex items-center hover:bg-base-200 px-4 group';
    lineDiv.style.height = `${LINE_HEIGHT}px`;
    lineDiv.style.position = 'absolute';
    lineDiv.style.top = `${lineIndex * LINE_HEIGHT}px`;
    lineDiv.style.width = '100%';

    // Offset
    const offsetDiv = document.createElement('div');
    offsetDiv.className = 'w-16 sm:w-20 shrink-0 text-primary opacity-50 text-[10px] sm:text-xs font-bold';
    offsetDiv.textContent = offset.toString(16).padStart(8, '0').toUpperCase();
    lineDiv.appendChild(offsetDiv);

    // Hex
    const hexContainer = document.createElement('div');
    hexContainer.className = 'flex-1 flex justify-center gap-1 sm:gap-2 hex-col';
    if (!toggleHex.checked) hexContainer.classList.add('hidden');

    for (let i = 0; i < BYTES_PER_LINE; i++) {
      const byteSpan = document.createElement('span');
      byteSpan.className = 'cursor-pointer hover:text-primary transition-colors w-5 text-center';
      if (i < bytes.length) {
        const currentOffset = offset + i;
        byteSpan.textContent = formatHex(bytes[i]);
        byteSpan.dataset.offset = currentOffset.toString();
        byteSpan.onclick = () => openEditModal(currentOffset, bytes[i]);
      } else {
        byteSpan.textContent = '  ';
      }
      hexContainer.appendChild(byteSpan);
    }
    lineDiv.appendChild(hexContainer);

    // ASCII
    const asciiDiv = document.createElement('div');
    asciiDiv.className = 'w-32 sm:w-48 shrink-0 flex justify-center text-secondary opacity-70 ascii-col';
    if (!toggleAscii.checked) asciiDiv.classList.add('hidden');

    let asciiStr = '';
    for (let i = 0; i < bytes.length; i++) {
      asciiStr += formatAscii(bytes[i]);
    }
    asciiDiv.textContent = asciiStr;
    lineDiv.appendChild(asciiDiv);

    return lineDiv;
  };

  const renderVisibleLines = async () => {
    if (!bufferManager) return;

    const scrollTop = hexViewer.scrollTop;
    const containerHeight = hexViewer.clientHeight;

    const startLine = Math.floor(scrollTop / LINE_HEIGHT);
    const endLine = Math.min(totalLines, Math.ceil((scrollTop + containerHeight) / LINE_HEIGHT) + 1);

    // Clear content but keep height
    hexContent.innerHTML = '';

    const linesToRead = endLine - startLine;
    if (linesToRead <= 0) return;

    const startOffset = startLine * BYTES_PER_LINE;
    const bytesToRead = Math.min(linesToRead * BYTES_PER_LINE, bufferManager.totalSize - startOffset);

    const buffer = await bufferManager.getRange(startOffset, bytesToRead);

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < linesToRead; i++) {
      const lineIndex = startLine + i;
      const lineOffset = i * BYTES_PER_LINE;
      if (lineOffset >= buffer.length) break;

      const lineBytes = buffer.slice(lineOffset, lineOffset + BYTES_PER_LINE);
      fragment.appendChild(renderLine(lineIndex, lineBytes));
    }

    hexContent.appendChild(fragment);
    statusStats.textContent = `Visible: ${buffer.length} bytes (of ${currentFile?.size.toLocaleString()})`;
  };

  const openEditModal = (offset: number, value: number) => {
    selectedOffset = offset;
    editHexInput.value = formatHex(value);
    editAsciiInput.value = formatAscii(value);
    statusSelection.textContent = `Offset: 0x${offset.toString(16).padStart(8, '0').toUpperCase()}`;
    editModal.showModal();
  };

  // Listeners
  hexViewer.addEventListener('scroll', () => {
    renderVisibleLines();
  });

  toggleHex.addEventListener('change', () => {
    const cols = document.querySelectorAll('.hex-col');
    cols.forEach(c => c.classList.toggle('hidden', !toggleHex.checked));
    hexHeader.classList.toggle('hidden', !toggleHex.checked);
  });

  toggleAscii.addEventListener('change', () => {
    const cols = document.querySelectorAll('.ascii-col');
    cols.forEach(c => c.classList.toggle('hidden', !toggleAscii.checked));
    asciiHeader.classList.toggle('hidden', !toggleAscii.checked);
  });

  editHexInput.oninput = () => {
    const val = editHexInput.value.toUpperCase();
    if (/^[0-9A-F]{0,2}$/.test(val)) {
      if (val.length === 2) {
        const byte = parseInt(val, 16);
        editAsciiInput.value = formatAscii(byte);
      }
    } else {
      editHexInput.value = val.replace(/[^0-9A-F]/g, '');
    }
  };

  editAsciiInput.oninput = () => {
    const val = editAsciiInput.value;
    if (val.length === 1) {
      const byte = val.charCodeAt(0);
      editHexInput.value = formatHex(byte);
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

    showProgress('Preparing download...');
    try {
      const buffer = await bufferManager.getFullBuffer();
      await downloadFile(buffer, `edited_${currentFile.name}`);
      showMessage('File downloaded', { type: 'info' });
    } catch (e) {
      showMessage('Download failed', { type: 'alert' });
    } finally {
      showProgress('done', { visible: false });
    }
  };

  // Tool Initialization
  setupFileDropzone('hex-dropzone', 'hex-file-input', (files) => {
    if (files.length > 0) updateFileInfo(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    updateFileInfo(payload.sharedFiles[0]);
  }

  // Handle window resize for virtual scroll update
  window.addEventListener('resize', renderVisibleLines);

  return () => {
    window.removeEventListener('resize', renderVisibleLines);
  };
}
