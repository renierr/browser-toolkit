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
};

export class BubbleLevelUi {
  private readonly elements: UiElements;

  public constructor(elements: UiElements) {
    this.elements = elements;
  }

  public setStatus(status: SensorStatus, detail?: string): void {
    this.elements.permissionButton.classList.toggle('hidden', status !== 'permission-needed');

    switch (status) {
      case 'ready':
        this.elements.statusBanner.textContent = detail ?? 'Sensor ready. Move device slowly for best precision.';
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
    !(rollValue instanceof HTMLElement)
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
  };
}
