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
    this.goTo('');
  }

  public getCurrentPath(): string | null {
    return this.currentPath;
  }

  /**
   * Returns the payload and clears it.
   */
  public consumePayload(): any {
    const p = this.payload;
    this.payload = null;
    return p;
  }

  private handleHashChange() {
    this.currentPath = window.location.hash.slice(1) || null;
    this.listeners.forEach((l) => l(this.currentPath, this.payload));
  }
}

const router = new Router();
export default router;
