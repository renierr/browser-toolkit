import { downloadFile } from '../../js/file-utils.ts';
import { hideProgress, showMessage, showProgress } from '../../js/ui.ts';
import {
  applySettings,
  DEFAULT_SIGNATURE_SETTINGS,
  loadSettings,
  resetToDefaults,
  saveSettings,
} from './settings.ts';
import { getDomElements } from './dom.ts';
import type {
  Cmd,
  CurveMode,
  Point,
  RDPMode,
  SignatureData,
  SignatureSettings,
} from './signature-types.ts';
import { buildNormalizedFromPaths, computeSegmentWidth, simplifyRDP } from './calculation.ts';
import { deleteSignature, getAllSignatures, putSignature } from './signature-store.ts';
import { drawSignaturePath } from './drawing.ts';
import { generatePng, generateSvg, generateWebMAnimation } from './export.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const dom = getDomElements(document);

  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  // Performance Buffer: Stores "dried" ink to keep the UI snappy
  const memCanvas = document.createElement('canvas');
  const memCtx = memCanvas.getContext('2d')!;

  let isDrawing = false;
  let paths: Point[][] = [];
  let currentPath: Point[] = [];

  let undoStack: Cmd[] = [];
  let redoStack: Cmd[] = [];

  let redrawTimeout: number | null = null;
  let currentSettings: SignatureSettings = loadSettings();
  let prevLiveWidth = currentSettings.penWidth;
  let lastLoadedSignatureId: string | null = null;

  const dpr = window.devicePixelRatio || 1;
  const userWidth = () => dom.canvas.width / dpr;
  const userHeight = () => dom.canvas.height / dpr;

  // Set initial display values
  applySettings(currentSettings);

  // --- Sizing ---
  const syncCanvasSize = () => {
    const rect = dom.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (dom.canvas.width !== rect.width * dpr || dom.canvas.height !== rect.height * dpr) {
      dom.canvas.width = memCanvas.width = rect.width * dpr;
      dom.canvas.height = memCanvas.height = rect.height * dpr;

      // Normalize context to use CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      memCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawStatic();
    }
  };

  function debouncedRedraw() {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = window.setTimeout(() => {
      memCtx.clearRect(0, 0, userWidth(), userHeight());
      paths.forEach((p) => {
        drawSignaturePath(memCtx, p, currentSettings);
      });
      drawStatic();
      redrawTimeout = null;
    }, 100);
  }

  function getPos(e: PointerEvent): Point {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      timestamp: performance.now(),
      pressure: e.pressure || 1,
    };
  }

  function drawStatic() {
    // Clear visible canvas in user units, then draw the baked memCanvas scaled to user units.
    ctx!.clearRect(0, 0, userWidth(), userHeight());
    ctx!.drawImage(memCanvas, 0, 0, userWidth(), userHeight());
  }

  function startDrawing(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    isDrawing = true;
    currentPath = [getPos(e)];
    prevLiveWidth = currentSettings.penWidth;

    dom.canvas.setPointerCapture(e.pointerId);
  }

  function draw(e: PointerEvent) {
    if (!isDrawing) return;
    const pos = getPos(e);
    const prev = currentPath[currentPath.length - 1];

    // Cheap threshold check
    if (prev) {
      const distSq = (pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2;
      if (distSq < currentSettings.moveTolerance * currentSettings.moveTolerance) return;
    }

    currentPath.push(pos);

    // DRAFT MODE: Additive drawing only
    // We only draw the new segment on top of the existing canvas.
    if (currentPath.length > 1) {
      const p0 = currentPath[currentPath.length - 2];
      const p1 = currentPath[currentPath.length - 1];
      ctx!.beginPath();
      const rawSegmentW = computeSegmentWidth(p0, p1, currentSettings);
      const liveW =
        prevLiveWidth * currentSettings.widthSmoothing +
        rawSegmentW * (1 - currentSettings.widthSmoothing);
      prevLiveWidth = liveW;
      ctx!.lineWidth = liveW;
      ctx!.lineCap = 'round';
      ctx!.strokeStyle = dom.penColorInput.value;
      ctx!.moveTo(p0.x, p0.y);
      ctx!.lineTo(p1.x, p1.y);
      ctx!.stroke();
    }
    e.preventDefault();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    const currentRDPMode: RDPMode = currentSettings.rdpMode || 'none';
    let epsilon = 0;

    if (currentRDPMode === 'low') {
      epsilon = 0.5;
    } else if (currentRDPMode === 'medium') {
      epsilon = 1.0;
    } else if (currentRDPMode === 'high') {
      epsilon = 1.5;
    }
    const simplified = epsilon > 0 ? simplifyRDP(currentPath, epsilon) : currentPath;

    // Bake High-Quality Curve (Correction)
    drawSignaturePath(memCtx, simplified, currentSettings);

    // Command-based: store the single added path
    const savedPath: Point[] = simplified.map((pt): Point => ({ ...pt }));
    undoStack.push({ type: 'addPath', path: savedPath });
    // Clear redo since new action invalidates redo history
    redoStack = [];
    updateUndoRedoButtons();

    paths.push(simplified);
    currentPath = [];
    drawStatic();
  }

  // --- Listeners & Observers ---

  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(dom.canvas);
  syncCanvasSize();

  dom.canvas.addEventListener('pointerdown', startDrawing, { passive: false });
  dom.canvas.addEventListener('pointermove', draw, { passive: false });
  window.addEventListener('pointerup', stopDrawing, { passive: false });
  dom.canvas.addEventListener('pointercancel', stopDrawing, { passive: false });
  dom.canvas.style.touchAction = 'none';
  dom.canvasContainer.style.touchAction = 'none';

  const bindInput = (
    element: HTMLInputElement | HTMLSelectElement | null | undefined,
    handler: (value: string) => void,
    options?: {
      event?: 'input' | 'change';
      displayEl?: HTMLElement | null;
      redraw?: boolean;
      save?: boolean;
    }
  ) => {
    element?.addEventListener(options?.event || 'input', () => {
      handler(element.value);
      if (options?.displayEl) options.displayEl.textContent = element.value;
      if (options?.redraw) debouncedRedraw();
      if (options?.save) saveSettings(currentSettings);
    });
  };

  bindInput(
    dom.penColorInput,
    (v) => {
      currentSettings.penColor = v;
    },
    { redraw: true, save: true }
  );
  bindInput(
    dom.penWidthInput,
    (v) => {
      currentSettings.penWidth = parseInt(v);
      // display handled by displayEl below as well, but keep explicit for clarity
      dom.penWidthValue.textContent = v;
    },
    { redraw: true, save: true }
  );
  bindInput(
    dom.curveModeSelect,
    (v) => {
      currentSettings.curveMode = v as CurveMode;
    },
    { event: 'change', redraw: true, save: true }
  );
  bindInput(
    dom.rdpModeSelect,
    (v) => {
      currentSettings.rdpMode = v as RDPMode;
    },
    { event: 'change', save: true }
  );
  bindInput(
    dom.dpiInput,
    (v) => {
      currentSettings.dpi = parseInt(v);
    },
    { event: 'change', save: true }
  );

  bindInput(
    dom.moveToleranceInput,
    (v) => {
      currentSettings.moveTolerance = parseInt(v);
    },
    { displayEl: dom.moveToleranceValue, save: true }
  );
  bindInput(
    dom.minWidthFactorInput,
    (v) => {
      currentSettings.minWidthFactor = parseFloat(v);
    },
    { displayEl: dom.minWidthFactorValue, redraw: true, save: true }
  );
  bindInput(
    dom.maxWidthFactorInput,
    (v) => {
      currentSettings.maxWidthFactor = parseFloat(v);
    },
    { displayEl: dom.maxWidthFactorValue, redraw: true, save: true }
  );
  bindInput(
    dom.velocitySensitivityInput,
    (v) => {
      currentSettings.velocitySensitivity = parseFloat(v);
    },
    { displayEl: dom.velocitySensitivityValue, redraw: true, save: true }
  );
  bindInput(
    dom.pressureInfluenceInput,
    (v) => {
      currentSettings.pressureInfluence = parseFloat(v);
    },
    { displayEl: dom.pressureInfluenceValue, redraw: true, save: true }
  );
  bindInput(
    dom.velocityInfluenceInput,
    (v) => {
      currentSettings.velocityInfluence = parseFloat(v);
    },
    { displayEl: dom.velocityInfluenceValue, redraw: true, save: true }
  );
  bindInput(
    dom.widthSmoothingInput,
    (v) => {
      currentSettings.widthSmoothing = parseFloat(v);
    },
    { displayEl: dom.widthSmoothingValue, redraw: true, save: true }
  );

  // Reset to defaults button
  dom.resetBtn.addEventListener('click', () => {
    currentSettings = Object.assign({}, DEFAULT_SIGNATURE_SETTINGS);
    resetToDefaults();
    debouncedRedraw();
  });

  // --- Controls ---

  dom.clearBtn.addEventListener('click', () => {
    if (paths.length > 0) {
      const prev = paths.map((p) => p.slice());
      undoStack.push({ type: 'clear', prev });
      redoStack = [];
    }
    paths = [];
    lastLoadedSignatureId = null;
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    ctx.clearRect(0, 0, userWidth(), userHeight());
    prevLiveWidth = currentSettings.penWidth;
    updateUndoRedoButtons();
  });

  // Undo / Redo helpers
  function applyPaths(newPaths: Point[][]) {
    paths = newPaths.map((p) => p.slice());
    memCtx.clearRect(0, 0, userWidth(), userHeight());
    paths.forEach((p) => drawSignaturePath(memCtx, p, currentSettings));
    drawStatic();
  }

  function updateUndoRedoButtons() {
    try {
      dom.undoBtn.disabled = undoStack.length === 0;
      dom.redoBtn.disabled = redoStack.length === 0;
    } catch (e) {
      // no-op if dom not ready
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    const cmd = undoStack.pop()!;
    switch (cmd.type) {
      case 'addPath': {
        // remove last path (the one that was added)
        // push same command to redo so redo can re-add it
        redoStack.push(cmd);
        if (paths.length > 0) paths.pop();
        applyPaths(paths);
        break;
      }
      case 'clear': {
        // restore previous paths
        redoStack.push(cmd);
        applyPaths(cmd.prev);
        break;
      }
      case 'replace': {
        // revert to prev
        redoStack.push(cmd);
        applyPaths(cmd.prev);
        lastLoadedSignatureId = null;
        break;
      }
    }
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const cmd = redoStack.pop()!;
    switch (cmd.type) {
      case 'addPath': {
        // re-add the path
        undoStack.push(cmd);
        paths.push(cmd.path);
        applyPaths(paths);
        break;
      }
      case 'clear': {
        // re-apply clear (remove all paths)
        undoStack.push(cmd);
        paths = [];
        applyPaths(paths);
        break;
      }
      case 'replace': {
        // re-apply next
        undoStack.push(cmd);
        applyPaths(cmd.next);
        break;
      }
    }
    updateUndoRedoButtons();
  }

  // Wire buttons and keyboard shortcuts
  dom.undoBtn?.addEventListener('click', () => undo());
  dom.redoBtn?.addEventListener('click', () => redo());

  // initialize disabled state
  updateUndoRedoButtons();

  dom.saveBtn.addEventListener('click', async () => {
    if (paths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentSettings.penWidth
    );

    // Generate Preview Image
    const settings: SignatureSettings = { ...currentSettings, dpi: 72 };
    const { blob } = await generatePng(normalizedPaths, logicalWidth, logicalHeight, settings);

    // Save
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const signature: SignatureData = {
        id: lastLoadedSignatureId || crypto.randomUUID(),
        image: reader.result as string,
        width: logicalWidth,
        height: logicalHeight,
        timestamp: Date.now(),
        settings: currentSettings,
        rawPaths: normalizedPaths,
      };
      lastLoadedSignatureId = null;

      // Persist into IndexedDB
      await putSignature(signature);

      // Cleanup
      paths = [];
      undoStack = [];
      redoStack = [];
      memCtx.clearRect(0, 0, userWidth(), userHeight());
      drawStatic();
      void renderSignatures();
      updateUndoRedoButtons();
    };
  });

  dom.copyClipboardBtn.addEventListener('click', async () => {
    if (paths.length === 0 && currentPath.length === 0) {
      showMessage('No signature to copy.', { type: 'warning', timeoutMs: 5000 });
    }

    const allPaths: Point[][] = paths.slice();
    if (currentPath.length > 0) allPaths.push(currentPath.slice());
    if (allPaths.length === 0) return;

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      allPaths,
      currentSettings.penWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      currentSettings
    );

    try {
      const data = [new ClipboardItem({ [blob.type]: blob })];
      await navigator.clipboard.write(data);
      showMessage('Image copied to clipboard!', { timeoutMs: 5000 });
    } catch (err) {
      showMessage('Failed to copy image to clipboard.', { type: 'alert', timeoutMs: 5000 });
    }
  });

  dom.downloadPngBtn.addEventListener('click', async () => {
    if (paths.length === 0) {
      showMessage('No signature to export.', { type: 'warning', timeoutMs: 5000 });
      return;
    }

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentSettings.penWidth
    );

    const { blob } = await generatePng(
      normalizedPaths,
      logicalWidth,
      logicalHeight,
      currentSettings
    );

    await downloadFile(blob, `signature-${Date.now()}.png`);
  });

  dom.downloadSvgBtn.addEventListener('click', async () => {
    if (paths.length === 0) {
      showMessage('No signature to export.', { type: 'warning', timeoutMs: 5000 });
      return;
    }

    const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
      paths,
      currentSettings.penWidth
    );

    const svgContent = generateSvg(normalizedPaths, logicalWidth, logicalHeight, currentSettings);

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    await downloadFile(blob, `signature-${Date.now()}.svg`);
  });

  // Animated export
  dom.downloadAnimatedBtn.addEventListener('click', async () => {
    if (paths.length === 0) {
      showMessage('No signature to export.', { type: 'warning', timeoutMs: 5000 });
      return;
    }

    try {
      showProgress('Generating animated signature...');
      const { normalizedPaths, logicalWidth, logicalHeight } = buildNormalizedFromPaths(
        paths,
        currentSettings.penWidth
      );

      const blob = await generateWebMAnimation(
        normalizedPaths,
        logicalWidth,
        logicalHeight,
        currentSettings,
        {
          durationMs: 2500,
          fps: 30,
          background: null, // null = transparent; or '#ffffff' for white
          dpi: 144,
        }
      );
      await downloadFile(blob, `signature-animated-${Date.now()}.webm`);
    } finally {
      hideProgress();
    }
  });

  dom.exportSignaturesBtn.addEventListener('click', async () => {
    try {
      const all = await getAllSignatures();
      if (!all || all.length === 0) {
        showMessage('No saved signatures to export.', { type: 'warning', timeoutMs: 4000 });
        return;
      }
      const payload = JSON.stringify(all, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      await downloadFile(blob, `signatures-export-${Date.now()}.json`);
      showMessage('Signatures exported.', { timeoutMs: 3000 });
    } catch (e) {
      console.error('Export failed', e);
      showMessage('Failed to export signatures.', { type: 'alert', timeoutMs: 5000 });
    }
  });

  dom.importSignaturesBtn.addEventListener('click', () => {
    dom.importFileInput.value = '';
    dom.importFileInput.click();
  });

  dom.importFileInput.addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        showMessage('Invalid file format. Expected an array of signatures.', {
          type: 'alert',
          timeoutMs: 6000,
        });
        return;
      }

      // Validate & import entries
      let imported = 0;
      for (const item of parsed) {
        try {
          const obj = item as Partial<SignatureData>;
          if (!obj.rawPaths || !obj.timestamp) continue; // minimal validation

          const sig: SignatureData = {
            id: obj.id || crypto.randomUUID(),
            image: obj.image || '',
            width: obj.width || 0,
            height: obj.height || 0,
            timestamp: obj.timestamp || Date.now(),
            settings: obj.settings || currentSettings,
            rawPaths: (obj.rawPaths as Point[][]) || [],
          };

          await putSignature(sig);
          imported++;
        } catch (inner) {
          console.warn('Skipping invalid signature entry', inner);
        }
      }

      if (imported > 0) {
        showMessage(`Imported ${imported} signatures.`, { timeoutMs: 4000 });
        void renderSignatures();
      } else {
        showMessage('No valid signatures found in file.', { type: 'warning', timeoutMs: 5000 });
      }
    } catch (e) {
      console.error('Import failed', e);
      showMessage('Failed to import signatures. Is this a valid JSON export?', {
        type: 'alert',
        timeoutMs: 6000,
      });
    } finally {
      dom.importFileInput.value = '';
    }
  });

  // --- Signature Rendering ---

  async function renderSignatures() {
    const saved: SignatureData[] = await getAllSignatures();
    dom.signaturesList.innerHTML = '';

    if (saved.length > 0) {
      dom.savedContainer.classList.remove('hidden');
    } else {
      dom.savedContainer.classList.add('hidden');
    }

    saved.forEach((sig) => {
      // correct missing values for signature settings use defaults
      if (!sig.rawPaths) {
        sig.rawPaths = [];
      }
      if (!sig.settings) {
        sig.settings = currentSettings;
      }
      if (!sig.timestamp) {
        sig.timestamp = Date.now();
      }
      if (!sig.width) {
        sig.width = userWidth();
      }
      if (!sig.height) {
        sig.height = userHeight();
      }
      if (!sig.id) {
        sig.id = crypto.randomUUID();
      }
      if (!sig.image) {
        sig.image = '';
      }
      sig.settings = { ...currentSettings, ...sig.settings };

      const clone = dom.template.content.cloneNode(true) as HTMLElement;
      (clone.querySelector('.signature-preview') as HTMLImageElement).src = sig.image;
      (clone.querySelector('.signature-date') as HTMLElement).textContent = new Date(
        sig.timestamp
      ).toLocaleString();

      clone.querySelector('.delete-signature-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this signature?')) {
          await deleteSignature(sig.id);
          void renderSignatures();
        }
      });

      clone.querySelector('.load-signature-btn')?.addEventListener('click', async () => {
        // Clear current paths and memCanvas
        currentSettings = sig.settings || currentSettings;
        applySettings(currentSettings);
        lastLoadedSignatureId = sig.id;
        const prev = paths.map((p) => p.slice());
        redoStack = [];
        memCtx.clearRect(0, 0, userWidth(), userHeight());
        prevLiveWidth = sig.settings.penWidth;

        // Compute scale to fit signature into the canvas while preserving aspect
        const canvasW = userWidth();
        const canvasH = userHeight();
        const sigW = sig.width;
        const sigH = sig.height;
        const scale = Math.min(canvasW / sigW, canvasH / sigH, 1);

        // Centering offsets
        const offsetX = (canvasW - sigW * scale) / 2;
        const offsetY = (canvasH - sigH * scale) / 2;

        // Draw each path scaled and translated onto memCtx
        memCtx.save();
        memCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // ensure memCtx in user units
        memCtx.translate(offsetX, offsetY);
        memCtx.scale(scale, scale);

        sig.rawPaths.forEach((p) => {
          drawSignaturePath(memCtx, p, sig.settings || currentSettings);
        });

        memCtx.restore();
        const scaledPaths: Point[][] = sig.rawPaths.map((path: Point[]) =>
          path.map(
            (pt): Point => ({
              x: pt.x * scale + offsetX,
              y: pt.y * scale + offsetY,
              timestamp: pt.timestamp,
              pressure: pt.pressure,
            })
          )
        );

        undoStack.push({
          type: 'replace',
          prev,
          next: scaledPaths,
        });
        paths = scaledPaths;

        drawStatic();
        updateUndoRedoButtons();
      });

      clone.querySelector('.download-svg-btn')?.addEventListener('click', async () => {
        const svgContent = generateSvg(
          sig.rawPaths,
          sig.width,
          sig.height,
          sig.settings || currentSettings
        );
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        await downloadFile(blob, `signature-${sig.timestamp}.svg`);
      });

      clone.querySelector('.download-png-btn')?.addEventListener('click', () => {
        generatePng(sig.rawPaths, sig.width, sig.height, sig.settings || currentSettings).then(
          ({ blob }) => {
            downloadFile(blob, `signature-${sig.timestamp}.png`);
            console.log('PNG downloaded', sig);
          }
        );
      });

      dom.signaturesList.appendChild(clone);
    });
  }

  void renderSignatures();

  return () => {
    if (redrawTimeout) clearTimeout(redrawTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('pointerup', stopDrawing);
  };
}

// noinspection JSUnusedGlobalSymbols
export const savedSignatures = async (): Promise<SignatureData[]> => {
  return getAllSignatures();
};
