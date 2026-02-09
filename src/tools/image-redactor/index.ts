import { HistoryManager } from './history';
import { getHitHandle, normalizeRect, resizeRect } from './crop';
import { applyEffect, cleanupWorkCanvases, drawCropOverlay, drawRedactPreview } from './graphics';
import type { AppState, Operation, ToolType } from './types';
import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils.ts';
import { showMessage } from '../../js/ui.ts';
import { copyCanvasToClipboard, debounce } from '../../js/utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const elements = {
    dropzone: document.getElementById('dropzone')!,
    editor: document.getElementById('editor-container')!,
    canvas: document.getElementById('editor-canvas') as HTMLCanvasElement,
    selectionOverlay: document.getElementById('selection-overlay')!,
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
    intensityControl: document.getElementById('intensity-control')!,
    intensityInput: document.getElementById('tool-intensity') as HTMLInputElement,
    colorControl: document.getElementById('color-control')!,
    colorInput: document.getElementById('tool-color') as HTMLInputElement,
    exportFormat: document.getElementById('export-format') as HTMLSelectElement,
  };

  const ctx = elements.canvas.getContext('2d', { willReadFrequently: true })!;
  const history = new HistoryManager();
  let downloadFilename = 'redacted-image';

  // --- State ---
  const state: AppState = {
    originalImage: null,
    activeTool: 'move',
    isDragging: false,
    cropRect: { x: 0, y: 0, w: 0, h: 0 },
    dragStartMouse: { x: 0, y: 0 },
    dragStartRect: { x: 0, y: 0, w: 0, h: 0 },
    draggedHandle: null,
    lastOperation: null,
    lastOperationSnapshot: null,
    isMovingLastOp: false,
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

  const updateSelectionOverlay = () => {
    if (state.lastOperation && state.activeTool === state.lastOperation.tool) {
      const { x, y, w, h } = state.lastOperation.rect;
      const canvasRect = elements.canvas.getBoundingClientRect();
      const parentRect = elements.canvas.parentElement!.parentElement!.getBoundingClientRect();
      const scaleX = canvasRect.width / elements.canvas.width;
      const scaleY = canvasRect.height / elements.canvas.height;
      const offsetLeft = canvasRect.left - parentRect.left;
      const offsetTop = canvasRect.top - parentRect.top;

      elements.selectionOverlay.style.left = `${offsetLeft + x * scaleX}px`;
      elements.selectionOverlay.style.top = `${offsetTop + y * scaleY}px`;
      elements.selectionOverlay.style.width = `${w * scaleX}px`;
      elements.selectionOverlay.style.height = `${h * scaleY}px`;
      elements.selectionOverlay.classList.remove('hidden');
    } else {
      elements.selectionOverlay.classList.add('hidden');
    }
  };

  const updateUI = () => {
    elements.btnUndo.disabled = !history.canUndo();
    elements.btnRedo.disabled = !history.canRedo();

    // Show/hide controls based on the tool
    if (
      state.activeTool === 'blur' ||
      state.activeTool === 'pixelate' ||
      state.activeTool === 'noise'
    ) {
      elements.intensityControl.classList.remove('hidden');
      elements.colorControl.classList.add('hidden');
    } else if (state.activeTool === 'fill') {
      elements.intensityControl.classList.add('hidden');
      elements.colorControl.classList.remove('hidden');
    } else {
      elements.intensityControl.classList.add('hidden');
      elements.colorControl.classList.add('hidden');
    }

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
    updateSelectionOverlay();
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
        ctx.clearRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);

        elements.dropzone.classList.add('hidden');
        elements.editor.classList.remove('hidden');

        state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
        state.lastOperation = null;
        state.lastOperationSnapshot = null;
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
    elements.selectionOverlay.classList.add('hidden');

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
      ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
      ctx.drawImage(baseSnapshot, 0, 0);

      if (apply) {
        const { x, y, w, h } = state.cropRect;
        const cutData = ctx.getImageData(x, y, w, h);

        history.push(ctx, elements.canvas);

        elements.canvas.width = w;
        elements.canvas.height = h;
        ctx.putImageData(cutData, 0, 0);
        state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
        state.lastOperation = null;
        state.lastOperationSnapshot = null;
      }
    }
    baseSnapshot = null;

    if (state.activeTool === 'crop' && apply) {
      const moveBtn = document.querySelector('[data-tool="move"]') as HTMLElement;
      if (moveBtn) moveBtn.click();
    }
    updateUI();
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
      // Check if clicking inside the last operation rect to move it
      if (state.lastOperation && state.lastOperation.tool === state.activeTool) {
        const { x, y, w, h } = state.lastOperation.rect;
        if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
          state.isMovingLastOp = true;
          state.dragStartMouse = pos;
          state.dragStartRect = { ...state.lastOperation.rect };

          // Restore the state before the last operation
          if (state.lastOperationSnapshot) {
            ctx.putImageData(state.lastOperationSnapshot, 0, 0);
            baseSnapshot = createSnapshot();
            drawRedactPreview(ctx, elements.canvas, baseSnapshot, state.lastOperation.rect);
          }
          elements.selectionOverlay.classList.add('hidden');
          return;
        }
      }

      state.dragStartMouse = pos;
      baseSnapshot = createSnapshot();
      // Save snapshot before starting new operation
      state.lastOperationSnapshot = ctx.getImageData(
        0,
        0,
        elements.canvas.width,
        elements.canvas.height
      );
      elements.selectionOverlay.classList.add('hidden');
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (state.activeTool === 'move') return;

    const pos = getPos(e);

    if (state.activeTool === 'crop' && !state.isDragging) {
      const hit = getHitHandle(pos, state.cropRect);
      elements.canvas.style.cursor = hit ? 'pointer' : 'default';
    } else if (
      state.lastOperation &&
      state.lastOperation.tool === state.activeTool &&
      !state.isDragging
    ) {
      const { x, y, w, h } = state.lastOperation.rect;
      if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
        elements.canvas.style.cursor = 'move';
      } else {
        elements.canvas.style.cursor = 'crosshair';
      }
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
      } else if (state.isMovingLastOp && state.lastOperation && baseSnapshot) {
        const dx = pos.x - state.dragStartMouse.x;
        const dy = pos.y - state.dragStartMouse.y;

        const newRect = {
          ...state.dragStartRect,
          x: state.dragStartRect.x + dx,
          y: state.dragStartRect.y + dy,
        };
        drawRedactPreview(ctx, elements.canvas, baseSnapshot, newRect);
      } else if (baseSnapshot) {
        const w = pos.x - state.dragStartMouse.x;
        const h = pos.y - state.dragStartMouse.y;
        const color = state.activeTool === 'fill' ? elements.colorInput.value : undefined;
        drawRedactPreview(
          ctx,
          elements.canvas,
          baseSnapshot,
          normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h),
          color
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
      if (state.isMovingLastOp && state.lastOperation) {
        const dx = getPos(e).x - state.dragStartMouse.x;
        const dy = getPos(e).y - state.dragStartMouse.y;
        state.lastOperation.rect.x = state.dragStartRect.x + dx;
        state.lastOperation.rect.y = state.dragStartRect.y + dy;

        ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
        ctx.drawImage(baseSnapshot, 0, 0);
        applyEffect(ctx, elements.canvas, state.lastOperation);
        state.isMovingLastOp = false;
        baseSnapshot = null;
        updateUI();
        return;
      }

      ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
      ctx.drawImage(baseSnapshot, 0, 0);
      const w = getPos(e).x - state.dragStartMouse.x;
      const h = getPos(e).y - state.dragStartMouse.y;
      const rect = normalizeRect(state.dragStartMouse.x, state.dragStartMouse.y, w, h);

      if (rect.w > 5 && rect.h > 5) {
        history.push(ctx, elements.canvas);
        const intensity = parseInt(elements.intensityInput.value, 10);
        const color = elements.colorInput.value;
        const operation: Operation = {
          tool: state.activeTool,
          rect,
          intensity,
          color,
        };
        applyEffect(ctx, elements.canvas, operation);

        if (
          state.activeTool === 'blur' ||
          state.activeTool === 'pixelate' ||
          state.activeTool === 'fill' ||
          state.activeTool === 'noise'
        ) {
          state.lastOperation = operation;
        } else {
          state.lastOperation = null;
          state.lastOperationSnapshot = null;
        }
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

      if (state.activeTool !== newTool && newTool !== 'move' && state.activeTool !== 'move') {
        state.lastOperation = null;
        state.lastOperationSnapshot = null;
      }

      elements.tools.forEach((b) => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      state.activeTool = newTool;
      updateUI();
    });
  });

  elements.intensityInput.addEventListener(
    'input',
    debounce(() => {
      if (!state.lastOperation) return;

      if (state.activeTool !== state.lastOperation.tool) return;

      // We need to restore the state BEFORE the last operation to re-apply with new intensity
      if (state.lastOperationSnapshot) {
        ctx.putImageData(state.lastOperationSnapshot, 0, 0);
        state.lastOperation.intensity = parseInt(elements.intensityInput.value, 10);
        applyEffect(ctx, elements.canvas, state.lastOperation);
      }
    }, 50)
  );

  elements.colorInput.addEventListener(
    'input',
    debounce(() => {
      if (!state.lastOperation) return;
      if (state.activeTool !== 'fill') return;
      if (state.activeTool !== state.lastOperation.tool) return;

      if (state.lastOperationSnapshot) {
        ctx.putImageData(state.lastOperationSnapshot, 0, 0);
        state.lastOperation.color = elements.colorInput.value;
        applyEffect(ctx, elements.canvas, state.lastOperation);
      }
    }, 50)
  );

  elements.btnApplyCrop.addEventListener('click', () => exitCropMode(true));
  elements.btnCancelCrop.addEventListener('click', () => {
    state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
    exitCropMode(false);
    const moveBtn = document.querySelector('[data-tool="move"]') as HTMLElement;
    if (moveBtn) moveBtn.click();
  });

  elements.btnUndo.addEventListener('click', () => {
    history.undo(ctx, elements.canvas);
    state.lastOperation = null;
    state.lastOperationSnapshot = null;
    if (state.activeTool === 'crop') exitCropMode(false);
    updateUI();
  });

  elements.btnRedo.addEventListener('click', () => {
    history.redo(ctx, elements.canvas);
    state.lastOperation = null;
    state.lastOperationSnapshot = null;
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
    state.lastOperation = null;
    state.lastOperationSnapshot = null;
    history.clear();
    downloadFilename = 'redacted-image';
    updateUI();
  });

  elements.canvas.addEventListener('pointerdown', onPointerDown);
  elements.canvas.addEventListener('pointermove', onPointerMove);
  elements.canvas.addEventListener('pointerup', onPointerUp);

  elements.btnDownload.addEventListener('click', () => {
    if (state.activeTool === 'crop') exitCropMode(true);
    const format = elements.exportFormat.value;
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
    const quality = format === 'image/png' ? undefined : 0.92;
    const link = document.createElement('a');
    link.download = `${downloadFilename}.${ext}`;
    link.href = elements.canvas.toDataURL(format, quality);
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
      const format = elements.exportFormat.value;
      const formatKey = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
      const quality = format === 'image/png' ? undefined : 0.92;
      await copyCanvasToClipboard(elements.canvas, formatKey === 'webp' ? 'jpg' : formatKey, quality);
      showMessage('Copied to clipboard');
      console.log('Copied to clipboard');
    } catch (err) {
      showMessage('Failed to copy image to clipboard', { type: 'alert' });
    }
  });

  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      const file = files[0]
      downloadFilename = file.name.replace(/\.[^/.]+$/, '') + '-redacted';
      loadImage(file);
    }
  });

  return () => {
    cleanupWorkCanvases();
    history.clear();
    state.originalImage = null;
    state.lastOperation = null;
    state.lastOperationSnapshot = null;
    baseSnapshot = null;
    rafId = null;
  };
}
