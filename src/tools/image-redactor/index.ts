import { HistoryManager } from './history';
import { getHitHandle, resizeRect, normalizeRect } from './crop';
import { drawCropOverlay, drawRedactPreview, applyEffect } from './graphics';
import type { AppState, ToolType } from './types';
import { setupFileDropzone } from '../../js/file-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const elements = {
    dropzone: document.getElementById('dropzone')!,
    editor: document.getElementById('editor-container')!,
    canvas: document.getElementById('editor-canvas') as HTMLCanvasElement,
    hint: document.getElementById('hint-text')!,
    cropActions: document.getElementById('crop-actions')!,
    btnUndo: document.getElementById('btn-undo') as HTMLButtonElement,
    tools: document.querySelectorAll('[data-tool]'),
    btnApplyCrop: document.getElementById('btn-apply-crop')!,
    btnCancelCrop: document.getElementById('btn-cancel-crop')!,
    btnReset: document.getElementById('btn-reset')!,
    btnDownload: document.getElementById('btn-download')!,
    cropToolBtn: document.getElementById('btn-tool-crop')!,
  };

  const ctx = elements.canvas.getContext('2d', { willReadFrequently: true })!;
  const history = new HistoryManager();

  // --- State ---
  const state: AppState = {
    originalImage: null,
    activeTool: 'pixelate',
    isDragging: false,
    cropRect: { x: 0, y: 0, w: 0, h: 0 },
    dragStartMouse: { x: 0, y: 0 },
    dragStartRect: { x: 0, y: 0, w: 0, h: 0 },
    draggedHandle: null,
  };

  let baseSnapshot: ImageData | null = null;

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
    elements.hint.textContent =
      state.activeTool === 'crop'
        ? "Use edges to crop and click 'Apply' to submit."
        : 'Mark areas to redact.';
  };

  const loadImage = (file: File) => {
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
        elements.editor.classList.add('flex');

        history.clear();
        updateUI();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- Mode Management ---
  const enterCropMode = () => {
    baseSnapshot = ctx.getImageData(0, 0, elements.canvas.width, elements.canvas.height);
    elements.cropActions.classList.remove('hidden');

    // Init Rect (80% centered)
    const w = elements.canvas.width * 0.8;
    const h = elements.canvas.height * 0.8;
    state.cropRect = {
      x: (elements.canvas.width - w) / 2,
      y: (elements.canvas.height - h) / 2,
      w,
      h,
    };
    drawCropOverlay(ctx, elements.canvas, state.cropRect, baseSnapshot);
  };

  const exitCropMode = (apply: boolean) => {
    elements.cropActions.classList.add('hidden');
    elements.cropActions.classList.remove('flex');
    elements.cropToolBtn.classList.remove('btn-active', 'btn-primary');

    if (baseSnapshot) {
      // Restore original view first
      ctx.putImageData(baseSnapshot, 0, 0);

      if (apply) {
        // Cut & Resize
        const { x, y, w, h } = state.cropRect;
        const cutData = ctx.getImageData(x, y, w, h);

        history.push(ctx, elements.canvas); // Save undo

        elements.canvas.width = w;
        elements.canvas.height = h;
        ctx.putImageData(cutData, 0, 0);
      }
    }
    baseSnapshot = null;

    // Reset to pixelate tool
    const pixBtn = document.querySelector('[data-tool="pixelate"]') as HTMLElement;
    if (pixBtn) pixBtn.click();
  };

  // --- Event Handlers ---
  const onPointerDown = (e: PointerEvent) => {
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
      // Redact Mode
      state.dragStartMouse = pos;
      baseSnapshot = ctx.getImageData(0, 0, elements.canvas.width, elements.canvas.height);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const pos = getPos(e);

    // Cursor Logic
    if (state.activeTool === 'crop' && !state.isDragging) {
      const hit = getHitHandle(pos, state.cropRect);
      elements.canvas.style.cursor = hit ? 'pointer' : 'default';
    }

    if (!state.isDragging) return;

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
      // Redact Preview
      const w = pos.x - state.dragStartMouse.x;
      const h = pos.y - state.dragStartMouse.y;
      drawRedactPreview(
        ctx,
        baseSnapshot,
        normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h)
      );
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    elements.canvas.releasePointerCapture(e.pointerId);
    state.isDragging = false;

    if (state.activeTool !== 'crop' && baseSnapshot) {
      // Apply Redact
      ctx.putImageData(baseSnapshot, 0, 0); // Clear preview
      const w = getPos(e).x - state.dragStartMouse.x;
      const h = getPos(e).y - state.dragStartMouse.y;
      const rect = normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h);

      if (rect.w > 5 && rect.h > 5) {
        history.push(ctx, elements.canvas);
        applyEffect(ctx, elements.canvas, rect, state.activeTool as any);
      }
      baseSnapshot = null;
    }
  };

  // --- Wiring ---
  elements.tools.forEach((btn) => {
    btn.addEventListener('click', () => {
      const newTool = btn.getAttribute('data-tool') as ToolType;

      // Switch Logic
      if (newTool === 'crop' && state.activeTool !== 'crop') {
        enterCropMode();
      } else if (state.activeTool === 'crop' && newTool !== 'crop') {
        exitCropMode(false);
      }

      // UI Update
      elements.tools.forEach((b) => b.classList.remove('btn-active', 'btn-primary'));
      btn.classList.add(newTool === 'crop' ? 'btn-primary' : 'btn-active');
      state.activeTool = newTool;
      updateUI();
    });
  });

  elements.btnApplyCrop.addEventListener('click', () => exitCropMode(true));
  elements.btnCancelCrop.addEventListener('click', () => exitCropMode(false));

  elements.btnUndo.addEventListener('click', () => {
    history.undo(ctx, elements.canvas);
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

  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      loadImage(files[0]);
    }
  });

  return () => {
    elements.canvas.removeEventListener('pointerdown', onPointerDown);
  };
}
