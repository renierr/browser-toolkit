import type { Tool } from './types';
import { renderToolIconSvg } from './tool-icons';
import { tools } from './tools';
import router from './router';
import { findAllToolsForMimeTypes, type SharedFilesPayload } from './share-target.ts';
import { hideProgress, showMessage } from './ui.ts';
import { getSettings } from './settings.ts';

export function getLastUsedMap(): Record<string, number> {
  return getSettings('global').get<Record<string, number>>('lastUsed', {});
}

export function setLastUsed(path: string): void {
  const settings = getSettings('global');
  const map = getLastUsedMap();
  map[path] = Date.now();
  settings.set('lastUsed', map);
}

function sortTools(toolsToSort: Tool[], sortBy: string): Tool[] {
  if (sortBy === 'name') {
    return [...toolsToSort].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sortBy === 'recent') {
    const map = getLastUsedMap();
    return [...toolsToSort].sort((a, b) => {
      const ta = map[a.path] ?? 0;
      const tb = map[b.path] ?? 0;
      return tb - ta || a.name.localeCompare(b.name);
    });
  }
  return [...toolsToSort].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Opens the provided content in a tool selected by the user.
 * Automatically converts buffers/blobs to File objects and filters available tools.
 */
export async function openInTool(
  input: File | Blob | ArrayBuffer | ArrayBufferView | File[],
  options: { filename?: string; mimeType?: string } = {}
) {
  let files: File[];

  if (Array.isArray(input)) {
    files = input;
  } else if (input instanceof File) {
    files = [input];
  } else if (input instanceof Blob) {
    const name = options.filename || 'file';
    const mime = options.mimeType || input.type || 'application/octet-stream';
    files = [new File([input], name, { type: mime })];
  } else {
    // ArrayBuffer or ArrayBufferView
    const name = options.filename || 'file';
    const mime = options.mimeType || 'application/octet-stream';
    files = [new File([input as any], name, { type: mime })];
  }
  
  hideProgress();
  if (files.length === 0) return;

  const mimeTypes = files.map((f) => f.type);
  const matchingTools = findAllToolsForMimeTypes(tools, mimeTypes);

  if (matchingTools.length === 0) {
    showMessage('No tools found that can handle these files', { type: 'warning' });
    return;
  }

  const selectedTool = await showToolChooser(matchingTools, files);

  if (selectedTool) {
    const payload: SharedFilesPayload = {
      sharedFiles: files,
      mimeTypes: mimeTypes,
    };
    router.goTo(selectedTool.path, payload);
  }
}

/**
 * Shows a modal dialog for the user to choose which tool to open a shared file with.
 * Returns the selected tool or null if canceled.
 *
 * @param tools - Array of tools that can handle the files (should be pre-sorted by order)
 * @param files - Array of files being shared
 */
export function showToolChooser(tools: Tool[], files: File[]): Promise<Tool | null> {
  return new Promise((resolve) => {
    // Build file description
    const fileCount = files.length;
    const firstName = files[0]?.name || 'Shared file';
    const fileDescription =
      fileCount === 1
        ? firstName
        : `${firstName} and ${fileCount - 1} more file${fileCount > 2 ? 's' : ''}`;

    const settings = getSettings('overview');
    const sortBy = (settings.get('sortBy', 'order') as string) ?? 'order';
    const sortedTools = sortTools(tools, sortBy);

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className =
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'tool-chooser-title');

    // Create modal content
    const modal = document.createElement('div');
    modal.className =
      'bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-md overflow-hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'p-4 border-b border-base-300';
    header.innerHTML = `
      <h2 id="tool-chooser-title" class="text-lg font-bold text-heading">Open with...</h2>
      <p class="text-sm text-muted mt-1 truncate" title="${escapeHtml(fileDescription)}">
        ${escapeHtml(fileDescription)}
      </p>
      ${fileCount > 1 ? `<p class="text-xs text-muted/70 mt-0.5">${fileCount} files selected</p>` : ''}
    `;

    // Tool list
    const list = document.createElement('div');
    list.className = 'p-2 max-h-80 overflow-y-auto';

    sortedTools.forEach((tool, index) => {
      const button = document.createElement('button');
      button.className = `
        w-full flex items-center gap-3 p-3 rounded-xl
        hover:bg-base-200 focus:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary
        transition-colors text-left
      `;
      button.setAttribute('data-tool-index', String(index));

      const iconHtml = renderToolIconSvg(tool.icon, 'w-8 h-8 shrink-0');

      button.innerHTML = `
        ${iconHtml}
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-heading truncate">${escapeHtml(tool.name)}</div>
          <div class="text-sm text-muted truncate">${escapeHtml(tool.description)}</div>
        </div>
        <svg class="w-5 h-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      `;

      button.addEventListener('click', () => {
        cleanup();
        resolve(tool);
      });

      list.appendChild(button);
    });

    const footer = document.createElement('div');
    footer.className = 'p-3 border-t border-base-300 flex justify-between items-center';

    // Share button (if supported)
    const shareBtnContainer = document.createElement('div');
    if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn btn-ghost btn-sm flex items-center gap-2';
      shareBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
        <span>Share</span>
      `;
      shareBtn.addEventListener('click', async () => {
        try {
          const title = files.length === 1 ? files[0].name : `${files.length} files`;
          await navigator.share({ files, title });
          cleanup();
          resolve(null);
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.error('Error sharing files:', err);
            showMessage('Could not share files.', { type: 'warning' });
          }
        }
      });
      shareBtnContainer.appendChild(shareBtn);
    }
    footer.appendChild(shareBtnContainer);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    footer.appendChild(cancelBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(list);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    // Handle escape key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };

    // Handle click outside modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        cleanup();
        resolve(null);
      }
    });

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeydown);
      backdrop.remove();
    };

    document.addEventListener('keydown', handleKeydown);
    document.body.appendChild(backdrop);

    // Focus first tool button
    const firstButton = list.querySelector('button');
    if (firstButton) {
      firstButton.focus();
    }
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
