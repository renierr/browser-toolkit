import { getSettings } from '../../js/settings';
import { showMessage } from '../../js/ui';
import { openInTool } from '../../js/tool-chooser';
import { setupFileDropzone } from '../../js/file-utils';

type Drop = {
  id: string;
  filename: string;
  size: number;
  type: string;
  source: string;
  uploaded_at: number;
  expires_at: number | null;
};

export default function init() {
  const container = document.querySelector('.tool-content') as HTMLElement;
  if (!container) return;

  const settings = getSettings('fast-drop');
  const cleanupSettings = settings.bind(container);

  const pasteBtn = container.querySelector('#paste-btn') as HTMLButtonElement;
  const refreshBtn = container.querySelector('#refresh-btn') as HTMLButtonElement;
  const filesContainer = container.querySelector('#files-container') as HTMLElement;
  const listLoading = container.querySelector('#list-loading') as HTMLElement;
  const listEmpty = container.querySelector('#list-empty') as HTMLElement;

  const previewModal = container.querySelector('#preview-modal') as HTMLDialogElement;
  const previewTitle = container.querySelector('#preview-title') as HTMLElement;
  const previewContent = container.querySelector('#preview-content') as HTMLElement;
  const previewDownloadBtn = container.querySelector('#preview-download-btn') as HTMLAnchorElement;

  const fetchFiles = async () => {
    listLoading.classList.remove('hidden');
    filesContainer.classList.add('hidden');
    listEmpty.classList.add('hidden');

    try {
      const resp = await fetch('/api/drop');
      const data = await resp.json();
      if (data.success) {
        renderFiles(data.drops);
      } else {
        showMessage('Failed to fetch files: ' + data.error, { type: 'alert' });
      }
    } catch (err) {
      console.error('[FastDrop] fetch error', err);
      showMessage('Backend server error. Is it running?', { type: 'alert' });
      listEmpty.classList.remove('hidden');
      listEmpty.innerHTML = `
        <div class="text-center py-8">
          <i data-lucide="server-off" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
          <p class="font-bold">Backend Connection Failed</p>
          <p class="text-xs opacity-50 mt-1">Please ensure the backend server is running and reachable.</p>
        </div>
      `;
      if ((window as any).lucide) (window as any).lucide.createIcons({ node: listEmpty });
    } finally {
      listLoading.classList.add('hidden');
    }
  };

  const renderFiles = (drops: Drop[]) => {
    filesContainer.innerHTML = '';
    if (drops.length === 0) {
      listEmpty.classList.remove('hidden');
      listEmpty.innerHTML = `
        <i data-lucide="inbox" class="w-12 h-12"></i>
        <p class="text-sm italic">No files dropped yet.</p>
      `;
      if ((window as any).lucide) (window as any).lucide.createIcons({ node: listEmpty });
      filesContainer.classList.add('hidden');
      return;
    }

    listEmpty.classList.add('hidden');
    filesContainer.classList.remove('hidden');

    drops.forEach((drop) => {
      const card = document.createElement('div');
      card.className =
        'card bg-base-200 border border-base-300 hover:border-primary/30 transition-colors';

      const expiresText = drop.expires_at
        ? `Expires: ${new Date(drop.expires_at).toLocaleString()}`
        : 'Indefinite';

      const sizeText = formatSize(drop.size);
      const icon = getFileIcon(drop.type);

      card.innerHTML = `
        <div class="card-body p-4">
          <div class="flex items-start gap-3">
            <div class="p-2 bg-base-300 rounded-lg text-primary">
              <i data-lucide="${icon}" class="w-6 h-6"></i>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-bold truncate" title="${escapeHtml(drop.filename)}">${escapeHtml(
        drop.filename
      )}</h4>
              <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] opacity-60 uppercase font-bold tracking-wider">
                <span>${sizeText}</span>
                <span>${drop.type}</span>
                <span class="flex items-center gap-1">
                  <i data-lucide="${drop.source === 'clipboard' ? 'clipboard' : 'file-up'}" class="w-2.5 h-2.5"></i>
                  ${drop.source}
                </span>
              </div>
              <p class="text-[10px] opacity-40 mt-1">${expiresText}</p>
            </div>
          </div>
          <div class="card-actions justify-end mt-4 gap-1">
            <button class="btn btn-ghost btn-xs btn-square preview-btn" title="Preview">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn btn-ghost btn-xs btn-square share-btn" title="Open in Tool / Share">
              <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
            </button>
            <a href="/api/drop/${drop.id}" download="${drop.filename}" class="btn btn-ghost btn-xs btn-square" title="Download">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
            </a>
            <button class="btn btn-ghost btn-xs btn-square text-error delete-btn" title="Delete">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.preview-btn')?.addEventListener('click', () => previewFile(drop));
      card.querySelector('.share-btn')?.addEventListener('click', () => shareFile(drop));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteFile(drop.id));

      filesContainer.appendChild(card);
    });

    if ((window as any).lucide) (window as any).lucide.createIcons({ node: filesContainer });
  };

  const uploadFiles = async (files: FileList | File[], source: string = 'file') => {
    const retention = settings.get('retention', '24');

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('retention', String(retention));
      formData.append('source', source);

      try {
        const resp = await fetch('/api/drop', {
          method: 'POST',
          body: formData,
        });
        const data = await resp.json();
        if (!data.success) {
          showMessage(`Upload failed for ${file.name}: ${data.error}`, { type: 'alert' });
        }
      } catch (err) {
        showMessage(`Upload failed for ${file.name}`, { type: 'alert' });
      }
    }
    fetchFiles();
  };

  const deleteFile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      const resp = await fetch(`/api/drop/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        fetchFiles();
      } else {
        showMessage('Delete failed: ' + data.error, { type: 'alert' });
      }
    } catch (err) {
      showMessage('Delete failed', { type: 'alert' });
    }
  };

  const previewFile = async (drop: Drop) => {
    previewTitle.textContent = drop.filename;
    previewContent.innerHTML = '<span class="loading loading-spinner text-primary"></span>';
    previewDownloadBtn.href = `/api/drop/${drop.id}`;
    previewDownloadBtn.setAttribute('download', drop.filename);
    previewModal.showModal();

    let objectUrl: string | null = null;

    try {
      const resp = await fetch(`/api/drop/${drop.id}`);
      if (!resp.ok) throw new Error('Fetch failed');
      const blob = await resp.blob();
      objectUrl = URL.createObjectURL(blob);

      if (drop.type.startsWith('image/')) {
        previewContent.innerHTML = `<img src="${objectUrl}" class="max-w-full max-h-full object-contain shadow-lg rounded" />`;
      } else if (drop.type === 'application/pdf') {
        previewContent.innerHTML = `<iframe src="${objectUrl}" class="w-full h-full border-0 rounded-lg bg-white"></iframe>`;
      } else if (
        drop.type.startsWith('text/') ||
        drop.type === 'application/json' ||
        drop.type.includes('javascript') ||
        drop.type.includes('xml')
      ) {
        const text = await blob.text();
        previewContent.innerHTML = `<pre class="bg-base-300 p-4 rounded-lg w-full h-full overflow-auto text-[10px] font-mono leading-relaxed">${escapeHtml(
          text
        )}</pre>`;
      } else {
        previewContent.innerHTML = `
          <div class="text-center space-y-4">
            <i data-lucide="file-warning" class="w-16 h-16 mx-auto opacity-20"></i>
            <p class="opacity-50">Preview not available for this file type.</p>
            <p class="text-xs font-mono opacity-30">${drop.type}</p>
            <a href="${previewDownloadBtn.href}" download="${drop.filename}" class="btn btn-primary">Download to view</a>
          </div>
        `;
        if ((window as any).lucide) (window as any).lucide.createIcons({ node: previewContent });
      }

      // Cleanup object URL when modal closes
      const onHide = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        previewModal.removeEventListener('close', onHide);
      };
      previewModal.addEventListener('close', onHide);
    } catch (err) {
      console.error('[FastDrop] Preview error', err);
      previewContent.innerHTML = `
        <div class="text-center text-error space-y-2">
          <i data-lucide="alert-triangle" class="w-12 h-12 mx-auto"></i>
          <p class="font-bold">Failed to load preview</p>
          <p class="text-xs opacity-60">The file might have been removed or the server is unreachable.</p>
        </div>
      `;
      if ((window as any).lucide) (window as any).lucide.createIcons({ node: previewContent });
    }
  };

  const shareFile = async (drop: Drop) => {
    try {
      const resp = await fetch(`/api/drop/${drop.id}`);
      const blob = await resp.blob();
      const file = new File([blob], drop.filename, { type: drop.type });

      // Use the project's utility to open in other tools
      await openInTool(file);
    } catch (err) {
      showMessage('Failed to share file', { type: 'alert' });
    }
  };

  const handlePaste = async () => {
    try {
      // Modern Clipboard API
      const items = await navigator.clipboard.read();
      let filesToUpload: File[] = [];

      for (const item of items) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          let filename = 'pasted-item';
          let extension = '';

          if (type.startsWith('image/')) {
            extension = type.split('/')[1] || 'png';
            if (extension === 'jpeg') extension = 'jpg';
            filename = `pasted-image-${Date.now()}.${extension}`;
          } else if (type === 'text/plain') {
            filename = `pasted-text-${Date.now()}.txt`;
          } else if (type === 'text/html') {
            filename = `pasted-content-${Date.now()}.html`;
          } else {
            // Generic file from clipboard
            const extMatch = type.match(/\/([a-z0-9]+)$/);
            extension = extMatch ? extMatch[1] : 'bin';
            filename = `pasted-file-${Date.now()}.${extension}`;
          }

          filesToUpload.push(new File([blob], filename, { type }));
        }
      }

      if (filesToUpload.length > 0) {
        uploadFiles(filesToUpload, 'clipboard');
      } else {
        // Try readText fallback
        const text = await navigator.clipboard.readText();
        if (text) {
          const blob = new Blob([text], { type: 'text/plain' });
          const file = new File([blob], `pasted-text-${Date.now()}.txt`, { type: 'text/plain' });
          uploadFiles([file], 'clipboard');
        } else {
          showMessage('No supported content found in clipboard', { type: 'info' });
        }
      }
    } catch (err) {
      console.error('[FastDrop] Paste error', err);
      // Fallback to text only if read() fails or not supported (e.g. Firefox)
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const blob = new Blob([text], { type: 'text/plain' });
          const file = new File([blob], `pasted-text-${Date.now()}.txt`, { type: 'text/plain' });
          uploadFiles([file], 'clipboard');
        } else {
          showMessage('Clipboard access denied or not supported', { type: 'alert' });
        }
      } catch (e) {
        showMessage('Clipboard access denied or not supported', { type: 'alert' });
      }
    }
  };

  // Listeners
  setupFileDropzone('dropzone', 'file-input', (files) => {
    uploadFiles(files);
  });

  pasteBtn.addEventListener('click', handlePaste);
  refreshBtn.addEventListener('click', fetchFiles);

  // Initial fetch
  fetchFiles();

  return () => {
    cleanupSettings();
  };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'music';
  if (type === 'application/pdf') return 'file-text';
  if (type.startsWith('text/') || type.includes('json') || type.includes('javascript') || type.includes('xml')) return 'file-type';
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return 'archive';
  return 'file';
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
