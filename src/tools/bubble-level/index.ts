import { isLevel, lowPass, roundToOne } from './math';
import { SensorService } from './sensor-service';
import { BubbleLevelUi, getUiElements } from './ui-controller';
import { acquireWakeLock } from '@js/wake-lock';
import { acquireRotationLock } from '@js/rotation-lock';
import { getSettings } from '@js/settings';
import type { CalibrationOffset, LevelMode, OrientationReading } from './types';

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const uiElements = getUiElements();
  const toleranceSelect = document.getElementById('tolerance');
  const calibrateZeroButton = document.getElementById('calibrate-zero');
  const resetCalibrationButton = document.getElementById('reset-calibration');
  const wakeLockButton = document.getElementById('wake-lock-btn');

  const pitchOffsetInput = document.getElementById('pitch-offset-setting') as HTMLInputElement;
  const rollOffsetInput = document.getElementById('roll-offset-setting') as HTMLInputElement;

  if (
    !uiElements ||
    !(toleranceSelect instanceof HTMLSelectElement) ||
    !(calibrateZeroButton instanceof HTMLButtonElement) ||
    !(resetCalibrationButton instanceof HTMLButtonElement) ||
    !(wakeLockButton instanceof HTMLButtonElement) ||
    !pitchOffsetInput ||
    !rollOffsetInput
  ) {
    return;
  }

  const ui = new BubbleLevelUi(uiElements);
  const sensors = new SensorService();
  const settings = getSettings('bubble-level');

  let mode: LevelMode = '2d';
  let tolerance = Number(toleranceSelect.value) || 0.2;
  let filtered: OrientationReading = { pitch: 0, roll: 0 };
  let hasSignal = false;
  let isRulerVisible = false;
  let stopSensors: (() => void) | null = null;
  let releaseWakeLock: (() => void) | null = null;
  let releaseRotationLock: (() => void) | null = null;

  // 1. Initial Load from settings
  const updatePxPerMm = (val: number): void => {
    ui.setPixelsPerMm(val);
  };

  const getPxPerMm = (): number => Number(uiElements.ppiSettingInput.value) || 3.78;
  const getOffset = (): CalibrationOffset => ({
    pitch: Number(pitchOffsetInput.value) || 0,
    roll: Number(rollOffsetInput.value) || 0,
  });

  // 2. Bind settings (restores from storage and listens for changes)
  const unbindSettings = settings.bind(document.getElementById('bubble-level-tool')!);

  // Initial UI state from bound values
  updatePxPerMm(getPxPerMm());
  let offset: CalibrationOffset = getOffset();

  const applyReading = (reading: OrientationReading): void => {
    hasSignal = true;
    filtered = {
      pitch: lowPass(filtered.pitch, reading.pitch - offset.pitch, 0.22),
      roll: lowPass(filtered.roll, reading.roll - offset.roll, 0.22),
    };

    const pitch = roundToOne(filtered.pitch);
    const roll = roundToOne(filtered.roll);
    const normalizedPitch = pitch / 20;
    const normalizedRoll = roll / 20;
    const locked = mode === '2d' ? isLevel(pitch, roll, tolerance) : Math.abs(roll) <= tolerance;

    ui.updateReadout(pitch, roll);
    ui.updateBubblePosition(normalizedPitch, normalizedRoll);
    ui.updateBeamPosition(normalizedRoll);
    ui.setLocked(locked);
  };

  const startSensors = (): void => {
    stopSensors?.();
    const startResult = sensors.start(applyReading);
    stopSensors = startResult.stop;
    ui.setStatus(startResult.status);
  };

  const onMode2dClick = (): void => {
    mode = '2d';
    ui.setMode(mode);
  };

  const onMode1dClick = (): void => {
    mode = '1d';
    ui.setMode(mode);
  };

  const onToleranceChange = (): void => {
    tolerance = Number(toleranceSelect.value) || 0.2;
  };

  const onCalibrateZero = (): void => {
    if (!hasSignal) {
      ui.setStatus('error', 'Cannot calibrate yet. Wait for sensor signal first.');
      return;
    }

    offset = {
      pitch: offset.pitch + filtered.pitch,
      roll: offset.roll + filtered.roll,
    };

    pitchOffsetInput.value = offset.pitch.toString();
    rollOffsetInput.value = offset.roll.toString();
    pitchOffsetInput.dispatchEvent(new Event('change'));
    rollOffsetInput.dispatchEvent(new Event('change'));

    filtered = { pitch: 0, roll: 0 };
    ui.setStatus('ready', 'Calibration saved. Current surface now zero reference.');
  };

  const onResetCalibration = (): void => {
    offset = { pitch: 0, roll: 0 };
    pitchOffsetInput.value = '0';
    rollOffsetInput.value = '0';
    pitchOffsetInput.dispatchEvent(new Event('change'));
    rollOffsetInput.dispatchEvent(new Event('change'));

    ui.setStatus('ready', 'Calibration reset. Using raw sensor zero.');
  };

  const onToggleRuler = (): void => {
    isRulerVisible = !isRulerVisible;
    ui.toggleRuler(isRulerVisible);
  };

  const onCalibrateRuler = (): void => {
    ui.openCalibration(getPxPerMm());
  };

  const onCalibrationSliderInput = (): void => {
    ui.updateCalibrationPreview(uiElements.calibrationSlider.valueAsNumber);
  };

  const onPpiPlus = (): void => {
    uiElements.calibrationSlider.valueAsNumber += 0.01;
    onCalibrationSliderInput();
  };

  const onPpiMinus = (): void => {
    uiElements.calibrationSlider.valueAsNumber -= 0.01;
    onCalibrationSliderInput();
  };

  const onSaveCalibration = (): void => {
    const newPxPerMm = uiElements.calibrationSlider.valueAsNumber;
    uiElements.ppiSettingInput.value = newPxPerMm.toFixed(4);
    uiElements.ppiSettingInput.dispatchEvent(new Event('change'));
    updatePxPerMm(newPxPerMm);
    ui.closeCalibration();
  };

  const onCancelCalibration = (): void => {
    // Revert ruler to last saved value
    ui.setPixelsPerMm(getPxPerMm());
    ui.closeCalibration();
  };

  const onRotationLockClick = (): void => {
    if (releaseRotationLock) {
      releaseRotationLock();
      releaseRotationLock = null;
      ui.setRotationLockState(false);
      return;
    }

    releaseRotationLock = acquireRotationLock();
    if (releaseRotationLock) {
      ui.setRotationLockState(true);
    } else {
      ui.setStatus('error', 'Rotation lock not supported in this browser.');
    }
  };

  const onPermissionClick = async (): Promise<void> => {
    ui.setStatus('initializing', 'Requesting sensor permission...');
    const granted = await sensors.requestPermissionIfNeeded();
    if (!granted) {
      ui.setStatus('error', 'Permission denied. Allow motion access in browser settings.');
      return;
    }
    startSensors();
  };

  const updateWakeLockButton = (): void => {
    if (releaseWakeLock) {
      wakeLockButton.textContent = 'Release Wake Lock';
      wakeLockButton.classList.add('btn-success');
      wakeLockButton.classList.remove('btn-outline');
      return;
    }
    wakeLockButton.textContent = 'Acquire Wake Lock';
    wakeLockButton.classList.remove('btn-success');
    wakeLockButton.classList.add('btn-outline');
  };

  const onWakeLockClick = (): void => {
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
      updateWakeLockButton();
      ui.setStatus('ready', 'Wake lock released.');
      return;
    }

    releaseWakeLock = acquireWakeLock();
    updateWakeLockButton();
    ui.setStatus('ready', 'Wake lock requested. Screen should stay awake.');
  };

  uiElements.mode2dButton.addEventListener('click', onMode2dClick);
  uiElements.mode1dButton.addEventListener('click', onMode1dClick);
  uiElements.toggleRulerButton.addEventListener('click', onToggleRuler);
  uiElements.calibrateRulerButton.addEventListener('click', onCalibrateRuler);
  uiElements.rotationLockButton.addEventListener('click', onRotationLockClick);
  uiElements.calibrationSlider.addEventListener('input', onCalibrationSliderInput);
  uiElements.ppiPlusButton.addEventListener('click', onPpiPlus);
  uiElements.ppiMinusButton.addEventListener('click', onPpiMinus);
  uiElements.saveCalibrationButton.addEventListener('click', onSaveCalibration);
  uiElements.cancelCalibrationButton.addEventListener('click', onCancelCalibration);
  toleranceSelect.addEventListener('change', onToleranceChange);
  calibrateZeroButton.addEventListener('click', onCalibrateZero);
  resetCalibrationButton.addEventListener('click', onResetCalibration);
  uiElements.permissionButton.addEventListener('click', onPermissionClick);
  wakeLockButton.addEventListener('click', onWakeLockClick);

  ui.setMode(mode);
  ui.setLocked(false);
  ui.updateReadout(0, 0);
  ui.updateBubblePosition(0, 0);
  ui.updateBeamPosition(0);
  updateWakeLockButton();

  if (sensors.canRequestPermission()) {
    ui.setStatus('permission-needed');
  } else {
    startSensors();
  }

  return () => {
    unbindSettings();
    if (releaseRotationLock) {
      releaseRotationLock();
      releaseRotationLock = null;
    }
    uiElements.mode2dButton.removeEventListener('click', onMode2dClick);
    uiElements.mode1dButton.removeEventListener('click', onMode1dClick);
    uiElements.toggleRulerButton.removeEventListener('click', onToggleRuler);
    uiElements.calibrateRulerButton.removeEventListener('click', onCalibrateRuler);
    uiElements.rotationLockButton.removeEventListener('click', onRotationLockClick);
    uiElements.calibrationSlider.removeEventListener('input', onCalibrationSliderInput);
    uiElements.ppiPlusButton.removeEventListener('click', onPpiPlus);
    uiElements.ppiMinusButton.removeEventListener('click', onPpiMinus);
    uiElements.saveCalibrationButton.removeEventListener('click', onSaveCalibration);
    uiElements.cancelCalibrationButton.removeEventListener('click', onCancelCalibration);
    toleranceSelect.removeEventListener('change', onToleranceChange);
    calibrateZeroButton.removeEventListener('click', onCalibrateZero);
    resetCalibrationButton.removeEventListener('click', onResetCalibration);
    uiElements.permissionButton.removeEventListener('click', onPermissionClick);
    wakeLockButton.removeEventListener('click', onWakeLockClick);
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
    stopSensors?.();
    sensors.stop();
  };
}
