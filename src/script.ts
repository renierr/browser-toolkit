import { siteContext } from './config';
import { buildToolsList } from './js/bootstrap/tool-registry.ts';
import { createRouteHandler } from './js/navigation/route-renderer.ts';
import { renderOverview } from './js/overview.ts';
import { initOverviewScrollToTop } from './js/overview-scroll-to-top.ts';
import { setupOfflineReadyNotification } from './js/pwa/offline-ready.ts';
import { cleanupOldSharedFiles } from './js/share-target.ts';
import { handleStartupSharedLaunch } from './js/share/startup-share-routing.ts';
import { getSettings } from './js/settings.ts';
import { applyThemeColor } from './js/theme.ts';
import { setupLucideCreateIcons } from './js/tool-icons.ts';
import router from './js/router.ts';
import { setBackendAvailable, setTools } from './js/tools.ts';
import { checkBackend } from './js/utils.ts';
import type { ToolPayload } from './js/types.ts';

document.title = siteContext.config.title;
const metaDesc = document.querySelector('meta[name="description"]');
if (metaDesc) metaDesc.setAttribute('content', siteContext.config.description || '');

const bootSettings = getSettings('overview');
const storedThemeColor = bootSettings.get<string>('themeColor');
if (storedThemeColor) {
  applyThemeColor(storedThemeColor);
}

async function waitForDomReady(): Promise<void> {
  if (document.readyState !== 'loading') return;

  await new Promise<void>((resolve) => {
    window.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

async function boot(): Promise<void> {
  const isBackendAvailable = await checkBackend();
  setBackendAvailable(isBackendAvailable);

  if (isBackendAvailable) {
    console.log('[script] Backend detected! Enabling server-side tools.');
  } else {
    console.log('[script] Running in offline/static mode (no backend detected).');
  }

  const loadedTools = await buildToolsList(isBackendAvailable);
  setTools(loadedTools);
  siteContext.toolCount = loadedTools.length;

  await waitForDomReady();

  initOverviewScrollToTop();
  setupLucideCreateIcons();

  const handleRoute = createRouteHandler({ renderOverview });
  router.subscribe(handleRoute);

  cleanupOldSharedFiles().catch((error) => {
    console.warn('Cleanup shared files failed', error);
  });

  const handledByLaunchOrShare = await handleStartupSharedLaunch(loadedTools);
  if (!handledByLaunchOrShare) {
    const path = router.getCurrentPath();
    const hashArgs = router.getHashArgs();
    const payload: ToolPayload | undefined = hashArgs ? { hashArgs } : undefined;
    handleRoute(path, payload);
  }

  setupOfflineReadyNotification();
}

void boot();
