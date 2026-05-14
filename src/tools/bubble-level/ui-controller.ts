import { clamp } from './math';
import type { LevelMode, SensorStatus } from './types';

type UiElements = {
  lockBadge: HTMLElement;
  statusBanner: HTMLElement;
  permissionButton: HTMLButtonElement;
  mode2dButton: HTMLButtonElement;
  mode1dButton: HTMLButtonElement;
  view2d: HTMLElement;
  view1d: HTMLElement;
  bubbleDot: HTMLElement;
  beamBubble: HTMLElement;
  pitchValue: HTMLElement;
  rollValue: HTMLElement;
  toggleRulerButton: HTMLButtonElement;
  rulerOverlay: HTMLElement;
  calibrateRulerButton: HTMLButtonElement;
  calibrationModal: HTMLDialogElement;
  calibrationSlider: HTMLInputElement;
  ppiDisplay: HTMLElement;
  realSizeDisplay: HTMLElement;
  saveCalibrationButton: HTMLButtonElement;
  cancelCalibrationButton: HTMLButtonElement;
  ppiMinusButton: HTMLButtonElement;
  ppiPlusButton: HTMLButtonElement;
  ppiSettingInput: HTMLInputElement;
  rotationLockButton: HTMLButtonElement;
};

export class BubbleLevelUi {
  private readonly elements: UiElements;

  public constructor(elements: UiElements) {
    this.elements = elements;
    this.initRuler();
  }

  private initRuler(): void {
    const marks = document.createElement('div');
    marks.className = 'ruler-marks';

    const numbers = document.createElement('div');
    numbers.className = 'ruler-numbers';

    // Generate numbers for up to 100cm (plenty for any mobile/tablet)
    for (let i = 0; i <= 100; i++) {
      const num = document.createElement('div');
      num.className = 'ruler-number';
      // Positioning now uses the same CSS variable as the ticks
      num.style.top = `calc(var(--px-per-mm) * 10px * ${i})`;
      num.textContent = i.toString();
      numbers.appendChild(num);
    }

    this.elements.rulerOverlay.appendChild(marks);
    this.elements.rulerOverlay.appendChild(numbers);
  }

  public toggleRuler(show: boolean): void {
    this.elements.rulerOverlay.classList.toggle('hidden', !show);
    this.elements.toggleRulerButton.classList.toggle('btn-active', show);
    this.elements.calibrateRulerButton.classList.toggle('hidden', !show);
  }

  public setPixelsPerMm(pxPerMm: number): void {
    this.elements.rulerOverlay.style.setProperty('--px-per-mm', pxPerMm.toString());
  }

  public openCalibration(pxPerMm: number): void {
    this.elements.calibrationSlider.value = pxPerMm.toString();
    this.updateCalibrationPreview(pxPerMm);
    this.elements.calibrationModal.showModal();
  }

  public closeCalibration(): void {
    this.elements.calibrationModal.close();
  }

  public updateCalibrationPreview(pxPerMm: number): void {
    const dpi = pxPerMm * 25.4;
    this.elements.ppiDisplay.textContent = `${Math.round(dpi)} DPI`;
    this.elements.realSizeDisplay.textContent = `${pxPerMm.toFixed(2)} px/mm`;
    this.setPixelsPerMm(pxPerMm);
  }

  public setRotationLockState(locked: boolean): void {
    this.elements.rotationLockButton.classList.toggle('btn-success', locked);
    this.elements.rotationLockButton.classList.toggle('btn-outline', !locked);
    this.elements.rotationLockButton.textContent = locked ? 'Rotation Locked' : 'Lock Rotation';
  }

  public setStatus(status: SensorStatus, detail?: string): void {
    this.elements.permissionButton.classList.toggle('hidden', status !== 'permission-needed');

    switch (status) {
      case 'ready':
        this.elements.statusBanner.textContent =
          detail ?? 'Sensor ready. Move device slowly for best precision.';
        break;
      case 'permission-needed':
        this.elements.statusBanner.textContent =
          detail ?? 'Motion sensor permission needed. Tap button to enable sensors.';
        break;
      case 'unsupported':
        this.elements.statusBanner.textContent =
          detail ?? 'Device orientation sensors not available in this browser.';
        break;
      case 'error':
        this.elements.statusBanner.textContent = detail ?? 'Sensor error. Reload and try again.';
        break;
      default:
        this.elements.statusBanner.textContent = detail ?? 'Initializing sensors...';
        break;
    }
  }

  public setMode(mode: LevelMode): void {
    const in2d = mode === '2d';
    this.elements.mode2dButton.classList.toggle('btn-active', in2d);
    this.elements.mode1dButton.classList.toggle('btn-active', !in2d);
    this.elements.view2d.classList.toggle('hidden', !in2d);
    this.elements.view1d.classList.toggle('hidden', in2d);
  }

  public updateReadout(pitch: number, roll: number): void {
    this.elements.pitchValue.textContent = `${pitch.toFixed(1)} deg`;
    this.elements.rollValue.textContent = `${roll.toFixed(1)} deg`;
  }

  public updateBubblePosition(normalizedPitch: number, normalizedRoll: number): void {
    const x = clamp(normalizedRoll, -1, 1) * 42;
    const y = clamp(normalizedPitch, -1, 1) * 42;
    this.elements.bubbleDot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  public updateBeamPosition(normalizedRoll: number): void {
    const x = clamp(normalizedRoll, -1, 1) * 44;
    this.elements.beamBubble.style.transform = `translate(calc(-50% + ${x}px), -50%)`;
  }

  public setLocked(locked: boolean): void {
    this.elements.lockBadge.textContent = locked ? 'Level Locked' : 'Unstable';
    this.elements.lockBadge.classList.toggle('locked', locked);
    this.elements.bubbleDot.classList.toggle('locked', locked);
    this.elements.beamBubble.classList.toggle('locked', locked);
  }
}

export function getUiElements(): UiElements | null {
  const lockBadge = document.getElementById('level-lock');
  const statusBanner = document.getElementById('status-banner');
  const permissionButton = document.getElementById('request-permission');
  const mode2dButton = document.getElementById('mode-2d');
  const mode1dButton = document.getElementById('mode-1d');
  const view2d = document.getElementById('view-2d');
  const view1d = document.getElementById('view-1d');
  const bubbleDot = document.getElementById('bubble-dot');
  const beamBubble = document.getElementById('beam-bubble');
  const pitchValue = document.getElementById('pitch-value');
  const rollValue = document.getElementById('roll-value');
  const toggleRulerButton = document.getElementById('toggle-ruler');
  const rulerOverlay = document.getElementById('ruler-overlay');
  const calibrateRulerButton = document.getElementById('calibrate-ruler');
  const calibrationModal = document.getElementById('ruler-calibration-modal');
  const calibrationSlider = document.getElementById('calibration-slider');
  const ppiDisplay = document.getElementById('ppi-display');
  const realSizeDisplay = document.getElementById('real-size-display');
  const saveCalibrationButton = document.getElementById('save-calibration');
  const cancelCalibrationButton = document.getElementById('cancel-calibration');
  const ppiMinusButton = document.getElementById('ppi-minus');
  const ppiPlusButton = document.getElementById('ppi-plus');
  const ppiSettingInput = document.getElementById('ppi-setting');
  const rotationLockButton = document.getElementById('rotation-lock-btn');

  if (
    !(lockBadge instanceof HTMLElement) ||
    !(statusBanner instanceof HTMLElement) ||
    !(permissionButton instanceof HTMLButtonElement) ||
    !(mode2dButton instanceof HTMLButtonElement) ||
    !(mode1dButton instanceof HTMLButtonElement) ||
    !(view2d instanceof HTMLElement) ||
    !(view1d instanceof HTMLElement) ||
    !(bubbleDot instanceof HTMLElement) ||
    !(beamBubble instanceof HTMLElement) ||
    !(pitchValue instanceof HTMLElement) ||
    !(rollValue instanceof HTMLElement) ||
    !(toggleRulerButton instanceof HTMLButtonElement) ||
    !(rulerOverlay instanceof HTMLElement) ||
    !(calibrateRulerButton instanceof HTMLButtonElement) ||
    !(calibrationModal instanceof HTMLDialogElement) ||
    !(calibrationSlider instanceof HTMLInputElement) ||
    !(ppiDisplay instanceof HTMLElement) ||
    !(realSizeDisplay instanceof HTMLElement) ||
    !(saveCalibrationButton instanceof HTMLButtonElement) ||
    !(cancelCalibrationButton instanceof HTMLButtonElement) ||
    !(ppiMinusButton instanceof HTMLButtonElement) ||
    !(ppiPlusButton instanceof HTMLButtonElement) ||
    !(ppiSettingInput instanceof HTMLInputElement) ||
    !(rotationLockButton instanceof HTMLButtonElement)
  ) {
    return null;
  }

  return {
    lockBadge,
    statusBanner,
    permissionButton,
    mode2dButton,
    mode1dButton,
    view2d,
    view1d,
    bubbleDot,
    beamBubble,
    pitchValue,
    rollValue,
    toggleRulerButton,
    rulerOverlay,
    calibrateRulerButton,
    calibrationModal,
    calibrationSlider,
    ppiDisplay,
    realSizeDisplay,
    saveCalibrationButton,
    cancelCalibrationButton,
    ppiMinusButton,
    ppiPlusButton,
    ppiSettingInput,
    rotationLockButton,
  };
}
