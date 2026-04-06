type RouteListener = (path: string | null, payload?: any) => void;

class Router {
  private currentPath: string | null = null;
  private payload: any = null;
  private listeners: RouteListener[] = [];
  private pendingOverviewCleanup: (() => void) | null = null;
  private pendingOverviewToken = 0;

  constructor() {
    window.addEventListener('hashchange', this.handleHashChange.bind(this));
    this.handleHashChange();
  }

  public subscribe(listener: RouteListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public goTo(path: string, payload: any = null) {
    this.payload = payload;
    window.location.hash = path;
  }

  public goBack() {
    window.history.back();
  }

  public goOverview() {
    const currentTool = this.currentPath;
    const token = ++this.pendingOverviewToken;

    // Keep at most one pending overview scroll handler alive.
    this.clearPendingOverviewScroll();
    this.setupOverviewScrollAfterNavigation(currentTool, token);

    const overviewDelta = this.findOverviewHistoryDelta();
    if (overviewDelta !== null) {
      this.navigateToOverviewByHistory(overviewDelta, token);
      return;
    }

    // Fallback: replace current entry so back does not return to this tool.
    this.replaceToOverview();
  }

  private replaceToOverview(): void {
    const url = new URL(window.location.href);
    url.hash = '';
    window.location.replace(url.toString());
  }

  private navigateToOverviewByHistory(delta: number, token: number): void {
    const initialHash = window.location.hash;
    const initialPath = window.location.pathname;
    const initialSearch = window.location.search;
    let settled = false;

    const finish = (): void => {
      window.removeEventListener('hashchange', onSettled);
      window.removeEventListener('popstate', onSettled);
    };

    const onSettled = (): void => {
      settled = true;
      finish();
    };

    window.addEventListener('hashchange', onSettled, { once: true });
    window.addEventListener('popstate', onSettled, { once: true });

    window.setTimeout(() => {
      if (settled) return;
      if (token !== this.pendingOverviewToken) return;

      const isUnchanged =
        window.location.hash === initialHash &&
        window.location.pathname === initialPath &&
        window.location.search === initialSearch;

      if (isUnchanged) {
        finish();
        this.clearPendingOverviewScroll();
        this.replaceToOverview();
      }
    }, 250);

    history.go(delta);
  }

  private clearPendingOverviewScroll(): void {
    if (this.pendingOverviewCleanup) {
      this.pendingOverviewCleanup();
      this.pendingOverviewCleanup = null;
    }
  }

  private setupOverviewScrollAfterNavigation(toolId: string | null, token: number): void {
    if (!toolId) return;

    let raf1: number | null = null;
    let raf2: number | null = null;
    let timeoutId: number | null = null;

    const cleanup = (): void => {
      window.removeEventListener('hashchange', handler);
      window.removeEventListener('popstate', handler);

      if (raf1 !== null) {
        cancelAnimationFrame(raf1);
        raf1 = null;
      }

      if (raf2 !== null) {
        cancelAnimationFrame(raf2);
        raf2 = null;
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (this.pendingOverviewCleanup === cleanup) {
        this.pendingOverviewCleanup = null;
      }
    };

    const runScroll = (): void => {
      const rafHandles = this.scrollToOverviewCard(toolId, token, cleanup);
      raf1 = rafHandles.raf1;
      raf2 = rafHandles.raf2;
    };

    const handler = (): void => {
      cleanup();
      runScroll();
    };

    window.addEventListener('hashchange', handler, { once: true });
    window.addEventListener('popstate', handler, { once: true });

    // Safety timeout to avoid dangling listeners when no navigation event fires.
    timeoutId = window.setTimeout(cleanup, 2000);
    this.pendingOverviewCleanup = cleanup;
  }

  private scrollToOverviewCard(
    toolId: string,
    token: number,
    onDone?: () => void
  ): { raf1: number | null; raf2: number | null } {
    let raf1: number | null = null;
    let raf2: number | null = null;

    const finish = (): void => {
      onDone?.();
    };

    if (token !== this.pendingOverviewToken) {
      finish();
      return { raf1, raf2 };
    }

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (token !== this.pendingOverviewToken) {
          finish();
          return;
        }

        const el = document.getElementById(toolId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        finish();
      });
    });

    return { raf1, raf2 };
  }

  private findOverviewHistoryDelta(): number | null {
    // @ts-ignore - Navigation API is experimental
    const nav = (window as any).navigation;
    if (!nav || typeof nav.entries !== 'function') {
      return null;
    }

    try {
      const navEntries = nav.entries();
      if (!Array.isArray(navEntries) || navEntries.length <= 1) {
        return null;
      }

      const currentIndex =
        typeof nav.currentEntryIndex === 'number' ? nav.currentEntryIndex : navEntries.length - 1;

      // Prefer the oldest previous overview entry so one more back can leave the app/view.
      for (let i = 0; i < currentIndex; i++) {
        const entry = navEntries[i];
        if (!entry || typeof entry.url !== 'string') {
          continue;
        }

        if (this.isOverviewUrl(entry.url)) {
          return i - currentIndex;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.debug('[Router] Navigation API fallback:', error);
    }

    return null;
  }

  private isOverviewUrl(url: string): boolean {
    try {
      const entryUrl = new URL(url, window.location.href);
      const currentUrl = new URL(window.location.href);

      return (
        entryUrl.origin === currentUrl.origin &&
        entryUrl.pathname === currentUrl.pathname &&
        entryUrl.search === currentUrl.search &&
        (!entryUrl.hash || entryUrl.hash === '#')
      );
    } catch {
      return false;
    }
  }

  public getCurrentPath(): string | null {
    return this.currentPath;
  }

  /**
   * Returns the payload and clears it.
   */
  private consumePayload(): any {
    const p = this.payload;
    this.payload = null;
    return p;
  }

  private handleHashChange() {
    const previousPath = this.currentPath;
    this.currentPath = window.location.hash.slice(1) || null;
    this.listeners.forEach((l) => l(this.currentPath, this.consumePayload()));

    // Native browser/gesture back from tool -> overview should restore the related card.
    if (previousPath && !this.currentPath) {
      const token = ++this.pendingOverviewToken;
      this.clearPendingOverviewScroll();
      this.scrollToOverviewCard(previousPath, token);
    }
  }
}

const router = new Router();
export default router;
