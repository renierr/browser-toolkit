import type { ToolPayload } from './types.ts';

type RouteListener = (path: string | null, payload?: ToolPayload) => void;

class Router {
  private currentPath: string | null = null;
  private payload: ToolPayload | undefined;
  private listeners: RouteListener[] = [];
  private hashArgs: string | null = null;
  private hasSeenOverview = false;
  private overviewScrollAbort: AbortController | null = null;

  constructor() {
    if (!window.history.state || typeof window.history.state.idx !== 'number') {
      const hash = window.location.hash.slice(1);
      window.history.replaceState({ idx: hash ? 1 : 0 }, '');
    }

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
    window.history.replaceState({ idx: currentIdx + 1 }, '');
  }

  public goBack() {
    window.history.back();
  }

  public goOverview() {
    if (!this.currentPath) return;

    this.setupOverviewScroll(this.currentPath);

    if (!this.hasSeenOverview) {
      const url = new URL(window.location.href);
      url.hash = '';
      window.location.replace(url.toString());
      return;
    }

    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) {
      history.go(-idx);
    } else {
      const url = new URL(window.location.href);
      url.hash = '';
      window.location.replace(url.toString());
    }
  }

  public getCurrentPath(): string | null {
    return this.currentPath;
  }

  public getHashArgs(): string | null {
    return this.hashArgs;
  }

  public canGoBack(): boolean {
    if (!this.currentPath) return false;
    return (window.history.state?.idx ?? 0) > 1;
  }

  public getPreviousPath(): string | null {
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

  private consumePayload(): ToolPayload | undefined {
    const p = this.payload;
    this.payload = undefined;
    return p;
  }

  private scrollToCard(toolId: string) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById('fav_' + toolId) ?? document.getElementById(toolId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  private setupOverviewScroll(toolId: string | null) {
    this.overviewScrollAbort?.abort();
    if (!toolId) return;

    const ac = new AbortController();
    this.overviewScrollAbort = ac;

    const timeout = setTimeout(() => ac.abort(), 2000);

    const handler = () => {
      clearTimeout(timeout);
      ac.abort();
      this.scrollToCard(toolId);
    };

    window.addEventListener('hashchange', handler, { signal: ac.signal });
    window.addEventListener('popstate', handler, { signal: ac.signal });
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

    if (typeof currentIdx !== 'number') {
      currentIdx = isTool ? 1 : 0;
      window.history.replaceState({ idx: currentIdx }, '');
    } else if (isTool && !wasTool) {
      if (currentIdx !== 1) {
        currentIdx = 1;
        window.history.replaceState({ idx: 1 }, '');
      }
    } else if (!isTool) {
      this.hasSeenOverview = true;
      if (currentIdx !== 0) {
        currentIdx = 0;
        window.history.replaceState({ idx: 0 }, '');
      }
    }

    let payload = this.consumePayload();
    if (this.hashArgs !== null) {
      payload = { ...(payload ?? {}), hashArgs: this.hashArgs };
    }
    this.listeners.forEach((l) => l(this.currentPath, payload));

    if (previousPath && !this.currentPath) {
      this.scrollToCard(previousPath);
    }
  }
}

const router = new Router();
export default router;
