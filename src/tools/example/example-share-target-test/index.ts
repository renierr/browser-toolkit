import { showMessage } from '../../../js/ui';
import { setupFileDropzone } from '../../../js/file-utils.ts';
import type { SharedFilesPayload } from '../../../js/share-target';
import { findAllToolsForMimeTypes } from '../../../js/share-target';
import { showToolChooser } from '../../../js/tool-chooser';
import router from '../../../js/router';
import { tools } from '../../../js/tools';

interface SharedFileItem {
  id: string;
  file: File;
  previewUrl?: string;
}

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const fileList = document.getElementById('file-list') as HTMLTableSectionElement;
  const receivedFilesContainer = document.getElementById(
    'received-files-container'
  ) as HTMLDivElement;
  const sharedTextContainer = document.getElementById('shared-text-container') as HTMLDivElement;
  const sharedTextContent = document.getElementById('shared-text-content') as HTMLDivElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const simulateShareBtn = document.getElementById('simulate-share-btn') as HTMLButtonElement;
  const debugInfo = document.getElementById('debug-info') as HTMLPreElement;

  let files: SharedFileItem[] = [];

  const logDebug = (msg: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const line = `[${timestamp}] ${msg} ${data ? JSON.stringify(data) : ''}\n`;
    debugInfo.textContent += line;
    console.log(`[ShareTargetTest] ${msg}`, data || '');
  };

  const renderFiles = () => {
    fileList.innerHTML = '';
    files.forEach((item) => {
      const row = document.createElement('tr');

      const sizeStr = (item.file.size / 1024).toFixed(2) + ' KB';

      row.innerHTML = `
        <td>
          <div class="flex items-center gap-2">
            ${item.previewUrl ? `<img alt="Preview" src="${item.previewUrl}" class="w-8 h-8 object-cover rounded" />` : ''}
            <span class="font-medium truncate max-w-37.5" title="${item.file.name}">${item.file.name}</span>
          </div>
        </td>
        <td class="text-sm opacity-70">${item.file.type || 'unknown'}</td>
        <td class="text-sm opacity-70">${sizeStr}</td>
        <td>
          <button class="btn btn-ghost btn-xs text-error remove-btn" data-id="${item.id}">
            Remove
          </button>
        </td>
      `;
      fileList.appendChild(row);
    });

    receivedFilesContainer.classList.toggle('hidden', files.length === 0);
  };

  const addFiles = (newFiles: FileList | File[] | null) => {
    if (!newFiles || newFiles.length === 0) return;

    logDebug(`Received ${newFiles.length} files`);

    const items: SharedFileItem[] = Array.from(newFiles).map((file) => {
      const isImage = file.type.startsWith('image/');
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      };
    });

    files = [...files, ...items];
    renderFiles();
    showMessage(`Added ${items.length} files`, { type: 'info', timeoutMs: 3000 });
  };

  // Setup manual dropzone
  setupFileDropzone('drop-zone', 'file-input', (droppedFiles) => {
    logDebug('Files dropped/selected manually');
    addFiles(droppedFiles);
  });

  // Handle payload from Share Target API
  if (payload) {
    logDebug('Received payload on init', {
      fileCount: payload.sharedFiles?.length,
      mimeTypes: payload.mimeTypes,
      hasText: !!payload.text,
    });

    if (payload.sharedFiles?.length) {
      addFiles(payload.sharedFiles);
    }

    if (payload.text) {
      sharedTextContainer.classList.remove('hidden');
      sharedTextContent.textContent = payload.text;
    }
  } else {
    logDebug('No payload received on init');
  }

  // Event Listeners
  fileList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const removeBtn = target.closest('.remove-btn') as HTMLButtonElement;
    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const index = files.findIndex((f) => f.id === id);
      if (index !== -1) {
        if (files[index].previewUrl) {
          URL.revokeObjectURL(files[index].previewUrl!);
        }
        files.splice(index, 1);
        renderFiles();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    files = [];
    renderFiles();
    sharedTextContainer.classList.add('hidden');
    sharedTextContent.textContent = '';
    logDebug('Cleared all files and text');
  });

  simulateShareBtn.addEventListener('click', async () => {
    if (files.length === 0) {
      showMessage('No files to share', { type: 'warning' });
      return;
    }

    const filesToShare = files.map((f) => f.file);
    const mimeTypes = filesToShare.map((f) => f.type);

    logDebug('Simulating share with files', { count: filesToShare.length, mimeTypes });

    const matchingTools = findAllToolsForMimeTypes(tools, mimeTypes);

    if (matchingTools.length === 0) {
      showMessage('No tools found that can handle these files', { type: 'warning' });
      return;
    }

    const selectedTool = await showToolChooser(matchingTools, filesToShare);

    if (selectedTool) {
      logDebug('Tool selected', selectedTool.name);
      const payload: SharedFilesPayload = {
        sharedFiles: filesToShare,
        mimeTypes: mimeTypes,
      };
      router.goTo(selectedTool.path, payload);
    } else {
      logDebug('Tool selection cancelled');
    }
  });

  return () => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
  };
}
