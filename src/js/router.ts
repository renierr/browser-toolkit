type RouteListener = (path: string | null, payload?: any) => void;

class Router {
  private currentPath: string | null = null;
  private payload: any = null;
  private listeners: RouteListener[] = [];

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
    // Try to use the new Navigation API to find the earliest entry that points to the overview
    // (no hash or a lone '#') and navigate back to it using history.go(delta).
    // @ts-ignore - Navigation API is experimental
    const nav = (window as any).navigation;
    if (nav && typeof nav.entries === 'function') {
      try {
        const navEntries = nav.entries();
        if (Array.isArray(navEntries) && navEntries.length > 1) {
          // Determine the current entry index. If navigation provides it, use that, otherwise assume the last entry is current.
          const currentIndex = typeof nav.currentEntryIndex === 'number' ? nav.currentEntryIndex : navEntries.length - 1;

          // Find the earliest entry (lowest index) before the current index whose URL has no hash or only a single '#'.
          let foundIndex = -1;
          for (let i = 0; i < currentIndex; i++) {
            const entry = navEntries[i];
            if (!entry || !entry.url) continue;
            try {
              const u = new URL(entry.url);
              if (!u.hash || u.hash === '#') {
                foundIndex = i;
                break; // stop at the first (earliest) matching entry
              }
            } catch (e) {
              // If entry.url isn't a valid absolute URL, skip this entry and continue searching.
            }
          }

          if (foundIndex >= 0 && foundIndex < currentIndex) {
            const delta = foundIndex - currentIndex; // negative number -> go back
            history.go(delta);
            return;
          }
        }
      } catch (e) {
        // If anything goes wrong, fall back to the hash-based navigation below.
        // eslint-disable-next-line no-console
        console.debug('Navigation API fallback:', e);
      }
    }

    // Fallback: set hash to overview (empty) and scroll the previously open tool into view if present.
    this.goTo('');
    if (currentTool) {
      setTimeout(() =>
        document
          .getElementById(currentTool)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
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
    this.currentPath = window.location.hash.slice(1) || null;
    if (this.currentPath) {
      setTimeout(() => window.scrollTo(0, 0));
    }
    this.listeners.forEach((l) => l(this.currentPath, this.consumePayload()));
  }
}

const router = new Router();
export default router;
