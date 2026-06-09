import overviewHtml from '../pages/overview.html?raw';
import overviewSettingsDialogHtml from '../pages/overview-settings-dialog.html?raw';
import { siteContext } from '../config';
import { renderLayout, renderToolCard } from './render.ts';
import { getFavorites, toggleFavorite } from './favorites.ts';
import { clearDefaultTools, getLastUsedMap } from './tool-chooser.ts';
import { tools } from './tools.ts';
import { getSettings } from './settings.ts';
import { showMessage } from './ui.ts';
import { applyThemeColor } from './theme.ts';
import { fuzzyScore, html, replacePlaceholders } from './utils.ts';
import type { Tool } from './types.ts';

function getSectionMeta(sectionId: string | undefined) {
  const fallbackId = 'other';
  const id = sectionId?.trim() || fallbackId;

  const meta = siteContext.config.toolSections?.[id];
  if (meta) return { id, title: meta.title, description: meta.description };

  if (sectionId?.trim()) return { id, title: sectionId, description: undefined };

  return { id, title: 'Additional Tools', description: undefined };
}

export function renderOverview(): void {
  const resolvedOverviewHtml = replacePlaceholders(overviewHtml, siteContext, {
    'overview-settings-dialog.html': overviewSettingsDialogHtml,
  });

  renderLayout(resolvedOverviewHtml, false, false);

  const grid = document.getElementById('tools-grid')!;
  const searchInput = document.getElementById('search') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-search') as HTMLButtonElement | null;
  const settings = getSettings('overview');
  const globalSettings = getSettings('global');
  const settingsDialog = document.getElementById(
    'overview-settings-dialog'
  ) as HTMLDialogElement | null;
  const settingsOpenBtn = document.getElementById(
    'overview-settings-open'
  ) as HTMLButtonElement | null;

  if (settingsDialog && settingsOpenBtn) {
    settingsOpenBtn.addEventListener('click', () => {
      if (!settingsDialog.open) settingsDialog.showModal();
    });

    const hashEl = document.getElementById('settings-git-hash');
    const dateEl = document.getElementById('settings-build-date');
    if (hashEl) {
      hashEl.textContent = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';
    }
    if (dateEl) {
      try {
        const dateStr = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
        dateEl.textContent = dateStr ? new Date(dateStr).toLocaleDateString() : 'dev';
      } catch {
        dateEl.textContent = 'dev';
      }
    }
  }

  const settingsContainer = document.getElementById('overview-settings');
  if (settingsContainer) {
    settings.bind(settingsContainer);

    settingsContainer.querySelectorAll<HTMLElement>('[data-global-setting]').forEach((el) => {
      const key = el.dataset.globalSetting;
      if (!key) return;

      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = globalSettings.get<boolean>(key, false);
      } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.value = String(globalSettings.get<string>(key, ''));
      }
    });

    settingsContainer.addEventListener('change', (ev) => {
      const target = ev.target as HTMLElement;

      const globalKey = target.dataset.globalSetting;
      if (globalKey) {
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
          globalSettings.set(globalKey, target.checked);
        } else if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
          globalSettings.set(globalKey, target.value);
        }
      }

      if (target.dataset.setting === 'themeColor') {
        applyThemeColor((target as HTMLInputElement).value);
      }
      filterAndRender();
    });
  }

  const clearDefaultToolsBtn = document.getElementById(
    'clear-default-tools-btn'
  ) as HTMLButtonElement | null;
  if (clearDefaultToolsBtn) {
    clearDefaultToolsBtn.addEventListener('click', () => {
      clearDefaultTools();
      showMessage('Default tools cleared.', { type: 'info', timeoutMs: 2000 });
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
                .unregister()
                .catch((error) =>
                  console.error('[Overview] Failed to unregister service worker', error)
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
        window.setTimeout(() => window.location.reload(), 2000);
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

  let lastKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  function filterAndRender(): void {
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

    const sortBy = settings.get('sortBy', 'order') as unknown as string;
    const sorted = [...filtered];
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
      sorted.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
    }

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

    const configuredOrder = Object.keys(siteContext.config.toolSections ?? {});
    const encountered = Array.from(sectionMap.keys());

    const keysInOrder = [
      ...configuredOrder.filter((k) => sectionMap.has(k)),
      ...encountered.filter((k) => !configuredOrder.includes(k)),
    ];

    const flatList = settings.get('flatList', false);
    const pageSizeSetting = settings.get('pageSize', '24') as string;
    const pageSize = pageSizeSetting === 'all' ? Infinity : Number(pageSizeSetting) || 24;
    let currentPage = Number(settings.get('page', 1)) || 1;
    const setPageStored = (p: number) => settings.set('page', p);

    const isCollapsedStored = (id: string) => settings.get(`collapsed:${id}`, false);
    const setCollapsedStored = (id: string, v: boolean) => settings.set(`collapsed:${id}`, v);

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

    if (flatList) {
      const allTools = sorted;
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
      outHtml += keysInOrder
        .map((key) => {
          const section = sectionMap.get(key)!;
          const cardsHtml = section.items
            .map((tool) => renderToolCard(tool, false, compactMode))
            .join('');

          let collapsed = isCollapsedStored(section.meta.id);
          if (term) collapsed = false;

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

      const keyHandler = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowLeft') {
          prev?.click();
        } else if (e.key === 'ArrowRight') {
          next?.click();
        } else if (e.key === '/') {
          e.preventDefault();
          searchInput.focus();
        }
      };

      if (lastKeyHandler) window.removeEventListener('keydown', lastKeyHandler);
      window.addEventListener('keydown', keyHandler);
      lastKeyHandler = keyHandler;
    }

    if (!settings.get('flatList', false) && lastKeyHandler) {
      window.removeEventListener('keydown', lastKeyHandler);
      lastKeyHandler = null;
    }

    grid.querySelectorAll('[data-section-toggle]').forEach((btnEl) => {
      const btn = btnEl as HTMLElement;
      const id = btn.dataset.sectionToggle!;
      const sectionEl = btn.closest('section');
      const content = sectionEl?.querySelector('[id^="section-content-"]') as HTMLElement | null;
      const icon = btn.querySelector('[data-lucide]') as HTMLElement | null;

      const isOpenInitial = content ? !content.classList.contains('hidden') : false;
      btn.setAttribute('aria-expanded', String(isOpenInitial));
      if (icon) icon.classList.toggle('rotate-180', isOpenInitial);

      btn.addEventListener('click', () => {
        if (!content) return;
        const nowOpen = !content.classList.toggle('hidden');
        btn.querySelector('[data-lucide]')?.classList.toggle('rotate-180', nowOpen);
        btn.setAttribute('aria-expanded', String(nowOpen));
        setCollapsedStored(id, !nowOpen);
      });
    });

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
      const toolsGrid = document.getElementById('tools-grid');
      const cards = toolsGrid?.querySelectorAll('.card[href^="#"]');
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
