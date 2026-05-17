import type { ToolPayload } from './types.ts';

type RouteListener = (path: string | null, payload?: ToolPayload) => void;

class Router {
  private currentPath: string | null = null;
  private payload: ToolPayload | undefined;
  private listeners: RouteListener[] = [];
  private lastIdx = 0;
  private pendingOverviewCleanup: (() => void) | null = null;
  private pendingOverviewToken = 0;
  private hashArgs: string | null = null;

  constructor() {
    // Initialize state if missing
    if (!window.history.state || typeof window.history.state.idx !== 'number') {
      window.history.replaceState({ idx: 0 }, '');
    }
    // Do NOT set lastIdx here, let handleHashChange handle the first run

    window.addEventListener('hashchange', this.handleHashChange.bind(this));
    this.handleHashChange();
  }

  public subscribe(listener: RouteListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public goTo(path: string, payload?: ToolPayload) {
    this.payload = payload;
    const currentIdx = window.history.state?.idx ?? 0;
    window.location.hash = path;
    // Update the new entry's state with an incremented index
    window.history.replaceState({ idx: currentIdx + 1 }, '');
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

    this.replaceToOverview();
  }

  private replaceToOverview(): void {
    const url = new URL(window.location.href);
    url.hash = '';
    // Reset index to 0 when jumping back to overview via replace
    window.history.replaceState({ idx: 0 }, '');
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

        // find fav_ first we scroll there if we have it
        const favEl = document.getElementById('fav_' + toolId);
        if (favEl) {
          favEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // otherwise scroll to the tool card
          const el = document.getElementById(toolId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }

        finish();
      });
    });

    return { raf1, raf2 };
  }

  private getStack(): string[] {
    try {
      return JSON.parse(sessionStorage.getItem('toolkit_nav_stack') || '[]');
    } catch {
      return [];
    }
  }

  private saveStack(stack: string[]): void {
    sessionStorage.setItem('toolkit_nav_stack', JSON.stringify(stack));
  }

  private findOverviewHistoryDelta(): number | null {
    const idx = window.history.state?.idx ?? 0;
    if (idx === 0) return null;

    // Only jump if we know there is an overview entry in our history stack
    if (sessionStorage.getItem('toolkit_has_overview') !== 'true') {
      return null;
    }

    // The delta is the negative of the current index to reach the first overview (idx 0)
    return -idx;
  }

  public getCurrentPath(): string | null {
    return this.currentPath;
  }

  public getHashArgs(): string | null {
    return this.hashArgs;
  }

  public canGoBack(): boolean {
    if (!this.currentPath) return false;
    const idx = window.history.state?.idx ?? 0;
    return idx > 1;
  }

  public getPreviousPath(): string | null {
    // @ts-ignore - Navigation API is experimental
    const nav = (window as any).navigation;
    if (nav && typeof nav.entries === 'function') {
      const entries = nav.entries();
      const index = nav.currentEntryIndex;
      if (index > 0) {
        try {
          const url = new URL(entries[index - 1].url);
          return url.hash.slice(1) || null;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Returns the payload and clears it.
   */
  private consumePayload(): ToolPayload | undefined {
    const p = this.payload;
    this.payload = undefined;
    return p;
  }

  private handleHashChange() {
    const hash = window.location.hash.slice(1);
    const semicolonIdx = hash.indexOf(';');
    const newPath = semicolonIdx === -1 ? hash || null : hash.slice(0, semicolonIdx) || null;
    this.hashArgs = semicolonIdx === -1 ? null : hash.slice(semicolonIdx + 1);
    const previousPath = this.currentPath;
    this.currentPath = newPath;

    let currentIdx = window.history.state?.idx;
    const isTool = !!newPath;
    const wasTool = !!previousPath;

    const stack = this.getStack();

    if (typeof currentIdx !== 'number') {
      // First run or untracked entry
      currentIdx = isTool ? 1 : 0;
      window.history.replaceState({ idx: currentIdx }, '');

      if (isTool) {
        this.saveStack(['', newPath]); // [Overview, Tool]
      } else {
        this.saveStack(['']); // [Overview]
      }
    } else if (isTool) {
      if (!wasTool) {
        // Navigating from Overview to any Tool
        if (currentIdx !== 1) {
          currentIdx = 1;
          window.history.replaceState({ idx: 1 }, '');
          this.saveStack(['', newPath]);
        }
      } else if (newPath !== previousPath) {
        // Navigating from Tool A to Tool B
        if (currentIdx === this.lastIdx) {
          currentIdx = this.lastIdx + 1;
          window.history.replaceState({ idx: currentIdx }, '');

          // Push to stack
          stack.push(newPath);
          this.saveStack(stack);
        }
      }
    } else {
      // We are back at overview
      sessionStorage.setItem('toolkit_has_overview', 'true');
      if (currentIdx !== 0) {
        currentIdx = 0;
        window.history.replaceState({ idx: 0 }, '');
        this.saveStack(['']);
      }
    }

    this.lastIdx = currentIdx;

    let payload: ToolPayload | undefined = this.consumePayload();
    if (this.hashArgs !== null) {
      payload = { ...(payload ?? {}), hashArgs: this.hashArgs };
    }
    this.listeners.forEach((l) => l(this.currentPath, payload));

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
