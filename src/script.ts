import overviewHtml from './pages/overview.html?raw';
import { fuzzyScore, isDev } from './js/utils.ts';
import type { CustomMainContext, CustomMainModule, Tool, ToolModule } from './js/types';
import { siteContext } from './config';
import { renderLayout, renderTool, renderToolCard } from './js/render.ts';
import { buildTool, parseToolConfig } from './js/tool-config.ts';

// apply config values
document.title = siteContext.config.title;
const metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute('content', siteContext.config.description || '');

// Load all tools dynamically
const descModules = import.meta.glob('./tools/*/config.json', { eager: true });
const htmlModules = import.meta.glob('./tools/*/template.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const scriptModules = import.meta.glob('./tools/*/index.ts', { eager: true });

const tools: Tool[] = [];

for (const path in descModules) {
  const folder = path.match(/\.\/tools\/([^/]+)\//)![1];

  const rawDesc = (descModules[path] as { default?: unknown }).default;
  const toolConfig = parseToolConfig(rawDesc, folder, { strict: isDev, sourceId: path });

  if (!siteContext.config.showExamples && toolConfig.example) continue;
  if (toolConfig.draft && !isDev) continue;
  const html =
    (htmlModules[`./tools/${folder}/template.html`] as string) ||
    '<p>No content found, provide a template.html file for your tool</p>';

  const mod = scriptModules[`./tools/${folder}/index.ts`] as ToolModule | undefined;
  const initScript = mod?.default ?? mod?.init;

  tools.push(
    buildTool({
      folder,
      html,
      initScript,
      config: toolConfig,
    })
  );
}

function getSectionMeta(sectionId: string | undefined) {
  const fallbackId = 'other';
  const id = sectionId?.trim() || fallbackId;

  const meta = siteContext.config.toolSections?.[id];
  if (meta) return { id, title: meta.title, description: meta.description };

  // If the sectionId exists but isn't configured, show a readable fallback title.
  if (sectionId?.trim()) return { id, title: sectionId, description: undefined };

  return { id, title: 'Additional Tools', description: undefined };
}

function renderOverview() {
  renderLayout(overviewHtml);

  const grid = document.getElementById('tools-grid')!;
  const searchInput = document.getElementById('search') as HTMLInputElement;

  function filterAndRender() {
    const term = searchInput.value.trim();
    let filtered = tools;

    if (term) {
      filtered = tools
        .map((tool) => ({
          tool,
          score: Math.max(fuzzyScore(tool.name, term), fuzzyScore(tool.description, term)),
        }))
        .filter((item) => item.score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.tool);
    }

    // Sort tools (globally) by order then name
    const sorted = [...filtered].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

    // Group by sectionId
    const sectionMap = new Map<
      string,
      { meta: ReturnType<typeof getSectionMeta>; items: Tool[] }
    >();
    for (const tool of sorted) {
      const meta = getSectionMeta(tool.sectionId);
      const key = meta.id;
      const entry = sectionMap.get(key) ?? { meta, items: [] };
      entry.items.push(tool);
      sectionMap.set(key, entry);
    }

    // Render sections in a predictable order:
    // 1) sections configured in SiteConfig (in object insertion order)
    // 2) any other sections encountered
    const configuredOrder = Object.keys(siteContext.config.toolSections ?? {});
    const encountered = Array.from(sectionMap.keys());

    const keysInOrder = [
      ...configuredOrder.filter((k) => sectionMap.has(k)),
      ...encountered.filter((k) => !configuredOrder.includes(k)),
    ];

    grid.innerHTML = keysInOrder
      .map((key) => {
        const section = sectionMap.get(key)!;
        const headerHtml = `
          <div class="md:col-span-2 lg:col-span-3">
            <div class="mb-4">
              <h3 class="text-2xl font-bold text-heading">${section.meta.title}</h3>
              ${
                section.meta.description
                  ? `<p class="text-sm text-muted mt-1">${section.meta.description}</p>`
                  : ''
              }
            </div>
          </div>
        `;

        const cardsHtml = section.items.map(renderToolCard).join('');
        return headerHtml + cardsHtml;
      })
      .join('');
  }

  searchInput?.addEventListener('input', filterAndRender);
  filterAndRender();
}

// === Scroll-to-top button ===
function initScrollToTop() {
  const btn = document.getElementById('scroll-to-top') as HTMLButtonElement | null;
  if (!btn) return;

  const thresholdPx = 150;

  const setVisible = (visible: boolean) => {
    btn.classList.toggle('opacity-0', !visible);
    btn.classList.toggle('pointer-events-none', !visible);
  };

  const update = () => {
    setVisible(window.scrollY > thresholdPx);
  };

  // Throttle scroll updates to animation frames (smoother + cheaper)
  let scheduled = false;
  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  };

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  update(); // initial state
}

// === Routing with hash ===
function router() {
  const hash = location.hash.slice(1); // without #
  if (hash) {
    const tool = tools.find((t) => t.path === hash);
    renderTool(tool);
  } else {
    renderOverview();
  }
}

// custom entry point hook
function invokeOptionalMain(ctx: CustomMainContext): Promise<void> | void {
  const userMainModules = import.meta.glob('./main.ts'); // {} if file doesn't exist
  const importUserMain = userMainModules['./main.ts'];
  if (!importUserMain) return;

  return importUserMain()
    .then((mod) => mod as CustomMainModule)
    .then((mod) => {
      const entry =
        typeof mod.default === 'function'
          ? mod.default
          : typeof mod.init === 'function'
            ? mod.init
            : undefined;

      return entry?.(ctx);
    })
    .then(() => undefined)
    .catch((err) => {
      console.warn('[template] Failed to load optional src/main.ts:', err);
    });
}

async function boot() {
  await invokeOptionalMain({
    tools,
  } as CustomMainContext);

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      window.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
  }

  initScrollToTop();

  // Hash routing only after DOM is ready (prevents early render issues)
  window.addEventListener('hashchange', router);

  // Initial route
  router();
}

void boot();
