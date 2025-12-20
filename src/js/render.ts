import headerHtml from '../components/header.html?raw';
import footerHtml from '../components/footer.html?raw';
import toolPageHtml from '../pages/tool.html?raw';
import { setupThemeToggle } from './theme.ts';
import { siteContext } from '../config';
import type { Tool } from './types.ts';
import { replacePlaceholders } from './utils.ts';
import { renderToolIconSvg } from './tool-icons.ts';

const headerFinal = replacePlaceholders(headerHtml, siteContext);
const footerFinal = replacePlaceholders(footerHtml, siteContext);

let currentToolCleanup: (() => void) | undefined;

export function renderLayout(content: string) {
  const app = document.getElementById('app')!;
  app.innerHTML = headerFinal + replacePlaceholders(content, siteContext) + footerFinal;
  setupThemeToggle();
}

export function renderTool(tool: Tool | undefined) {
  // Cleanup previous tool listeners/effects before replacing DOM
  try {
    currentToolCleanup?.();
  } finally {
    currentToolCleanup = undefined;
  }

  renderLayout(toolPageHtml);

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
      location.hash = '';
    });
  }

  // call Tool-specific script (if exist)
  const maybeCleanup = tool?.script?.();
  if (typeof maybeCleanup === 'function') {
    currentToolCleanup = maybeCleanup;
  }
}

export function renderToolCard(tool: Tool) {
  return `
    <a href="#${tool.path}" class="block p-6 bg-base-100 rounded-xl shadow hover:shadow-xl transition-all border-l-4 ${
      tool.draft ? 'border-l-draft' : 'border-l-primary'
    } border">
      <div class="flex justify-between items-start gap-4">
        <div class="flex items-start gap-4 min-w-0">
          <div class="shrink-0 text-muted">
            ${renderToolIconSvg(tool.icon, 'w-6 h-6')}
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-xl font-bold text-heading">${tool.name}</h3>
            <p class="text-muted mt-2 text-sm">${tool.description}</p>
          </div>
        </div>
        ${
          tool.draft
            ? '<span class="text-xs bg-draft text-draft px-3 py-1 rounded-full font-medium whitespace-nowrap">DRAFT</span>'
            : ''
        }
      </div>
    </a>
  `;
}
