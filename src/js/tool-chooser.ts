import type { Tool } from './types';
import { renderToolIconSvg } from './tool-icons';

/**
 * Shows a modal dialog for the user to choose which tool to open a shared file with.
 * Returns the selected tool or null if cancelled.
 *
 * @param tools - Array of tools that can handle the files (should be pre-sorted by order)
 * @param files - Array of files being shared
 */
export function showToolChooser(tools: Tool[], files: File[]): Promise<Tool | null> {
  return new Promise((resolve) => {
    // Build file description
    const fileCount = files.length;
    const firstName = files[0]?.name || 'Shared file';
    const fileDescription = fileCount === 1
      ? firstName
      : `${firstName} and ${fileCount - 1} more file${fileCount > 2 ? 's' : ''}`;

    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'tool-chooser-title');

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-md overflow-hidden';

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

    tools.forEach((tool, index) => {
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

    // Footer with cancel button
    const footer = document.createElement('div');
    footer.className = 'p-3 border-t border-base-300 flex justify-end';

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

