import type { ScannedPage } from '../types';
import type { Point } from './perspective';
import { warp } from './perspective';
import { imageFromBlob } from './canvas';

const MAX_UNDO_STEPS = 20;

interface StateOptions {
  onHistoryChange?: () => void;
}

export function createScannerState(opts: StateOptions = {}) {
  let pages: ScannedPage[] = [];
  let currentPageIndex: number = -1;
  const cornerHistory = new Map<string, Point[][]>();

  const getPages = () => pages;
  const getCurrentPageIndex = () => currentPageIndex;
  const setPages = (p: ScannedPage[]) => {
    pages = p;
  };
  const setCurrentPageIndex = (i: number) => {
    currentPageIndex = i;
  };
  const getCurrentPage = () => (currentPageIndex >= 0 ? pages[currentPageIndex] : null);

  function pushCornerHistory() {
    const page = getCurrentPage();
    if (!page) return;
    const hist = cornerHistory.get(page.id) || [];
    hist.push(page.corners.map((p) => ({ ...p })));
    if (hist.length > MAX_UNDO_STEPS) hist.shift();
    cornerHistory.set(page.id, hist);
    if (opts.onHistoryChange) opts.onHistoryChange();
  }

  function getCornerHistory(pageId: string) {
    return cornerHistory.get(pageId) || [];
  }

  function clearCornerHistory() {
    cornerHistory.clear();
  }

  function removeCornerHistory(pageId: string) {
    cornerHistory.delete(pageId);
  }

  function invalidateWarpCache(page: ScannedPage) {
    page.warpedCanvas = null;
    // We intentionally do NOT revoke thumbnailUrl here.
    // Otherwise, dragging corners would break the image in the page list.
    // applyFilters() revokes it when applying the new warp.
  }

  function getWarpedCanvas(page: ScannedPage): HTMLCanvasElement {
    if (!page.warpedCanvas) {
      page.warpedCanvas = warp(page.originalImage!, page.corners);
    }
    return page.warpedCanvas;
  }

  async function ensureOriginalImage(page: ScannedPage | null): Promise<HTMLImageElement> {
    if (!page?.originalImage) {
      page!.originalImage = await imageFromBlob(page!.originalBlob);
    }
    return page!.originalImage;
  }

  function releaseInactiveImages() {
    for (let i = 0; i < pages.length; i++) {
      if (i !== currentPageIndex) {
        pages[i].originalImage = null;
        pages[i].warpedCanvas = null;
        if (pages[i].processedCanvas) {
          pages[i].processedCanvas.width = 0;
          pages[i].processedCanvas.height = 0;
        }
      }
    }
  }

  function cleanup() {
    pages.forEach(p => p.thumbnailUrl && URL.revokeObjectURL(p.thumbnailUrl));
    pages = [];
    currentPageIndex = -1;
    cornerHistory.clear();
  }

  return {
    getCurrentPage,
    getPages,
    getCurrentPageIndex,
    setPages,
    setCurrentPageIndex,
    pushCornerHistory,
    getCornerHistory,
    clearCornerHistory,
    removeCornerHistory,
    invalidateWarpCache,
    getWarpedCanvas,
    ensureOriginalImage,
    releaseInactiveImages,
    cleanup,
  };
}
