import { downloadFile, setupFileDropzone } from '../../js/file-utils';
import { hideProgress, showMessage, showProgress, yieldToUI } from '../../js/ui';
import { identifyFileType } from '../../js/magic-bytes';
import {
  BYTES_PER_LINE,
  formatAscii,
  formatHex,
  HexBufferManager,
  scanForStrings,
} from './hex-utils';
import type { SharedFilesPayload } from '../../js/share-target';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const dropzone = document.getElementById('hex-dropzone')!;
  const fileInput = document.getElementById('hex-file-input') as HTMLInputElement;
  const fileInfoHeader = document.getElementById('file-info-header')!;
  const editorContainer = document.getElementById('editor-container')!;

  const hexViewer = document.getElementById('hex-viewer')!;
  const hexKeyboardInput = document.getElementById('hex-keyboard-input') as HTMLInputElement;
  const hexVisibleRows = document.getElementById('hex-visible-rows')!;
  const hexStretcher = document.getElementById('hex-stretcher')!;
  const hexViewerOverlay = document.getElementById('hex-viewer-overlay')!;

  const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  const infoFilename = document.getElementById('info-filename')!;
  const infoType = document.getElementById('info-type')!;
  const infoSize = document.getElementById('info-size')!;

  const toggleAscii = document.getElementById('toggle-ascii') as HTMLInputElement;

  // Strings modal elements
  const showStringsBtn = document.getElementById('show-strings-btn') as HTMLButtonElement | null;
  const stringsModal = document.getElementById('strings-modal') as HTMLDialogElement | null;
  const stringsMinLenInput = document.getElementById('strings-minlen') as HTMLInputElement | null;
  const stringsScanBtn = document.getElementById('strings-scan-btn') as HTMLButtonElement | null;
  const stringsCancelBtn = document.getElementById(
    'strings-cancel-btn'
  ) as HTMLButtonElement | null;
  const stringsClose = document.getElementById('strings-close') as HTMLButtonElement | null;
  const stringsDownload = document.getElementById('strings-download') as HTMLButtonElement | null;
  const stringsResults = document.getElementById('strings-results') as HTMLElement | null;
  const stringsResultsBody = document.getElementById('strings-results-body') as HTMLElement | null;
  const stringsProgress = document.getElementById('strings-progress') as HTMLElement | null;

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
  let searchMatch: { offset: number; length: number } | null = null;

  // Strings scan state
  let stringsAbort = false;
  let stringsAbortController: AbortController | null = null;
  // Each entry contains the file offset and the discovered string
  let lastStringsResult: { offset: number; text: string }[] = [];

  // Editing State
  let editingNybble: 'high' | 'low' | null = null;
  let pendingValue: number = 0;

  // Virtual Scroll State
  const LINE_HEIGHT = 21;
  const ROWS_TO_RENDER = 50;
  let totalLines = 0;
  let lastStartLine = -1;
  let isRendering = false;
  let pendingRenderCall: boolean = false;

  const safeFocusNoScroll = (el: HTMLElement) => {
    try {
      // try modern API first
      (el as any).focus({ preventScroll: true });
    } catch (e) {
      // fallback
      el.focus();
    }
  };

  // scanForStrings moved to hex-utils.ts and imported above. We use an AbortController to cancel.

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

      infoSize.textContent =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
          : `${file.size.toLocaleString()} bytes`;

      const idBuffer = await bufferManager.getRange(0, 64 * 1024);
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
      searchMatch = null;
      editingNybble = null;
      hexViewer.scrollTop = 0;
      updateStatus();
      await renderVisibleLines(true);

      setTimeout(() => safeFocusNoScroll(hexKeyboardInput), 100);
      fileInfoHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      showMessage('Error analyzing file', { type: 'alert' });
    } finally {
      hideProgress();
    }
  };

  const renderVisibleLines = async (force = false) => {
    if (!bufferManager) return;
    if (isRendering) {
      pendingRenderCall = true;
      return;
    }

    const scrollTop = hexViewer.scrollTop;
    const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 5);

    if (!force && startLine === lastStartLine) return;

    lastStartLine = startLine;
    isRendering = true;
    pendingRenderCall = false;

    // Show loading if reading from disk might take time (e.g. fast scroll)
    const overlayTimeout = setTimeout(() => {
      if (isRendering) {
        hexViewerOverlay.classList.remove('opacity-0');
        hexViewerOverlay.classList.add('opacity-100');
      }
    }, 150);

    try {
      const endLine = Math.min(totalLines, startLine + ROWS_TO_RENDER);
      const startOffset = startLine * BYTES_PER_LINE;
      const bytesToRead = Math.min(
        (endLine - startLine) * BYTES_PER_LINE,
        bufferManager.totalSize - startOffset
      );

      if (bytesToRead > 0) {
        const buffer = await bufferManager.getRange(startOffset, bytesToRead);
        const rowsHtml = [];

        for (let i = 0; i < endLine - startLine; i++) {
          const lineIndex = startLine + i;
          if (lineIndex >= totalLines) break;

          const lineOffset = lineIndex * BYTES_PER_LINE;
          const byteStart = i * BYTES_PER_LINE;
          const byteChunk = buffer.slice(byteStart, byteStart + BYTES_PER_LINE);
          if (byteChunk.length === 0) break;

          let hexCells = '';
          for (let j = 0; j < BYTES_PER_LINE; j++) {
            const off = lineOffset + j;
            if (j < byteChunk.length) {
              const isSelected = off === selectedOffset;
              const isMatch =
                searchMatch &&
                off >= searchMatch.offset &&
                off < searchMatch.offset + searchMatch.length;

              let cls = 'w-6 text-center hex-byte cursor-pointer transition-colors ';
              if (isSelected) {
                cls += 'focused ';
                if (editingNybble === 'high') cls += 'editing-high ';
                else if (editingNybble === 'low') cls += 'editing-low ';
              } else if (isMatch) {
                cls += 'search-match ';
                if (off === searchMatch!.offset) cls += 'search-match-flare ';
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
            <div class="flex items-center hover:bg-base-200 px-2 group" style="height: ${LINE_HEIGHT}px;">
              <div class="px-2 shrink-0 text-primary text-[10px] font-bold select-none">${lineOffset.toString(16).padStart(8, '0').toUpperCase()}</div>
              <div class="flex-1 flex justify-center gap-1 sm:gap-2">
                ${hexCells}
              </div>
              <div class="ps-2 w-40 shrink-0 flex justify-center text-secondary tracking-[0.2em] select-none text-xs ${toggleAscii.checked ? '' : 'hidden'}">
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
    } catch (err) {
      console.error('Render error:', err);
    } finally {
      clearTimeout(overlayTimeout);
      hexViewerOverlay.classList.remove('opacity-100');
      hexViewerOverlay.classList.add('opacity-0');
      isRendering = false;
      if (pendingRenderCall) {
        renderVisibleLines();
      }
    }
  };

  const updateStatus = () => {
    if (selectedOffset !== null) {
      statusSelection.textContent = `Offset: 0x${selectedOffset.toString(16).padStart(8, '0').toUpperCase()} (${selectedOffset.toLocaleString()})`;
    }
    statusStats.textContent = `Size: ${currentFile?.size.toLocaleString() ?? 0} bytes`;
  };

  const scrollToOffset = (offset: number) => {
    const row = Math.floor(offset / BYTES_PER_LINE);
    hexViewer.scrollTop = Math.max(0, row * LINE_HEIGHT - hexViewer.clientHeight / 2);
    renderVisibleLines(true);
    updateStatus();
    safeFocusNoScroll(hexKeyboardInput);
  };

  const performSearch = async (startAt: number = 0) => {
    if (!bufferManager || !searchInput.value) return;

    let pattern: Uint8Array;
    if (searchType.value === 'hex') {
      const hex = searchInput.value.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 0) {
        showMessage('Invalid hex pattern', { type: 'alert' });
        return;
      }
      if (hex.length % 2 !== 0) {
        showMessage('Hex search must be even length', { type: 'alert' });
        return;
      }
      pattern = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    } else {
      pattern = new TextEncoder().encode(searchInput.value);
    }

    showProgress('Searching...');
    await yieldToUI(true);

    try {
      const result = await bufferManager.find(pattern, startAt, { ignoreCase: true });

      if (result !== -1) {
        searchMatch = { offset: result, length: pattern.length };
        selectedOffset = result;
        scrollToOffset(result);
      } else {
        if (startAt > 0) {
          const wrapResult = await bufferManager.find(pattern, 0, { ignoreCase: true });
          if (wrapResult !== -1) {
            searchMatch = { offset: wrapResult, length: pattern.length };
            selectedOffset = wrapResult;
            scrollToOffset(wrapResult);
            return;
          }
        }
        searchMatch = null;
        showMessage('Pattern not found');
        renderVisibleLines(true);
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
          hexViewer.scrollTop = logicalTop + LINE_HEIGHT - hexViewer.clientHeight;
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
      searchMatch = null;
      updateStatus();
      renderVisibleLines(true);
      safeFocusNoScroll(hexKeyboardInput);
    }
  };

  // Open editor on double-click
  hexVisibleRows.ondblclick = async (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('hex-byte') && target.dataset.offset) {
      const off = parseInt(target.dataset.offset);
      selectedOffset = off;
      searchMatch = null;
      updateStatus();
      renderVisibleLines(true);
      await openEditModal(off);
    }
  };

  hexViewer.onclick = (e) => {
    const target = (e as MouseEvent).target as HTMLElement | null;
    if (!target) return;
    if (target.classList && target.classList.contains('hex-byte')) return;
    safeFocusNoScroll(hexKeyboardInput);
  };

  const processEditorKey = (e: KeyboardEvent) => {
    if (!bufferManager || selectedOffset === null || editModal.open) return false;

    const active = document.activeElement as HTMLElement | null;
    if (active === searchInput) return false;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
      active !== hexKeyboardInput
    )
      return false;

    let handled = true;
    switch (e.key) {
      case 'ArrowRight':
        selectedOffset = Math.min(bufferManager.totalSize - 1, selectedOffset + 1);
        editingNybble = null;
        searchMatch = null;
        break;
      case 'ArrowLeft':
        selectedOffset = Math.max(0, selectedOffset - 1);
        editingNybble = null;
        searchMatch = null;
        break;
      case 'ArrowDown':
        selectedOffset = Math.min(bufferManager.totalSize - 1, selectedOffset + BYTES_PER_LINE);
        editingNybble = null;
        searchMatch = null;
        break;
      case 'ArrowUp':
        selectedOffset = Math.max(0, selectedOffset - BYTES_PER_LINE);
        editingNybble = null;
        searchMatch = null;
        break;
      case 'PageDown':
        selectedOffset = Math.min(
          bufferManager.totalSize - 1,
          selectedOffset + BYTES_PER_LINE * (Math.floor(hexViewer.clientHeight / LINE_HEIGHT) - 2)
        );
        editingNybble = null;
        searchMatch = null;
        break;
      case 'PageUp':
        selectedOffset = Math.max(
          0,
          selectedOffset - BYTES_PER_LINE * (Math.floor(hexViewer.clientHeight / LINE_HEIGHT) - 2)
        );
        editingNybble = null;
        searchMatch = null;
        break;
      case 'Home':
        selectedOffset = 0;
        editingNybble = null;
        searchMatch = null;
        break;
      case 'End':
        selectedOffset = bufferManager.totalSize - 1;
        editingNybble = null;
        searchMatch = null;
        break;
      case 'Enter':
        openEditModal(selectedOffset);
        break;
      case 'Escape':
        editingNybble = null;
        searchMatch = null;
        renderVisibleLines(true);
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      updateStatus();

      const logicalTop = Math.floor(selectedOffset / BYTES_PER_LINE) * LINE_HEIGHT;
      const viewTop = hexViewer.scrollTop;
      const viewBottom = viewTop + hexViewer.clientHeight;

      if (logicalTop < viewTop) hexViewer.scrollTop = logicalTop;
      else if (logicalTop + LINE_HEIGHT > viewBottom)
        hexViewer.scrollTop = logicalTop + LINE_HEIGHT - hexViewer.clientHeight;

      renderVisibleLines(true);
      return true;
    }

    // Handle hex typing for inline edit
    if (/^[0-9a-fA-F]$/.test(e.key)) {
      const digit = parseInt(e.key, 16);
      if (editingNybble === null) {
        editingNybble = 'high';
        pendingValue = digit << 4;
        searchMatch = null;
        renderVisibleLines(true);
      } else if (editingNybble === 'high') {
        pendingValue = (pendingValue & 0xf0) | digit;
        commitByte();
      }
      e.preventDefault();
      return true;
    }

    return false;
  };

  hexKeyboardInput.onkeydown = (e) => processEditorKey(e as unknown as KeyboardEvent);
  // Ensure the hidden input stays empty (prevents mobile suggestions/accumulation)
  hexKeyboardInput.oninput = () => {
    hexKeyboardInput.value = '';
  };

  let scrollReq = 0;
  hexViewer.onscroll = () => {
    if (scrollReq) cancelAnimationFrame(scrollReq);
    scrollReq = requestAnimationFrame(() => {
      renderVisibleLines();
      scrollReq = 0;
    });
  };

  const openEditModal = async (offset: number) => {
    if (!bufferManager) return;
    const byte = await bufferManager.getByte(offset);
    editHexInput.value = formatHex(byte);
    editAsciiInput.value = formatAscii(byte);
    editModal.showModal();
    setTimeout(() => {
      try {
        (editHexInput as any).focus({ preventScroll: true });
      } catch (e) {
        editHexInput.focus();
      }
      editHexInput.select();
    }, 10);
  };

  saveEdit.onclick = () => {
    if (selectedOffset !== null && bufferManager) {
      const val = parseInt(editHexInput.value, 16);
      if (!isNaN(val)) {
        bufferManager.setByte(selectedOffset, val);
        renderVisibleLines(true);
        editModal.close();
        safeFocusNoScroll(hexKeyboardInput);
      }
    }
  };

  cancelEdit.onclick = () => {
    editModal.close();
    safeFocusNoScroll(hexKeyboardInput);
  };

  searchBtn.onclick = () => performSearch(0);
  searchNext.onclick = () => performSearch((selectedOffset ?? 0) + 1);
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') performSearch(0);
  };

  toggleAscii.onchange = () => {
    const hdr = document.getElementById('ascii-header');
    if (hdr) hdr.classList.toggle('hidden', !toggleAscii.checked);
    renderVisibleLines(true);
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

  btnReset.onclick = () => {
    currentFile = null;
    bufferManager = null;
    selectedOffset = null;
    searchMatch = null;
    lastStartLine = -1;
    fileInfoHeader.classList.add('hidden');
    editorContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    fileInput.value = '';
    hexVisibleRows.innerHTML = '';
    hexStretcher.style.height = '0';
  };

  // Strings modal handlers
  if (showStringsBtn && stringsModal && stringsScanBtn && stringsResults && stringsProgress) {
    showStringsBtn.onclick = () => {
      if (!currentFile) {
        showMessage('No file loaded', { type: 'warning' });
        return;
      }
      // reset UI
      if (stringsResultsBody) stringsResultsBody.innerHTML = '';
      if (!stringsModal.open) stringsModal.showModal();
    };

    const stopScan = () => {
      stringsAbort = true;
      if (stringsAbortController) {
        stringsAbortController.abort();
        stringsAbortController = null;
      }
      if (stringsProgress) stringsProgress.textContent = 'Cancelled';
    };

    stringsCancelBtn!.onclick = () => {
      stopScan();
    };

    stringsClose!.onclick = () => {
      stopScan();
      if (stringsModal && stringsModal.open) stringsModal.close();
    };

    stringsScanBtn.onclick = async () => {
      if (!bufferManager || !stringsResultsBody) return;
      const minLen = Math.max(1, parseInt(stringsMinLenInput?.value || '4', 10));
      stringsResultsBody.innerHTML = '';
      stringsProgress.textContent = 'Scanning...';
      lastStringsResult = [];
      stringsAbort = false;
      stringsAbortController = new AbortController();

      const addResultToUI = (r: { offset: number; text: string }) => {
        const tr = document.createElement('tr');
        tr.className = 'hover cursor-pointer';
        tr.innerHTML = `
          <td class="font-bold text-primary">0x${r.offset.toString(16).toUpperCase().padStart(8, '0')}</td>
          <td class="break-all whitespace-pre-wrap">${r.text}</td>
        `;
        tr.onclick = () => {
          scrollToOffset(r.offset);
          selectedOffset = r.offset;
          updateStatus();
          renderVisibleLines(true);
          if (stringsModal && stringsModal.open) stringsModal.close();
        };
        stringsResultsBody.appendChild(tr);
      };

      try {
        const results = await scanForStrings(bufferManager, minLen, {
          signal: stringsAbortController.signal,
          onProgress: (p) => {
            stringsProgress.textContent = `Scanned ${p.scanned.toLocaleString()} / ${p.total.toLocaleString()} bytes`;
          },
          onResult: (r) => {
            lastStringsResult.push(r);
            // update partial results in the UI
            if (lastStringsResult.length <= 1000) {
              addResultToUI(r);
              if (stringsResults) stringsResults.scrollTop = stringsResults.scrollHeight;
            }
          },
        });

        if (stringsAbort || stringsAbortController?.signal.aborted) {
          stringsProgress.textContent = 'Cancelled';
        } else {
          stringsProgress.textContent = `Found ${results.length.toLocaleString()} strings`;
          if (results.length > 1000) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="2" class="text-center opacity-50 italic">... and ${(results.length - 1000).toLocaleString()} more results (download to see all)</td>`;
            stringsResultsBody.appendChild(tr);
          }
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          stringsProgress.textContent = 'Cancelled';
        } else {
          console.error('Strings scan failed', err);
          stringsProgress.textContent = 'Error';
          showMessage('Strings scan failed', { type: 'alert' });
        }
      } finally {
        stringsAbortController = null;
      }
    };

    stringsDownload!.onclick = () => {
      if (!lastStringsResult || lastStringsResult.length === 0) {
        showMessage('No strings to download', { type: 'warning' });
        return;
      }
      const lines = lastStringsResult.map(
        (r) => `${r.offset.toString(16).padStart(8, '0').toUpperCase()}: ${r.text}`
      );
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      downloadFile(blob, `${currentFile?.name || 'strings'}.strings.txt`);
    };
  }

  setupFileDropzone('hex-dropzone', 'hex-file-input', (files) => {
    updateFileInfo(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    updateFileInfo(payload.sharedFiles[0]);
  }

  return () => {
    hexKeyboardInput.onkeydown = null;
    hexKeyboardInput.oninput = null;
    hexViewer.onclick = null;
    hexViewer.onscroll = null;
  };
}
