import { clamp, normalize } from './math';
import type { Baseline, MagnetometerReading, SensorStatus, ViewRange } from './types';

type UiElements = {
  toolRoot: HTMLElement;
  statusBanner: HTMLElement;
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  calibrateButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  wakeLockButton: HTMLButtonElement;
  rangeSelect: HTMLSelectElement;
  xValue: HTMLElement;
  yValue: HTMLElement;
  zValue: HTMLElement;
  magnitudeValue: HTMLElement;
  deltaValue: HTMLElement;
  baselineValue: HTMLElement;
  signalBadge: HTMLElement;
  vectorCanvas: HTMLCanvasElement;
  trendCanvas: HTMLCanvasElement;
};

type RenderPayload = {
  reading: MagnetometerReading;
  baseline: Baseline;
  delta: number;
  history: number[];
  range: ViewRange;
  active: boolean;
};

type CanvasPalette = {
  vectorBackground: string;
  trendBackground: string;
  axisStroke: string;
  activeLine: string;
  inactiveLine: string;
  activeDot: string;
  inactiveDot: string;
  trendStroke: string;
};

export class EmfDetectorUi {
  private readonly elements: UiElements;

  public constructor(elements: UiElements) {
    this.elements = elements;
  }

  private getPalette(): CanvasPalette {
    const computedStyle = window.getComputedStyle(this.elements.toolRoot);
    const isDark = document.documentElement.dataset.theme === 'dark';

    const base100 = computedStyle.getPropertyValue('--color-base-100').trim();
    const baseContent = computedStyle.getPropertyValue('--color-base-content').trim();

    return {
      vectorBackground: isDark
        ? 'rgba(8, 18, 24, 0.9)'
        : `color-mix(in oklab, ${base100} 93%, #cde7ee 7%)`,
      trendBackground: isDark
        ? 'rgba(8, 16, 20, 0.9)'
        : `color-mix(in oklab, ${base100} 94%, #d7eaf0 6%)`,
      axisStroke: isDark
        ? 'rgba(130, 165, 180, 0.35)'
        : `color-mix(in oklab, ${baseContent} 30%, transparent)`,
      activeLine: isDark ? 'rgba(92, 242, 203, 0.95)' : 'rgba(28, 149, 128, 0.95)',
      inactiveLine: isDark
        ? 'rgba(110, 130, 140, 0.65)'
        : `color-mix(in oklab, ${baseContent} 40%, transparent)`,
      activeDot: isDark ? 'rgba(122, 255, 229, 1)' : 'rgba(20, 137, 118, 1)',
      inactiveDot: isDark
        ? 'rgba(150, 162, 170, 0.8)'
        : `color-mix(in oklab, ${baseContent} 55%, transparent)`,
      trendStroke: isDark ? 'rgba(116, 246, 226, 0.95)' : 'rgba(24, 153, 133, 0.95)',
    };
  }

  public setStatus(status: SensorStatus, detail?: string): void {
    switch (status) {
      case 'ready':
        this.elements.statusBanner.textContent =
          detail ?? 'Sensor running. Move device slowly for cleaner readings.';
        break;
      case 'permission-needed':
        this.elements.statusBanner.textContent =
          detail ?? 'Permission required. Tap Start to request magnetometer access.';
        break;
      case 'unsupported':
        this.elements.statusBanner.textContent =
          detail ?? 'Magnetometer API not supported on this browser/device.';
        break;
      case 'insecure-context':
        this.elements.statusBanner.textContent =
          detail ?? 'Secure context required. Open tool via HTTPS or localhost.';
        break;
      case 'error':
        this.elements.statusBanner.textContent = detail ?? 'Sensor error. Stop and start again.';
        break;
      default:
        this.elements.statusBanner.textContent = detail ?? 'Initializing magnetometer...';
        break;
    }
  }

  public setRunning(active: boolean): void {
    this.elements.startButton.disabled = active;
    this.elements.stopButton.disabled = !active;
    this.elements.signalBadge.textContent = active ? 'Live' : 'Stopped';
    this.elements.signalBadge.classList.toggle('badge-success', active);
    this.elements.signalBadge.classList.toggle('badge-outline', !active);
  }

  public setWakeLockActive(active: boolean): void {
    this.elements.wakeLockButton.textContent = active ? 'Release Wake Lock' : 'Acquire Wake Lock';
    this.elements.wakeLockButton.classList.toggle('btn-success', active);
    this.elements.wakeLockButton.classList.toggle('btn-outline', !active);
  }

  public getRange(): ViewRange {
    return this.elements.rangeSelect.value as ViewRange;
  }

  public setBaseline(baseline: Baseline): void {
    this.elements.baselineValue.textContent = `${baseline.magnitude.toFixed(1)} uT`;
  }

  public render(payload: RenderPayload): void {
    const { reading, baseline, delta, history, range, active } = payload;

    this.elements.xValue.textContent = `${reading.x.toFixed(1)} uT`;
    this.elements.yValue.textContent = `${reading.y.toFixed(1)} uT`;
    this.elements.zValue.textContent = `${reading.z.toFixed(1)} uT`;
    this.elements.magnitudeValue.textContent = `${reading.magnitude.toFixed(1)} uT`;
    this.elements.deltaValue.textContent = `${delta.toFixed(1)} uT`;
    this.setBaseline(baseline);

    this.drawVector(reading, range, active);
    this.drawTrend(history, range);
  }

  private drawVector(reading: MagnetometerReading, range: ViewRange, active: boolean): void {
    const canvas = this.elements.vectorCanvas;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.ensureCanvasSize(canvas, width, height);

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const palette = this.getPalette();

    context.clearRect(0, 0, w, h);

    context.fillStyle = palette.vectorBackground;
    context.fillRect(0, 0, w, h);

    context.strokeStyle = palette.axisStroke;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, cy);
    context.lineTo(w, cy);
    context.moveTo(cx, 0);
    context.lineTo(cx, h);
    context.stroke();

    const viewRange = this.resolveRange(range, reading);
    const nx = normalize(reading.x, viewRange);
    const ny = normalize(reading.y, viewRange);
    const nz = normalize(reading.z, viewRange);

    const perspective = 0.55 + clamp((nz + 1) * 0.225, 0.15, 0.45);
    const radius = Math.min(w, h) * 0.35;
    const tx = cx + nx * radius * perspective;
    const ty = cy - ny * radius * perspective;

    context.strokeStyle = active ? palette.activeLine : palette.inactiveLine;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(tx, ty);
    context.stroke();

    context.fillStyle = active ? palette.activeDot : palette.inactiveDot;
    context.beginPath();
    context.arc(tx, ty, 7, 0, Math.PI * 2);
    context.fill();
  }

  private drawTrend(history: number[], range: ViewRange): void {
    const canvas = this.elements.trendCanvas;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.ensureCanvasSize(canvas, width, height);

    const w = canvas.width;
    const h = canvas.height;
    const palette = this.getPalette();
    context.clearRect(0, 0, w, h);

    context.fillStyle = palette.trendBackground;
    context.fillRect(0, 0, w, h);

    if (history.length < 2) {
      return;
    }

    const maxHistory = Math.max(...history, 1);
    const selectedRange = range === 'auto' ? maxHistory : Number(range);
    const scaleMax = Math.max(selectedRange, 1);

    context.strokeStyle = palette.trendStroke;
    context.lineWidth = 2;
    context.beginPath();

    history.forEach((value, index) => {
      const x = (index / (history.length - 1)) * w;
      const normalized = clamp(value / scaleMax, 0, 1);
      const y = h - normalized * h;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
  }

  private resolveRange(range: ViewRange, reading: MagnetometerReading): number {
    if (range !== 'auto') {
      return Number(range);
    }
    return Math.max(
      60,
      Math.abs(reading.x),
      Math.abs(reading.y),
      Math.abs(reading.z),
      reading.magnitude
    );
  }

  private ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): void {
    const pixelRatio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.floor(width * pixelRatio));
    const nextHeight = Math.max(1, Math.floor(height * pixelRatio));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
  }
}

export function getUiElements(): UiElements | null {
  const toolRoot = document.getElementById('emf-detector-tool');
  const statusBanner = document.getElementById('status-banner');
  const startButton = document.getElementById('start-scan');
  const stopButton = document.getElementById('stop-scan');
  const calibrateButton = document.getElementById('calibrate-baseline');
  const resetButton = document.getElementById('reset-baseline');
  const wakeLockButton = document.getElementById('wake-lock-btn');
  const rangeSelect = document.getElementById('range-select');
  const xValue = document.getElementById('x-value');
  const yValue = document.getElementById('y-value');
  const zValue = document.getElementById('z-value');
  const magnitudeValue = document.getElementById('magnitude-value');
  const deltaValue = document.getElementById('delta-value');
  const baselineValue = document.getElementById('baseline-value');
  const signalBadge = document.getElementById('signal-badge');
  const vectorCanvas = document.getElementById('vector-canvas');
  const trendCanvas = document.getElementById('trend-canvas');

  if (
    !(toolRoot instanceof HTMLElement) ||
    !(statusBanner instanceof HTMLElement) ||
    !(startButton instanceof HTMLButtonElement) ||
    !(stopButton instanceof HTMLButtonElement) ||
    !(calibrateButton instanceof HTMLButtonElement) ||
    !(resetButton instanceof HTMLButtonElement) ||
    !(wakeLockButton instanceof HTMLButtonElement) ||
    !(rangeSelect instanceof HTMLSelectElement) ||
    !(xValue instanceof HTMLElement) ||
    !(yValue instanceof HTMLElement) ||
    !(zValue instanceof HTMLElement) ||
    !(magnitudeValue instanceof HTMLElement) ||
    !(deltaValue instanceof HTMLElement) ||
    !(baselineValue instanceof HTMLElement) ||
    !(signalBadge instanceof HTMLElement) ||
    !(vectorCanvas instanceof HTMLCanvasElement) ||
    !(trendCanvas instanceof HTMLCanvasElement)
  ) {
    return null;
  }

  return {
    toolRoot,
    statusBanner,
    startButton,
    stopButton,
    calibrateButton,
    resetButton,
    wakeLockButton,
    rangeSelect,
    xValue,
    yValue,
    zValue,
    magnitudeValue,
    deltaValue,
    baselineValue,
    signalBadge,
    vectorCanvas,
    trendCanvas,
  };
}
