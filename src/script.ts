import overviewHtml from './pages/overview.html?raw';
import { fuzzyScore, html, isDev } from './js/utils.ts';
import type { CustomMainContext, CustomMainModule, Tool, ToolModule } from './js/types';
import { siteContext } from './config';
import { renderLayout, renderTool, renderToolCard } from './js/render.ts';
import { buildTool, parseToolConfig } from './js/tool-config.ts';
import { setupLucideCreateIcons } from './js/tool-icons.ts';
import { getFavorites, toggleFavorite } from './js/favorites.ts';
import router from './js/router.ts';
import {
  cleanupOldSharedFiles,
  clearSharedParams,
  findAllToolsForMimeTypes,
  getSharedContentInfo,
  loadSharedFiles,
  setupLaunchHandler,
  type SharedFilesPayload,
} from './js/share-target.ts';
import { showToolChooser } from './js/tool-chooser.ts';
import { setTools, tools } from './js/tools.ts';
import { getSettings } from './js/settings.ts';

// apply config values
document.title = siteContext.config.title;
const metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute('content', siteContext.config.description || '');

const descModules = import.meta.glob('@tools/**/config.json', { eager: true });
const htmlModules = import.meta.glob('@tools/**/template.html', {
  query: '?raw',
  import: 'default',
});
const scriptModules = import.meta.glob('@tools/**/index.ts');

async function buildToolsList(): Promise<Tool[]> {
  const result: Tool[] = [];

  for (const pathKey in descModules) {
    const match = pathKey.match(/(.+)\/([^/]+)\/config\.json$/);
    if (!match) {
      console.warn('[script] unexpected module key, skipping:', pathKey);
      continue;
    }
    const prefix = match[1]; // dynamic part from glob (e.g. "@tools" or "/src/tools")
    const folder = match[2];

    const rawDesc = (descModules[pathKey] as { default?: unknown }).default;
    const toolConfig = parseToolConfig(rawDesc, folder, { strict: isDev, sourceId: pathKey });

    // skip example tools early — do not import their template/script
    if (!siteContext.config.showExamples && toolConfig.example) continue;
    if (toolConfig.draft && !isDev) continue;

    // only now load the heavier assets if present
    const htmlKey = Object.keys(htmlModules).find((k) => k === `${prefix}/${folder}/template.html`);
    let html = `<p>No content found, provide a template.html file for your tool <strong>${folder}</strong></p>`;
    if (htmlKey) {
      const importerOrValue = (htmlModules as any)[htmlKey];
      const loaded =
        typeof importerOrValue === 'function' ? await importerOrValue() : importerOrValue;
      html = (loaded as any).default ?? (loaded as any);
    }

    const scriptKey = Object.keys(scriptModules).find((k) => k === `${prefix}/${folder}/index.ts`);
    let loadScript: (() => Promise<ToolModule>) | undefined;
    if (scriptKey) {
      loadScript = scriptModules[scriptKey] as () => Promise<ToolModule>;
    }

    result.push(buildTool({ folder, html, loadScript, config: toolConfig }));
  }

  return result;
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
  const settings = getSettings('overview');

  // Bind settings (compact mode toggle)
  const settingsContainer = document.getElementById('overview-settings');
  if (settingsContainer) {
    settings.bind(settingsContainer);
    // Re-render when settings change
    settingsContainer.addEventListener('change', () => {
      filterAndRender();
    });
  }

  function filterAndRender() {
    const term = searchInput.value.trim();
    const compactMode = settings.get('compactMode', false);
    let filtered = tools;

    if (term) {
      filtered = tools
        .map((tool) => ({
          tool,
          score: Math.max(fuzzyScore(tool.name, term) * 2, fuzzyScore(tool.description, term)),
        }))
        .filter((item) => item.score > 0)
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

    // Collapsible sections: persist state in localStorage per section
    const isCollapsedStored = (id: string) => settings.get(`collapsed:${id}`, false);
    const setCollapsedStored = (id: string, v: boolean) => settings.set(`collapsed:${id}`, v);

    // Favorites section (top)
    const favorites = getFavorites();
    const favoriteTools = sorted.filter((t) => favorites.includes(t.path));

    let outHtml = '';

    if (favoriteTools.length > 0 && !term) {
      outHtml += html`
        <section class="">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-2xl font-bold text-heading">Favorites</h3>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${favoriteTools.map((tool) => renderToolCard(tool, true, compactMode)).join('')}
          </div>
        </section>
        <div class="border-b border-card my-4"></div>
      `;
    }

    // Render each section as a collapsible block containing its own grid
    outHtml += keysInOrder
      .map((key) => {
        const section = sectionMap.get(key)!;
        const cardsHtml = section.items
          .map((tool) => renderToolCard(tool, false, compactMode))
          .join('');

        // Determine collapsed state: respect stored value unless we're searching -> auto-expand
        let collapsed = isCollapsedStored(section.meta.id);
        if (term) collapsed = false; // expand during search to show matches

        return html`
          <section class="p-0" id="section-${encodeURIComponent(section.meta.id)}">
            <div class="">
              <div class="flex items-start justify-between mb-4">
                <div class="min-w-0">
                  <h3 class="text-2xl font-bold text-heading">${section.meta.title}</h3>
                  ${section.meta.description
                    ? `<p class="text-sm text-muted mt-1">${section.meta.description}</p>`
                    : ''}
                </div>

                <div class="flex items-center ml-4">
                  <span class="text-sm text-muted mr-3">${section.items.length}</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm p-2"
                    data-section-toggle="${section.meta.id}"
                    aria-expanded="${!collapsed}"
                    aria-controls="section-content-${encodeURIComponent(section.meta.id)}"
                    title="Toggle section"
                  >
                    <i
                      data-lucide="chevron-down"
                      class="w-4 h-4 transform ${collapsed
                        ? ''
                        : 'rotate-180'} transition-transform"
                    ></i>
                  </button>
                </div>
              </div>

              <div
                id="section-content-${encodeURIComponent(section.meta.id)}"
                class="${collapsed ? 'hidden' : ''}"
              >
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  ${cardsHtml}
                </div>
              </div>
            </div>
          </section>
        `;
      })
      .join('');

    grid.innerHTML = outHtml;

    // Attach collapse toggle listeners (listen to the toggle buttons)
    grid.querySelectorAll('[data-section-toggle]').forEach((btnEl) => {
      const btn = btnEl as HTMLElement;
      const id = btn.dataset.sectionToggle!;
      const sectionEl = btn.closest('section');
      const content = sectionEl?.querySelector('[id^="section-content-"]') as HTMLElement | null;
      const icon = btn.querySelector('[data-lucide]') as HTMLElement | null;

      // Ensure aria-expanded initial state matches visibility
      const isOpenInitial = content ? !content.classList.contains('hidden') : false;
      btn.setAttribute('aria-expanded', String(isOpenInitial));
      if (icon) icon.classList.toggle('rotate-180', isOpenInitial);

      btn.addEventListener('click', () => {
        if (!content) return;
        const nowOpen = !content.classList.toggle('hidden');
        // Update icon rotation
        btn.querySelector('[data-lucide]')?.classList.toggle('rotate-180', nowOpen);
        btn.setAttribute('aria-expanded', String(nowOpen));
        // Persist collapsed state: store '1' when collapsed
        setCollapsedStored(id, !nowOpen);
      });
    });

    // Attach favorite listeners
    grid.querySelectorAll('[data-favorite]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const path = (btn as HTMLElement).dataset.favorite!;
        toggleFavorite(path);
        filterAndRender();
      });
    });
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

// === Routing ===
function handleRoute(path: string | null, payload?: any) {
  const doRender = () => {
    if (path) {
      const tool = tools.find((t) => t.path === path);
      renderTool(tool, payload);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } else {
      renderOverview();
    }
  };

  const appEl = document.getElementById('app');
  if (appEl) {
    try {
      (appEl as any).style.viewTransitionName = path ? `tool-${path}` : 'overview';
    } catch (e) {
      // ignore if the environment doesn't support setting this style
    }
  }

  const docAny = document as any;
  if (typeof docAny.startViewTransition === 'function') {
    try {
      docAny.startViewTransition(() => doRender());
    } catch (err) {
      // If anything goes wrong, fall back to direct rendering.
      console.warn('[script] View Transition failed, falling back to direct render', err);
      doRender();
    }
  } else {
    doRender();
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
  const loadedTools = await buildToolsList();
  setTools(loadedTools);

  await invokeOptionalMain({
    tools: loadedTools,
  } as CustomMainContext);

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      window.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
  }

  initScrollToTop();
  setupLucideCreateIcons();

  // Subscribe to router changes
  router.subscribe(handleRoute);

  // Cleanup old shared files in background
  cleanupOldSharedFiles().catch((e) => console.warn('Cleanup shared files failed', e));

  // Helper to route files to the appropriate tool
  const routeFilesToTool = async (
    files: File[],
    mimeTypes: string[],
    text?: string
  ): Promise<boolean> => {
    if (files.length === 0) return false;

    const matchingTools = findAllToolsForMimeTypes(tools, mimeTypes);
    if (matchingTools.length === 0) return false;

    let targetTool: Tool | null;

    if (matchingTools.length === 1) {
      // Only one matching tool, use it directly
      targetTool = matchingTools[0];
    } else {
      // Multiple tools can handle this file type, let user choose
      // Tools are already sorted by order from findAllToolsForMimeTypes
      targetTool = await showToolChooser(matchingTools, files);
    }

    if (targetTool) {
      const payload: SharedFilesPayload = {
        sharedFiles: files,
        mimeTypes,
        text,
      };
      router.goTo(targetTool.path, payload);
      return true;
    }

    // User cancelled the chooser
    return false;
  };

  // Check for launch/share content with timeout protection
  // We wrap each check in a try-catch to ensure one failure doesn't block the app
  let handledByLaunchOrShare = false;

  try {
    // 1. Check for Launch Handler API (Windows/macOS "Open with")
    const launchFiles = await setupLaunchHandler();
    if (launchFiles && launchFiles.length > 0) {
      const mimeTypes = launchFiles.map((f) => f.type || '');
      if (await routeFilesToTool(launchFiles, mimeTypes)) {
        handledByLaunchOrShare = true;
      }
    }
  } catch (e) {
    console.warn('[script] Launch handler failed:', e);
  }

  if (!handledByLaunchOrShare) {
    try {
      // 2. Check for shared content from Service Worker (Android share)
      const sharedInfo = getSharedContentInfo();
      if (sharedInfo) {
        const sharedFiles = await loadSharedFiles(sharedInfo.keys);
        clearSharedParams();

        if (sharedFiles.length > 0) {
          if (await routeFilesToTool(sharedFiles, sharedInfo.mimeTypes, sharedInfo.text)) {
            handledByLaunchOrShare = true;
          }
        } else {
          console.warn('[script] No tool found for shared MIME types:', sharedInfo.mimeTypes);
        }
      }
    } catch (e) {
      console.warn('[script] Share target handling failed:', e);
    }
  }

  // Always render the initial route if not handled by launch/share
  if (!handledByLaunchOrShare) {
    handleRoute(router.getCurrentPath());
  }
}

void boot();
