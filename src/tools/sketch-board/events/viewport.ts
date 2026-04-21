import type { SketchDom } from '../dom.ts';

export function setupViewportEvents(
  dom: SketchDom,
  onZoomIn: () => void,
  onZoomOut: () => void,
  onZoomReset: () => void,
  setBackground: (bgClass: string) => void
) {
  dom.btnZoomIn.addEventListener('click', onZoomIn);
  dom.btnZoomOut.addEventListener('click', onZoomOut);
  dom.btnZoomReset.addEventListener('click', onZoomReset);
  dom.btnZoomInMobile.addEventListener('click', onZoomIn);
  dom.btnZoomOutMobile.addEventListener('click', onZoomOut);
  dom.btnZoomResetMobile.addEventListener('click', onZoomReset);
  dom.canvasBg.addEventListener('change', () => setBackground(dom.canvasBg.value));
}
