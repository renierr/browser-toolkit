import { setupFileDropzone } from '../../js/file-utils';
import { showMessage } from '../../js/ui';

// Types
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Color conversion utilities
function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Try 3-digit hex
    const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (shortResult) {
      return {
        r: parseInt(shortResult[1] + shortResult[1], 16),
        g: parseInt(shortResult[2] + shortResult[2], 16),
        b: parseInt(shortResult[3] + shortResult[3], 16),
      };
    }
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

// WCAG relative luminance calculation
function getLuminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map(c => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// WCAG contrast ratio calculation
function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check WCAG compliance
function checkWCAG(ratio: number) {
  return {
    aaLarge: ratio >= 3,       // AA for large text (18pt+ or 14pt bold)
    aaNormal: ratio >= 4.5,    // AA for normal text
    aaaLarge: ratio >= 4.5,    // AAA for large text
    aaaNormal: ratio >= 7,     // AAA for normal text
  };
}

// Generate suggested colors with better contrast
function suggestBetterColors(fg: RGB, bg: RGB, targetRatio: number = 4.5): string[] {
  const suggestions: string[] = [];
  const bgLuminance = getLuminance(bg);

  // Try adjusting foreground color
  // Make it darker or lighter depending on background
  const needsDarker = bgLuminance > 0.5;

  for (let step = 1; step <= 10; step++) {
    const factor = needsDarker ? 1 - step * 0.1 : step * 0.1;
    let newR, newG, newB;

    if (needsDarker) {
      // Make darker
      newR = Math.round(fg.r * factor);
      newG = Math.round(fg.g * factor);
      newB = Math.round(fg.b * factor);
    } else {
      // Make lighter
      newR = Math.round(fg.r + (255 - fg.r) * factor);
      newG = Math.round(fg.g + (255 - fg.g) * factor);
      newB = Math.round(fg.b + (255 - fg.b) * factor);
    }

    const newColor = { r: newR, g: newG, b: newB };
    const ratio = getContrastRatio(newColor, bg);

    if (ratio >= targetRatio) {
      const hex = rgbToHex(newR, newG, newB);
      if (!suggestions.includes(hex)) {
        suggestions.push(hex);
        if (suggestions.length >= 3) break;
      }
    }
  }

  // Also try pure black or white if nothing found
  if (suggestions.length === 0) {
    const blackRatio = getContrastRatio({ r: 0, g: 0, b: 0 }, bg);
    const whiteRatio = getContrastRatio({ r: 255, g: 255, b: 255 }, bg);

    if (blackRatio >= targetRatio) suggestions.push('#000000');
    if (whiteRatio >= targetRatio) suggestions.push('#FFFFFF');
  }

  return suggestions;
}

// Extract dominant colors from image
function extractColorsFromImage(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, numColors: number = 8): string[] {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const colorCounts = new Map<string, number>();

  // Sample every nth pixel for performance
  const sampleRate = Math.max(1, Math.floor(pixels.length / 4 / 10000));

  for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
    const r = Math.round(pixels[i] / 32) * 32;
    const g = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;
    const hex = rgbToHex(r, g, b);
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  // Sort by frequency and return top colors
  return Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, numColors)
    .map(([color]) => color);
}

// Validate and normalize hex color
function normalizeHex(input: string): string | null {
  let hex = input.trim().toUpperCase();
  if (!hex.startsWith('#')) hex = '#' + hex;

  if (/^#[0-9A-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    // Expand 3-digit hex
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return null;
}

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
        suggestionList.innerHTML = suggestions.map(color => {
          const textColor = getLuminance(hexToRgb(color)!) > 0.5 ? '#000' : '#FFF';
          return `
            <button class="btn btn-sm suggestion-color gap-2" data-color="${color}" style="background-color: ${color}; color: ${textColor}; border-color: ${color};">
              ${color}
              <span class="text-xs opacity-70">(${getContrastRatio(hexToRgb(color)!, bgRgb).toFixed(1)}:1)</span>
            </button>
          `;
        }).join('');

        // Add click handlers for suggestions
        suggestionList.querySelectorAll('.suggestion-color').forEach(btn => {
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
  function analyzeImage(file: File) {
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

        extractedColors.innerHTML = colors.map(color => {
          const rgb = hexToRgb(color)!;
          const textColor = getLuminance(rgb) > 0.5 ? '#000' : '#FFF';
          return `
            <div class="flex flex-col gap-1">
              <button class="extracted-color w-12 h-12 rounded-lg shadow-sm border-2 border-base-300 cursor-pointer hover:scale-110 transition-transform"
                      data-color="${color}"
                      style="background-color: ${color};"
                      title="${color}">
              </button>
              <span class="text-xs text-center font-mono">${color}</span>
            </div>
          `;
        }).join('');

        // Add click handlers with context menu for fg/bg
        extractedColors.querySelectorAll('.extracted-color').forEach(btn => {
          btn.addEventListener('click', (e) => {
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

  // Setup file dropzone
  setupFileDropzone('dropzone', 'image-input', (files) => {
    if (files.length > 0) {
      analyzeImage(files[0]);
    }
  });

  // Initial update
  updateContrast();
}

