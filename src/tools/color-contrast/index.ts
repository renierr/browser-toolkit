import { retrieveImageBlobFromClipboard, setupFileDropzone } from '../../js/file-utils';
import { showMessage } from '../../js/ui';
import {
  extractColorsFromImage,
  suggestBetterColors,
  checkWCAG,
  getContrastRatio,
  getLuminance,
  hexToRgb,
  normalizeHex,
} from './color-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  // Elements
  const fgColorPicker = document.getElementById('fg-color-picker') as HTMLInputElement;
  const fgColorInput = document.getElementById('fg-color-input') as HTMLInputElement;
  const fgEyedropper = document.getElementById('fg-eyedropper') as HTMLButtonElement;
  const bgColorPicker = document.getElementById('bg-color-picker') as HTMLInputElement;
  const bgColorInput = document.getElementById('bg-color-input') as HTMLInputElement;
  const bgEyedropper = document.getElementById('bg-eyedropper') as HTMLButtonElement;
  const swapColorsBtn = document.getElementById('swap-colors') as HTMLButtonElement;

  const contrastRatioEl = document.getElementById('contrast-ratio')!;
  const wcagAANormal = document.getElementById('wcag-aa-normal')!;
  const wcagAALarge = document.getElementById('wcag-aa-large')!;
  const wcagAAANormal = document.getElementById('wcag-aaa-normal')!;
  const wcagAAALarge = document.getElementById('wcag-aaa-large')!;

  const previewBox = document.getElementById('preview-box')!;
  const previewText = document.getElementById('preview-text')!;
  const previewTextSmall = document.getElementById('preview-text-small')!;

  const suggestionContainer = document.getElementById('suggestion-container')!;
  const suggestionList = document.getElementById('suggestion-list')!;

  const imageAnalysis = document.getElementById('image-analysis')!;
  const analyzedImage = document.getElementById('analyzed-image') as HTMLImageElement;
  const extractedColors = document.getElementById('extracted-colors')!;

  const pasteImageBtn = document.getElementById('paste-btn') as HTMLButtonElement;

  // Check EyeDropper API support
  const eyeDropperSupported = 'EyeDropper' in window;
  if (!eyeDropperSupported) {
    fgEyedropper.classList.add('hidden');
    bgEyedropper.classList.add('hidden');
  }

  // Update badge style
  function updateBadge(element: HTMLElement, pass: boolean) {
    element.textContent = pass ? 'Pass' : 'Fail';
    element.classList.remove('badge-success', 'badge-error');
    element.classList.add(pass ? 'badge-success' : 'badge-error');
  }

  // Main update function
  function updateContrast() {
    const fgHex = normalizeHex(fgColorInput.value);
    const bgHex = normalizeHex(bgColorInput.value);

    if (!fgHex || !bgHex) return;

    const fgRgb = hexToRgb(fgHex);
    const bgRgb = hexToRgb(bgHex);

    if (!fgRgb || !bgRgb) return;

    // Update color pickers
    fgColorPicker.value = fgHex;
    bgColorPicker.value = bgHex;

    // Calculate contrast
    const ratio = getContrastRatio(fgRgb, bgRgb);
    const wcag = checkWCAG(ratio);

    // Update display
    contrastRatioEl.textContent = ratio.toFixed(2) + ':1';

    updateBadge(wcagAANormal, wcag.aaNormal);
    updateBadge(wcagAALarge, wcag.aaLarge);
    updateBadge(wcagAAANormal, wcag.aaaNormal);
    updateBadge(wcagAAALarge, wcag.aaaLarge);

    // Update preview
    previewBox.style.backgroundColor = bgHex;
    previewText.style.color = fgHex;
    previewTextSmall.style.color = fgHex;

    // Show suggestions if contrast is poor
    if (!wcag.aaNormal) {
      const suggestions = suggestBetterColors(fgRgb, bgRgb, 4.5);
      if (suggestions.length > 0) {
        suggestionContainer.classList.remove('hidden');
        suggestionList.innerHTML = suggestions
          .map((color) => {
            const textColor = getLuminance(hexToRgb(color)!) > 0.5 ? '#000' : '#FFF';
            return `
            <button class="btn btn-sm suggestion-color gap-2" data-color="${color}" style="background-color: ${color}; color: ${textColor}; border-color: ${color};">
              ${color}
              <span class="text-xs opacity-70">(${getContrastRatio(hexToRgb(color)!, bgRgb).toFixed(1)}:1)</span>
            </button>
          `;
          })
          .join('');

        // Add click handlers for suggestions
        suggestionList.querySelectorAll('.suggestion-color').forEach((btn) => {
          btn.addEventListener('click', () => {
            fgColorInput.value = (btn as HTMLElement).dataset.color!;
            updateContrast();
          });
        });
      } else {
        suggestionContainer.classList.add('hidden');
      }
    } else {
      suggestionContainer.classList.add('hidden');
    }
  }

  // Sync color inputs
  function syncFgFromPicker() {
    fgColorInput.value = fgColorPicker.value.toUpperCase();
    updateContrast();
  }

  function syncBgFromPicker() {
    bgColorInput.value = bgColorPicker.value.toUpperCase();
    updateContrast();
  }

  function syncFgFromInput() {
    const normalized = normalizeHex(fgColorInput.value);
    if (normalized) {
      fgColorInput.value = normalized;
      fgColorPicker.value = normalized;
      updateContrast();
    }
  }

  function syncBgFromInput() {
    const normalized = normalizeHex(bgColorInput.value);
    if (normalized) {
      bgColorInput.value = normalized;
      bgColorPicker.value = normalized;
      updateContrast();
    }
  }

  // EyeDropper handler
  async function pickColor(target: 'fg' | 'bg') {
    if (!eyeDropperSupported) return;

    try {
      // @ts-ignore - EyeDropper API
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      const color = result.sRGBHex.toUpperCase();

      if (target === 'fg') {
        fgColorInput.value = color;
        fgColorPicker.value = color;
      } else {
        bgColorInput.value = color;
        bgColorPicker.value = color;
      }
      updateContrast();
    } catch (e) {
      // User cancelled or error
      console.log('EyeDropper cancelled');
    }
  }

  // Swap colors
  function swapColors() {
    const fg = fgColorInput.value;
    const bg = bgColorInput.value;
    fgColorInput.value = bg;
    bgColorInput.value = fg;
    fgColorPicker.value = bg;
    bgColorPicker.value = fg;
    updateContrast();
  }

  // Image analysis
  function analyzeImage(file: Blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for analysis
        const canvas = document.createElement('canvas');
        const maxSize = 200; // Resize for performance
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Extract colors
        const colors = extractColorsFromImage(canvas, ctx, 12);

        // Display results
        analyzedImage.src = e.target!.result as string;
        imageAnalysis.classList.remove('hidden');

        extractedColors.innerHTML = colors
          .map(
            (color) => `
            <div class="flex flex-col gap-1">
              <button class="extracted-color w-12 h-12 rounded-lg shadow-sm border-2 border-base-300 cursor-pointer hover:scale-110 transition-transform"
                      data-color="${color}"
                      style="background-color: ${color};"
                      title="${color}">
              </button>
              <span class="text-xs text-center font-mono">${color}</span>
            </div>
          `
          )
          .join('');

        // Add click handlers with context menu for fg/bg
        extractedColors.querySelectorAll('.extracted-color').forEach((btn) => {
          btn.addEventListener('click', () => {
            const color = (btn as HTMLElement).dataset.color!;
            // Left click = foreground
            fgColorInput.value = color;
            fgColorPicker.value = color;
            updateContrast();
            showMessage(`Set ${color} as foreground color`, { type: 'info', timeoutMs: 2000 });
          });

          btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const color = (btn as HTMLElement).dataset.color!;
            // Right click = background
            bgColorInput.value = color;
            bgColorPicker.value = color;
            updateContrast();
            showMessage(`Set ${color} as background color`, { type: 'info', timeoutMs: 2000 });
          });
        });
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Event listeners
  fgColorPicker.addEventListener('input', syncFgFromPicker);
  bgColorPicker.addEventListener('input', syncBgFromPicker);
  fgColorInput.addEventListener('change', syncFgFromInput);
  bgColorInput.addEventListener('change', syncBgFromInput);
  fgColorInput.addEventListener('blur', syncFgFromInput);
  bgColorInput.addEventListener('blur', syncBgFromInput);

  fgEyedropper.addEventListener('click', () => pickColor('fg'));
  bgEyedropper.addEventListener('click', () => pickColor('bg'));
  swapColorsBtn.addEventListener('click', swapColors);

  pasteImageBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const imageBlob = await retrieveImageBlobFromClipboard();
    if (imageBlob) {
      analyzeImage(imageBlob);
    } else {
      showMessage('No image found in clipboard.', { type: 'info', timeoutMs: 5000 });
    }
  });

  // Setup file dropzone
  setupFileDropzone('dropzone', 'image-input', (files) => {
    analyzeImage(files[0]);
  });

  // Initial update
  updateContrast();
}
