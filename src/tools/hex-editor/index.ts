import { setupFileDropzone, downloadFile } from '../../js/file-utils';
import { showProgress, showMessage, yieldToUI, hideProgress } from '../../js/ui';
import { identifyFileType } from './magic-bytes';
import { HexBufferManager, BYTES_PER_LINE, formatHex, formatAscii } from './hex-utils';
import type { SharedFilesPayload } from '../../js/share-target';

export default function init(payload?: SharedFilesPayload) {
  const dropzone = document.getElementById('hex-dropzone')!;
  const fileInput = document.getElementById('hex-file-input') as HTMLInputElement;
  const fileInfoHeader = document.getElementById('file-info-header')!;
  const editorContainer = document.getElementById('editor-container')!;

  const hexViewer = document.getElementById('hex-viewer')!;
  const hexVisibleRows = document.getElementById('hex-visible-rows')!;
  const hexStretcher = document.getElementById('hex-stretcher')!;

  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  const infoFilename = document.getElementById('info-filename')!;
  const infoType = document.getElementById('info-type')!;
  const infoSize = document.getElementById('info-size')!;

  const toggleAscii = document.getElementById('toggle-ascii') as HTMLInputElement;
  const asciiHeader = document.getElementById('ascii-header')!;

  const statusSelection = document.getElementById('status-selection')!;
  const statusStats = document.getElementById('status-stats')!;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchType = document.getElementById('search-type') as HTMLSelectElement;
  const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
  const searchNext = document.getElementById('search-next') as HTMLButtonElement;

  const editModal = document.getElementById('edit-modal') as HTMLDialogElement;
  const editHexInput = document.getElementById('edit-hex-input') as HTMLInputElement;
  const editAsciiInput = document.getElementById('edit-ascii-input') as HTMLInputElement;
  const cancelEdit = document.getElementById('cancel-edit')!;
  const saveEdit = document.getElementById('save-edit')!;

  let bufferManager: HexBufferManager | null = null;
  let currentFile: File | null = null;
  let selectedOffset: number | null = null;

  // Editing State
  let editingNybble: 'high' | 'low' | null = null;
  let pendingValue: number = 0;

  // Virtual Scroll State
  const LINE_HEIGHT = 21;
  const ROWS_TO_RENDER = 50;
  let totalLines = 0;
  let lastStartLine = -1;
  let isRendering = false;

  const updateFileInfo = async (file: File) => {
    showProgress('Analyzing file...');
    await yieldToUI(true);

    try {
      currentFile = file;
      bufferManager = new HexBufferManager(file);

      fileInfoHeader.classList.remove('hidden');
      editorContainer.classList.remove('hidden');
      dropzone.classList.add('hidden');

      infoFilename.textContent = file.name;
      const sizeText = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${file.size.toLocaleString()} bytes`;
      infoSize.textContent = sizeText;

      // Identify type with a larger buffer for offset-based detection
      const idBuffer = await bufferManager.getRange(0, 64 * 1024); // Check up to 64KB for ISO/etc
      const id = identifyFileType(idBuffer);
      if (id) {
        infoType.textContent = id.name;
      } else {
        infoType.textContent = 'Binary / Unknown';
      }

      totalLines = Math.ceil(file.size / BYTES_PER_LINE);
      hexStretcher.style.height = `${totalLines * LINE_HEIGHT}px`;

      lastStartLine = -1;
      selectedOffset = 0;
      editingNybble = null;
      hexViewer.scrollTop = 0;
      updateStatus();
      await renderVisibleLines(true);

      setTimeout(() => hexViewer.focus(), 100);
    } catch (err) {
      console.error(err);
      showMessage('Error analyzing file', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  const renderVisibleLines = async (force = false) => {
    if (!bufferManager || isRendering) return;

    const scrollTop = hexViewer.scrollTop;
    const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 5);

    if (!force && startLine === lastStartLine) return;
    lastStartLine = startLine;
    isRendering = true;

    try {
      const endLine = Math.min(totalLines, startLine + ROWS_TO_RENDER);
      const startOffset = startLine * BYTES_PER_LINE;
      const bytesToRead = Math.min((endLine - startLine) * BYTES_PER_LINE, bufferManager.totalSize - startOffset);

      if (bytesToRead > 0) {
        const buffer = await bufferManager.getRange(startOffset, bytesToRead);
        const rowsHtml = [];

        for (let i = 0; i < (endLine - startLine); i++) {
          const lineIndex = startLine + i;
          const lineOffset = lineIndex * BYTES_PER_LINE;
          const byteChunk = buffer.slice(i * BYTES_PER_LINE, (i + 1) * BYTES_PER_LINE);
          if (byteChunk.length === 0) break;

          let hexCells = '';
          for (let j = 0; j < BYTES_PER_LINE; j++) {
            const off = lineOffset + j;
            if (j < byteChunk.length) {
              const isSelected = off === selectedOffset;
              let cls = 'w-6 text-center hex-byte cursor-pointer transition-colors ';
              if (isSelected) {
                cls += 'focused ';
                if (editingNybble === 'high') cls += 'editing-high ';
                else if (editingNybble === 'low') cls += 'editing-low ';
              }
              hexCells += `<span class="${cls}" data-offset="${off}">${formatHex(byteChunk[j])}</span>`;
            } else {
              hexCells += `<span class="w-6 opacity-0">  </span>`;
            }
          }

          let asciiStr = '';
          if (toggleAscii.checked) {
            for (let j = 0; j < byteChunk.length; j++) asciiStr += formatAscii(byteChunk[j]);
          }

          rowsHtml.push(`
            <div class="flex items-center hover:bg-base-200/40 px-6 group" style="height: ${LINE_HEIGHT}px;">
              <div class="w-24 shrink-0 text-primary opacity-50 text-[10px] font-bold select-none">${lineOffset.toString(16).padStart(8, '0').toUpperCase()}</div>
              <div class="flex-1 flex justify-center gap-1 sm:gap-2">
                ${hexCells}
              </div>
              <div class="w-40 shrink-0 flex justify-center text-secondary opacity-70 tracking-[0.2em] select-none text-xs ${toggleAscii.checked ? '' : 'hidden'}">
                ${asciiStr}
              </div>
            </div>
          `);
        }

        hexVisibleRows.style.transform = `translateY(${startLine * LINE_HEIGHT}px)`;
        hexVisibleRows.innerHTML = rowsHtml.join('');
      } else {
        hexVisibleRows.innerHTML = '';
      }
    } finally {
      isRendering = false;
    }
  };

  const updateStatus = () => {
    if (selectedOffset !== null) {
      statusSelection.textContent = `Offset: 0x${selectedOffset.toString(16).padStart(8, '0').toUpperCase()} (${selectedOffset.toLocaleString()})`;
    }
    statusStats.textContent = `Size: ${currentFile?.size.toLocaleString() ?? 0} bytes`;
  };

  const scrollToOffset = (offset: number) => {
    selectedOffset = offset;
    const row = Math.floor(offset / BYTES_PER_LINE);
    const scrollPos = Math.max(0, (row * LINE_HEIGHT) - (hexViewer.clientHeight / 2));
    hexViewer.scrollTop = scrollPos;
    renderVisibleLines(true);
    updateStatus();
    hexViewer.focus();
  };

  const performSearch = async (startAt: number = 0) => {
    if (!bufferManager || !searchInput.value) return;

    let pattern: Uint8Array;
    if (searchType.value === 'hex') {
      const hex = searchInput.value.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 0 || hex.length % 2 !== 0) {
        showMessage('Invalid hex pattern (must be even length)', { type: 'alert' });
        return;
      }
      pattern = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      pattern = new TextEncoder().encode(searchInput.value);
    }

    showProgress('Searching...');
    await yieldToUI(true);

    try {
      const result = await bufferManager.find(pattern, startAt, (percent) => {
        // Optional: update progress UI if needed
      });

      if (result !== -1) {
        scrollToOffset(result);
      } else {
        if (startAt > 0) {
          // Wrap around search
          const wrapResult = await bufferManager.find(pattern, 0);
          if (wrapResult !== -1) {
            scrollToOffset(wrapResult);
            return;
          }
        }
        showMessage('Pattern not found');
      }
    } finally {
      hideProgress();
    }
  };

  const commitByte = () => {
    if (selectedOffset !== null && bufferManager) {
      bufferManager.setByte(selectedOffset, pendingValue);
      editingNybble = null;

      if (selectedOffset < bufferManager.totalSize - 1) {
        selectedOffset++;
        const logicalTop = Math.floor(selectedOffset / BYTES_PER_LINE) * LINE_HEIGHT;
        const viewTop = hexViewer.scrollTop;
        const viewBottom = viewTop + hexViewer.clientHeight;
        if (logicalTop + LINE_HEIGHT > viewBottom) {
          hexViewer.scrollTop = (logicalTop + LINE_HEIGHT) - hexViewer.clientHeight;
        }
      }

      updateStatus();
      renderVisibleLines(true);
    }
  };

  hexVisibleRows.onclick = (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('hex-byte') && target.dataset.offset) {
      selectedOffset = parseInt(target.dataset.offset);
      editingNybble = null;
      updateStatus();
      renderVisibleLines(true);
      hexViewer.focus();
    }
  };

  hexViewer.onkeydown = async (e) => {
    if (!bufferManager || selectedOffset === null || editModal.open) return;
    if (e.target instanceof HTMLInputElement) return; // Don't steal search input focus

    let handled = true;
    switch (e.key) {
      case 'ArrowRight': selectedOffset = Math.min(bufferManager.totalSize - 1, selectedOffset + 1); editingNybble = null; break;
      case 'ArrowLeft': selectedOffset = Math.max(0, selectedOffset - 1); editingNybble = null; break;
      case 'ArrowDown': selectedOffset = Math.min(bufferManager.totalSize - 1, selectedOffset + BYTES_PER_LINE); editingNybble = null; break;
      case 'ArrowUp': selectedOffset = Math.max(0, selectedOffset - BYTES_PER_LINE); editingNybble = null; break;
      case 'PageDown': selectedOffset = Math.min(bufferManager.totalSize - 1, selectedOffset + BYTES_PER_LINE * (Math.floor(hexViewer.clientHeight / LINE_HEIGHT) - 2)); editingNybble = null; break;
      case 'PageUp': selectedOffset = Math.max(0, selectedOffset - BYTES_PER_LINE * (Math.floor(hexViewer.clientHeight / LINE_HEIGHT) - 2)); editingNybble = null; break;
      case 'Home': selectedOffset = 0; editingNybble = null; break;
      case 'End': selectedOffset = bufferManager.totalSize - 1; editingNybble = null; break;
      case 'Enter': openEditModal(selectedOffset); break;
      case 'Escape': editingNybble = null; renderVisibleLines(true); break;
      default: handled = false;
    }

    if (handled) {
      e.preventDefault();
      updateStatus();

      const logicalTop = Math.floor(selectedOffset / BYTES_PER_LINE) * LINE_HEIGHT;
      const viewTop = hexViewer.scrollTop;
      const viewBottom = viewTop + hexViewer.clientHeight;

      if (logicalTop < viewTop) hexViewer.scrollTop = logicalTop;
      else if (logicalTop + LINE_HEIGHT > viewBottom) hexViewer.scrollTop = (logicalTop + LINE_HEIGHT) - hexViewer.clientHeight;

      renderVisibleLines(true);
    } else if (/^[0-9a-fA-F]$/.test(e.key)) {
      const digit = parseInt(e.key, 16);
      if (editingNybble === null) {
        editingNybble = 'high';
        pendingValue = (digit << 4);
        renderVisibleLines(true);
      } else if (editingNybble === 'high') {
        pendingValue = (pendingValue & 0xF0) | digit;
        commitByte();
      }
      e.preventDefault();
    }
  };

  const openEditModal = async (offset: number) => {
    if (!bufferManager) return;
    const byte = await bufferManager.getByte(offset);
    editHexInput.value = formatHex(byte);
    editAsciiInput.value = formatAscii(byte);
    editModal.showModal();
    setTimeout(() => {
      editHexInput.focus();
      editHexInput.select();
    }, 10);
  };

  let scrollReq = 0;
  hexViewer.onscroll = () => {
    if (scrollReq) cancelAnimationFrame(scrollReq);
    scrollReq = requestAnimationFrame(() => {
      renderVisibleLines();
      scrollReq = 0;
    });
  };

  toggleAscii.onchange = () => {
    asciiHeader.classList.toggle('hidden', !toggleAscii.checked);
    renderVisibleLines(true);
  };

  searchBtn.onclick = () => performSearch(0);
  searchNext.onclick = () => performSearch((selectedOffset ?? 0) + 1);
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') performSearch(0);
  };

  saveEdit.onclick = () => {
    if (selectedOffset !== null && bufferManager) {
      const val = parseInt(editHexInput.value, 16);
      if (!isNaN(val)) {
        bufferManager.setByte(selectedOffset, val);
        renderVisibleLines(true);
        editModal.close();
        hexViewer.focus();
      }
    }
  };

  cancelEdit.onclick = () => {
    editModal.close();
    hexViewer.focus();
  };

  btnReset.onclick = () => {
    currentFile = null;
    bufferManager = null;
    selectedOffset = null;
    lastStartLine = -1;
    fileInfoHeader.classList.add('hidden');
    editorContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    fileInput.value = '';
    hexVisibleRows.innerHTML = '';
    hexStretcher.style.height = '0';
  };

  downloadBtn.onclick = async () => {
    if (!bufferManager || !currentFile) return;
    showProgress('Generating file...');
    await yieldToUI(true);
    try {
      const buf = await bufferManager.getFullBuffer();
      await downloadFile(buf, currentFile.name);
      showMessage('Export started');
    } catch (e) {
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

  return () => {
    hexViewer.onkeydown = null;
    hexViewer.onscroll = null;
    hexViewer.onclick = null;
  };
}
