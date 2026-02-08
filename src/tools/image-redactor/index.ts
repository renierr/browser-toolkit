import { HistoryManager } from './history';
import { getHitHandle, resizeRect, normalizeRect } from './crop';
import { drawCropOverlay, drawRedactPreview, applyEffect } from './graphics';
import type { AppState, ToolType } from './types';
import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import { copyCanvasToClipboard } from '../../js/utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const elements = {
    dropzone: document.getElementById('dropzone')!,
    editor: document.getElementById('editor-container')!,
    canvas: document.getElementById('editor-canvas') as HTMLCanvasElement,
    hint: document.getElementById('hint-text')!,
    cropActions: document.getElementById('crop-actions')!,
    btnUndo: document.getElementById('btn-undo') as HTMLButtonElement,
    btnRedo: document.getElementById('btn-redo') as HTMLButtonElement,
    tools: document.querySelectorAll('[data-tool]'),
    btnApplyCrop: document.getElementById('btn-apply-crop')!,
    btnCancelCrop: document.getElementById('btn-cancel-crop')!,
    btnReset: document.getElementById('btn-reset')!,
    btnDownload: document.getElementById('btn-download')!,
    cropToolBtn: document.getElementById('btn-tool-crop')!,
    pasteBtn: document.getElementById('paste-btn')!,
    btnCopyClipboard: document.getElementById('btn-copy-clipboard')!,
  };

  const ctx = elements.canvas.getContext('2d', { willReadFrequently: true })!;
  const history = new HistoryManager();

  // --- State ---
  const state: AppState = {
    originalImage: null,
    activeTool: 'move',
    isDragging: false,
    cropRect: { x: 0, y: 0, w: 0, h: 0 },
    dragStartMouse: { x: 0, y: 0 },
    dragStartRect: { x: 0, y: 0, w: 0, h: 0 },
    draggedHandle: null,
  };

  let baseSnapshot: HTMLCanvasElement | null = null;
  let rafId: number | null = null;

  // --- Helpers ---
  const getPos = (e: PointerEvent) => {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const updateUI = () => {
    elements.btnUndo.disabled = !history.canUndo();
    elements.btnRedo.disabled = !history.canRedo();

    if (state.activeTool === 'move') {
      elements.canvas.style.touchAction = 'auto';
      elements.canvas.style.cursor = 'move';
      elements.hint.textContent = 'Scroll or zoom the image.';
    } else {
      elements.canvas.style.touchAction = 'none';
      elements.canvas.style.cursor = state.activeTool === 'crop' ? 'default' : 'crosshair';
      elements.hint.textContent =
        state.activeTool === 'crop'
          ? "Use edges to crop and click 'Apply' to submit."
          : 'Mark areas to redact.';
    }
  };

  const createSnapshot = () => {
    const off = document.createElement('canvas');
    off.width = elements.canvas.width;
    off.height = elements.canvas.height;
    off.getContext('2d')!.drawImage(elements.canvas, 0, 0);
    return off;
  };

  const loadImage = (file: Blob) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.originalImage = img;
        elements.canvas.width = img.width;
        elements.canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        elements.dropzone.classList.add('hidden');
        elements.editor.classList.remove('hidden');

        state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
        history.clear();
        updateUI();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- Mode Management ---
  const enterCropMode = () => {
    baseSnapshot = createSnapshot();
    elements.cropActions.classList.remove('hidden');

    if (state.cropRect.w === 0 || state.cropRect.h === 0) {
      const w = elements.canvas.width * 0.8;
      const h = elements.canvas.height * 0.8;
      state.cropRect = {
        x: (elements.canvas.width - w) / 2,
        y: (elements.canvas.height - h) / 2,
        w,
        h,
      };
    }
    drawCropOverlay(ctx, elements.canvas, state.cropRect, baseSnapshot);
  };

  const exitCropMode = (apply: boolean) => {
    elements.cropActions.classList.add('hidden');
    elements.cropActions.classList.remove('flex');
    elements.cropToolBtn.classList.remove('btn-active', 'btn-primary');

    if (baseSnapshot) {
      ctx.drawImage(baseSnapshot, 0, 0);

      if (apply) {
        const { x, y, w, h } = state.cropRect;
        const cutData = ctx.getImageData(x, y, w, h);

        history.push(ctx, elements.canvas);

        elements.canvas.width = w;
        elements.canvas.height = h;
        ctx.putImageData(cutData, 0, 0);
        state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
      }
    }
    baseSnapshot = null;

    if (state.activeTool === 'crop' && apply) {
      const moveBtn = document.querySelector('[data-tool="move"]') as HTMLElement;
      if (moveBtn) moveBtn.click();
    }
  };

  // --- Event Handlers ---
  const onPointerDown = (e: PointerEvent) => {
    if (state.activeTool === 'move') return;

    elements.canvas.setPointerCapture(e.pointerId);
    state.isDragging = true;
    const pos = getPos(e);

    if (state.activeTool === 'crop') {
      state.draggedHandle = getHitHandle(pos, state.cropRect);
      if (state.draggedHandle) {
        state.dragStartMouse = pos;
        state.dragStartRect = { ...state.cropRect };
      }
    } else {
      state.dragStartMouse = pos;
      baseSnapshot = createSnapshot();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (state.activeTool === 'move') return;

    const pos = getPos(e);

    if (state.activeTool === 'crop' && !state.isDragging) {
      const hit = getHitHandle(pos, state.cropRect);
      elements.canvas.style.cursor = hit ? 'pointer' : 'default';
    }

    if (!state.isDragging) return;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (state.activeTool === 'crop' && baseSnapshot) {
        if (state.draggedHandle) {
          const delta = {
            x: pos.x - state.dragStartMouse.x,
            y: pos.y - state.dragStartMouse.y,
          };
          state.cropRect = resizeRect(state.draggedHandle, state.dragStartRect, delta, {
            w: elements.canvas.width,
            h: elements.canvas.height,
          });
          drawCropOverlay(ctx, elements.canvas, state.cropRect, baseSnapshot);
        }
      } else if (baseSnapshot) {
        const w = pos.x - state.dragStartMouse.x;
        const h = pos.y - state.dragStartMouse.y;
        drawRedactPreview(
          ctx,
          baseSnapshot,
          normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h)
        );
      }
    });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (state.activeTool === 'move') return;

    elements.canvas.releasePointerCapture(e.pointerId);
    state.isDragging = false;
    if (rafId) cancelAnimationFrame(rafId);

    if (state.activeTool !== 'crop' && baseSnapshot) {
      ctx.drawImage(baseSnapshot, 0, 0);
      const w = getPos(e).x - state.dragStartMouse.x;
      const h = getPos(e).y - state.dragStartMouse.y;
      const rect = normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h);

      if (rect.w > 5 && rect.h > 5) {
        history.push(ctx, elements.canvas);
        applyEffect(ctx, elements.canvas, rect, state.activeTool as any);
      }
      baseSnapshot = null;
    }
    updateUI();
  };

  // --- Wiring ---
  elements.tools.forEach((btn) => {
    btn.addEventListener('click', () => {
      const newTool = btn.getAttribute('data-tool') as ToolType;

      if (newTool === 'crop' && state.activeTool !== 'crop') {
        enterCropMode();
      } else if (state.activeTool === 'crop' && newTool !== 'crop') {
        exitCropMode(false);
      }

      elements.tools.forEach((b) => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      state.activeTool = newTool;
      updateUI();
    });
  });

  elements.btnApplyCrop.addEventListener('click', () => exitCropMode(true));
  elements.btnCancelCrop.addEventListener('click', () => {
    state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
    exitCropMode(false);
    const moveBtn = document.querySelector('[data-tool="move"]') as HTMLElement;
    if (moveBtn) moveBtn.click();
  });

  elements.btnUndo.addEventListener('click', () => {
    history.undo(ctx, elements.canvas);
    if (state.activeTool === 'crop') exitCropMode(false);
    updateUI();
  });

  elements.btnRedo.addEventListener('click', () => {
    history.redo(ctx, elements.canvas);
    if (state.activeTool === 'crop') exitCropMode(false);
    updateUI();
  });

  elements.btnReset.addEventListener('click', () => {
    elements.dropzone.classList.remove('hidden');
    elements.editor.classList.add('hidden');

    if (state.activeTool === 'crop') exitCropMode(false);
    state.originalImage = null;
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    elements.canvas.width = 0;
    elements.canvas.height = 0;
    baseSnapshot = null;
    state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
    state.dragStartMouse = { x: 0, y: 0 };
    state.dragStartRect = { x: 0, y: 0, w: 0, h: 0 };
    state.draggedHandle = null;
    history.clear();
    updateUI();
  });

  elements.canvas.addEventListener('pointerdown', onPointerDown);
  elements.canvas.addEventListener('pointermove', onPointerMove);
  elements.canvas.addEventListener('pointerup', onPointerUp);

  elements.btnDownload.addEventListener('click', () => {
    if (state.activeTool === 'crop') exitCropMode(true);
    const link = document.createElement('a');
    link.download = `redacted-${Date.now()}.png`;
    link.href = elements.canvas.toDataURL('image/png');
    link.click();
  });

  elements.pasteBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imageBlob = await retrieveImageBlobFromClipboard();
    if (imageBlob) {
      loadImage(imageBlob);
    } else {
      showMessage('No image found in clipboard.', { type: 'info', timeoutMs: 5000 });
    }
  });

  elements.btnCopyClipboard.addEventListener('click', async () => {
    try {
      await copyCanvasToClipboard(elements.canvas);
      showMessage('Copied to clipboard');
      console.log('Copied to clipboard');
    } catch (err) {
      showMessage('Failed to copy image to clipboard', { type: 'alert' })
    }
  });

  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      loadImage(files[0]);
    }
  });

  return () => {
    elements.canvas.removeEventListener('pointerdown', onPointerDown);
  };
}
