import headerHtml from '../components/header.html?raw';
import footerHtml from '../components/footer.html?raw';
import toolPageHtml from '../pages/tool.html?raw';
import { setupThemeToggle } from './theme.ts';
import { siteContext } from '../config';
import type { Tool } from './types.ts';
import { html, replacePlaceholders } from './utils.ts';
import { renderToolIconSvg } from './tool-icons.ts';
import { isFavorite } from './favorites.ts';
import router from './router.ts';

const headerFinal = replacePlaceholders(headerHtml, siteContext);
const footerFinal = replacePlaceholders(footerHtml, siteContext);

let currentToolCleanup: (() => void) | undefined;

export function renderLayout(content: string, hideHeader?: boolean, hideFooter?: boolean) {
  const app = document.getElementById('app')!;
  const header = hideHeader ? '' : headerFinal;
  const footer = hideFooter ? '' : footerFinal;
  app.innerHTML = header + replacePlaceholders(content, siteContext) + footer;
  setupThemeToggle();
}

export function renderTool(tool: Tool | undefined, payload?: any) {
  // Cleanup previous tool listeners/effects before replacing DOM
  try {
    currentToolCleanup?.();
  } finally {
    currentToolCleanup = undefined;
  }

  renderLayout(toolPageHtml, tool?.hideHeader, tool?.hideFooter);

  const noToolHtml = `
    <h2 class="text-2xl text-heading">Tool not found</h2>
    `;
  const contentDiv = document.getElementById('tool-content')!;
  contentDiv.innerHTML = tool ? replacePlaceholders(tool.html, siteContext) : noToolHtml;

  // Back button
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      router.goOverview();
    });
  }

  // call Tool-specific script (if exist) with payload
  const maybeCleanup = tool?.script?.(payload);
  if (typeof maybeCleanup === 'function') {
    currentToolCleanup = maybeCleanup;
  }
}

export function renderToolCard(tool: Tool) {
  const active = isFavorite(tool.path);

  let badge = '';
  if (tool.draft) {
    badge = html`<div class="badge badge-warning font-semibold">DRAFT</div>`;
  }

  let favoriteBtn = '';
  if (!tool.draft) {
    favoriteBtn = html`
      <button
        data-favorite="${tool.path}"
        class="absolute top-1 right-1 p-2 rounded-full bg-card/50 hover:bg-card text-heading transition-all z-2 focus:opacity-100 focus:ring-2 focus:ring-primary outline-none ${active
          ? 'text-yellow-500 opacity-100'
          : 'text-muted opacity-100'}"
        aria-label="${active ? 'Remove from favorites' : 'Add to favorites'}"
        title="${active ? 'Remove from favorites' : 'Add to favorites'}"
      >
        <i data-lucide="star" class="w-4 h-4 ${active ? 'fill-current' : ''}"></i>
      </button>
    `;
  }

  return html`
    <div class="relative group" id="${tool.path}">
      <a
        href="#${tool.path}"
        aria-label="Open tool: ${tool.name}${tool.draft ? ' (draft)' : ''}"
        class="card card-compact bg-base-100 rounded-xl shadow hover:shadow-xl transition-all border-l-4 ${tool.draft
          ? 'border-l-yellow-400'
          : 'border-l-primary'} border focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-2 ring-offset-base-100 ${tool.draft
          ? 'focus:ring-yellow-300'
          : 'focus:ring-secondary'} h-full"
      >
        <div class="card-body p-4">
          <div class="flex flex-col items-center sm:flex-row sm:items-start gap-4">
            <div class="shrink-0">${renderToolIconSvg(tool.icon, 'w-6 h-6')}</div>

            <div class="flex-1 min-w-0 text-center sm:text-left">
              <h3 class="text-xl font-bold text-heading truncate">${tool.name}</h3>
              <p class="text-muted mt-2 text-sm">${tool.description}</p>
            </div>
            ${badge}
          </div>
        </div>
      </a>
      ${favoriteBtn}
    </div>
  `;
}
