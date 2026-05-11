import { renderTool } from '../render.ts';
import { setLastUsed } from '../tool-chooser.ts';
import { tools } from '../tools.ts';

let activeViewTransition: ViewTransition | null = null;

export type RouteHandler = (path: string | null, payload?: unknown) => void;

export type CreateRouteHandlerDeps = {
  renderOverview: () => void;
};

export function createRouteHandler(deps: CreateRouteHandlerDeps): RouteHandler {
  return (path: string | null, payload?: unknown): void => {
    const doRender = (): void => {
      if (path) {
        const tool = tools.find((t) => t.path === path);
        setLastUsed(path);
        renderTool(tool, payload);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      } else {
        deps.renderOverview();
      }
    };

    const appEl = document.getElementById('app');
    if (appEl) {
      try {
        (appEl as HTMLElement).style.viewTransitionName = path ? `tool-${path}` : 'overview';
      } catch {
        // no-op
      }
    }

    const docAny = document as Document & {
      startViewTransition?: (callback: () => void) => ViewTransition;
    };

    if (typeof docAny.startViewTransition === 'function') {
      const pendingState = (activeViewTransition as unknown as { state?: string } | null)?.state;
      if (pendingState === 'pending') {
        doRender();
        return;
      }

      try {
        activeViewTransition = docAny.startViewTransition(() => doRender());
      } catch (error) {
        console.warn('[script] View Transition failed, falling back to direct render', error);
        doRender();
      }
      return;
    }

    doRender();
  };
}
