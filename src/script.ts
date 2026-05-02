import overviewHtml from './pages/overview.html?raw';
import { fuzzyScore, html, isDev } from './js/utils.ts';
import type { Tool, ToolModule } from './js/types';
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
import { showToolChooser, getLastUsedMap, setLastUsed } from './js/tool-chooser.ts';
import { setTools, tools } from './js/tools.ts';
import { getSettings } from './js/settings.ts';
import { getMimeTypeFromFileName } from './js/mime-types';
import { showMessage } from './js/ui.ts';
import { applyThemeColor } from './js/theme.ts';

// apply config values
document.title = siteContext.config.title;
const metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute('content', siteContext.config.description || '');

// apply theme color from settings
const bootSettings = getSettings('overview');
const storedThemeColor = bootSettings.get<string>('themeColor');
if (storedThemeColor) {
  applyThemeColor(storedThemeColor);
}

const descModules = import.meta.glob('@tools/**/config.json', { eager: true });
const assetModules = import.meta.glob(['@tools/**/*.html', '@tools/**/*.css'], {
  query: '?raw',
  import: 'default',
});
const scriptModules = import.meta.glob('@tools/**/index.ts');

async function buildToolsList(isBackendAvailable: boolean): Promise<Tool[]> {
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
    
    // skip backend tools if no backend is available
    if (toolConfig.requiresBackend && !isBackendAvailable) continue;

    // only now load the heavier assets if present
    const toolFolderPrefix = `${prefix}/${folder}/`;
    const assetKeys = Object.keys(assetModules).filter((k) => k.startsWith(toolFolderPrefix));

    let loadHtml:
      | (() => Promise<string | { template: string; partials: Record<string, string> }>)
      | undefined;

    if (assetKeys.length > 0) {
      loadHtml = async () => {
        const results: Record<string, string> = {};
        await Promise.all(
          assetKeys.map(async (key) => {
            const importerOrValue = (assetModules as any)[key];
            const content =
              typeof importerOrValue === 'function' ? await importerOrValue() : importerOrValue;
            const fileName = key.substring(toolFolderPrefix.length);
            results[fileName] = (content as any).default ?? (content as any);
          })
        );

        return {
          template: results['template.html'] || '',
          partials: results,
        };
      };
    }

    const scriptKey = Object.keys(scriptModules).find((k) => k === `${prefix}/${folder}/index.ts`);
    let loadScript: (() => Promise<ToolModule>) | undefined;
    if (scriptKey) {
      loadScript = scriptModules[scriptKey] as () => Promise<ToolModule>;
    }

    result.push(buildTool({ folder, html: '', loadHtml, loadScript, config: toolConfig }));
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
  renderLayout(overviewHtml, false, false);

  const grid = document.getElementById('tools-grid')!;
  const searchInput = document.getElementById('search') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-search') as HTMLButtonElement | null;
  const settings = getSettings('overview');

  // Bind settings (compact mode toggle)
  const settingsContainer = document.getElementById('overview-settings');
  if (settingsContainer) {
    settings.bind(settingsContainer);
    // Re-render when settings change
    settingsContainer.addEventListener('change', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.dataset.setting === 'themeColor') {
        applyThemeColor((target as HTMLInputElement).value);
      }
      filterAndRender();
    });
  }

  const refreshCachedFilesBtn = document.getElementById(
    'refresh-cached-files-btn'
  ) as HTMLButtonElement | null;
  if (refreshCachedFilesBtn) {
    refreshCachedFilesBtn.addEventListener('click', async () => {
      if (refreshCachedFilesBtn.disabled) return;

      refreshCachedFilesBtn.disabled = true;
      refreshCachedFilesBtn.classList.add('loading');
      refreshCachedFilesBtn.setAttribute('aria-busy', 'true');

      try {
        if (!('caches' in window)) {
          showMessage('Cache Storage API is not available in this browser.', { type: 'warning' });
          return;
        }

        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) =>
              registration
                .update()
                .catch((error) =>
                  console.error('[Overview] Failed to update service worker registration', error)
                )
            )
          );
        }

        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));

        showMessage('Cached app files cleared. Reloading...', {
          type: 'info',
          hideTypeText: false,
          timeoutMs: 2500,
        });
        window.setTimeout(() => window.location.reload(), 300);
      } catch (error) {
        console.error('[Overview] Failed to refresh cached app files', error);
        showMessage('Failed to refresh cached app files. Please try again.', { type: 'alert' });
      } finally {
        if (!refreshCachedFilesBtn.isConnected) return;
        refreshCachedFilesBtn.disabled = false;
        refreshCachedFilesBtn.classList.remove('loading');
        refreshCachedFilesBtn.removeAttribute('aria-busy');
      }
    });
  }

  // Track attached global key handler so we can remove it when toggling flatList
  let lastKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  function filterAndRender() {
    const term = searchInput.value.trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', term.length === 0);
    const compactMode = settings.get('compactMode', false);
    let filtered = tools;

    if (term) {
      filtered = tools
        .map((tool) => ({
          tool,
          score: Math.max(fuzzyScore(tool.name, term), fuzzyScore(tool.description, term) * 0.5),
        }))
        .filter((item) => item.score > 20)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.tool);
    }

    // Sort tools according to user preference
    // Force to plain string to avoid TypeScript literal narrowing issues
    const sortBy = settings.get('sortBy', 'order') as unknown as string;
    let sorted = [...filtered];
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'recent') {
      const map = getLastUsedMap();
      sorted.sort((a, b) => {
        const ta = map[a.path] ?? 0;
        const tb = map[b.path] ?? 0;
        return tb - ta || a.name.localeCompare(b.name);
      });
    } else {
      // default: order then name
      sorted.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
    }

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

    // Pagination / flat-list settings
    const flatList = settings.get('flatList', false);
    const pageSizeSetting = settings.get('pageSize', '24') as string;
    const pageSize = pageSizeSetting === 'all' ? Infinity : Number(pageSizeSetting) || 24;
    let currentPage = Number(settings.get('page', 1)) || 1;
    const setPageStored = (p: number) => settings.set('page', p);

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

    // If flatList is enabled, render a simple paginated list of all tools
    if (flatList) {
      const allTools = sorted; // already filtered/sorted
      const total = allTools.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage < 1) currentPage = 1;
      if (currentPage > totalPages) currentPage = totalPages;
      setPageStored(currentPage);

      const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
      const pageItems =
        pageSize === Infinity ? allTools : allTools.slice(startIdx, startIdx + pageSize);

      const showPagination = pageSize !== Infinity;
      outHtml += html`
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-2xl font-bold text-heading">All Tools</h3>
          <div class="text-sm text-muted">
            ${showPagination
              ? `${total} tools — Page ${currentPage} / ${totalPages}`
              : `${total} tools`}
          </div>
        </div>

        <div
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          id="flat-list-grid"
        >
          ${pageItems.map((tool) => renderToolCard(tool, false, compactMode)).join('')}
        </div>

        ${showPagination
          ? html`
              <div class="mt-4 flex items-center justify-center gap-2" aria-label="Pagination">
                <button class="btn btn-sm" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>
                  Prev
                </button>
                <div class="text-sm text-muted px-2">Page ${currentPage} of ${totalPages}</div>
                <button
                  class="btn btn-sm"
                  id="page-next"
                  ${currentPage >= totalPages ? 'disabled' : ''}
                >
                  Next
                </button>
              </div>
            `
          : ''}
      `;
    } else {
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
    }

    grid.innerHTML = outHtml;

    // If flat list, wire up pagination buttons
    if (flatList) {
      const prev = grid.querySelector('#page-prev') as HTMLButtonElement | null;
      const next = grid.querySelector('#page-next') as HTMLButtonElement | null;
      prev?.addEventListener('click', () => {
        if (currentPage <= 1) return;
        currentPage -= 1;
        setPageStored(currentPage);
        filterAndRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      next?.addEventListener('click', () => {
        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage >= totalPages) return;
        currentPage += 1;
        setPageStored(currentPage);
        filterAndRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      // Keyboard navigation: left/right to change pages, / to focus search
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
          prev?.click();
        } else if (e.key === 'ArrowRight') {
          next?.click();
        } else if (e.key === '/') {
          e.preventDefault();
          searchInput.focus();
        }
      };

      // Remove previous handler if present
      if (lastKeyHandler) window.removeEventListener('keydown', lastKeyHandler);
      window.addEventListener('keydown', keyHandler);
      lastKeyHandler = keyHandler;

      // Ensure when flatList is disabled in a later render we remove the handler.
    }

    // If flatList is not active, remove any lingering key handler
    if (!settings.get('flatList', false) && lastKeyHandler) {
      window.removeEventListener('keydown', lastKeyHandler);
      lastKeyHandler = null;
    }

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
  searchInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const grid = document.getElementById('tools-grid');
      const cards = grid?.querySelectorAll('.card[href^="#"]');
      if (cards?.length === 1) {
        (cards[0] as HTMLAnchorElement).click();
      }
    }
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterAndRender();
      searchInput.focus();
    });
  }
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
let activeViewTransition: any = null;

function handleRoute(path: string | null, payload?: any) {
  const doRender = () => {
    if (path) {
      const tool = tools.find((t) => t.path === path);
      setLastUsed(path);
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
    // Skip view transition if one is already active to prevent race conditions
    if (activeViewTransition && activeViewTransition.state === 'pending') {
      doRender();
      return;
    }

    try {
      activeViewTransition = docAny.startViewTransition(() => doRender());
    } catch (err) {
      // If anything goes wrong, fall back to direct rendering.
      console.warn('[script] View Transition failed, falling back to direct render', err);
      doRender();
    }
  } else {
    doRender();
  }
}

async function boot() {
  let isBackendAvailable = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    isBackendAvailable = response.ok;
    if (isBackendAvailable) {
      console.log('[script] Backend detected! Enabling server-side tools.');
    }
  } catch (e) {
    // Backend not available (network error, timeout, etc)
    console.log('[script] Running in offline/static mode (no backend detected).');
  }

  const loadedTools = await buildToolsList(isBackendAvailable);
  setTools(loadedTools);
  siteContext.toolCount = loadedTools.length;

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
  const routeFilesToTool = async (files: File[], mimeTypes: string[]): Promise<boolean> => {
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

  // 1. Setup persistent Launch Handler API (Windows/macOS "Open with")
  try {
    setupLaunchHandler(async (launchFiles) => {
      if (launchFiles.length > 0) {
        const mimeTypes = launchFiles.map((f) => getMimeTypeFromFileName(f.type || '', f.name));
        if (await routeFilesToTool(launchFiles, mimeTypes)) {
          handledByLaunchOrShare = true;
        }
      }
    });
  } catch (e) {
    console.warn('[script] Launch handler setup failed:', e);
  }

  try {
    const sharedInfo = getSharedContentInfo();
    const hasShareParams = sharedInfo !== null;

    if (typeof sharedInfo === 'string') {
      showMessage('shared target error: ' + sharedInfo, { type: 'alert' });
    } else if (sharedInfo) {
      const sharedFiles = await loadSharedFiles(sharedInfo.keys);
      if (sharedFiles.length > 0) {
        if (await routeFilesToTool(sharedFiles, sharedInfo.mimeTypes)) {
          handledByLaunchOrShare = true;
        }
      } else {
        console.warn('[script] No tool found for shared MIME types:', sharedInfo.mimeTypes);
      }
    }

    if (hasShareParams) {
      clearSharedParams();
    }
  } catch (e) {
    console.warn('[script] Share target handling failed:', e);
  }

  // Always render the initial route if not handled by launch/share
  if (!handledByLaunchOrShare) {
    handleRoute(router.getCurrentPath());
  }
}

void boot();
