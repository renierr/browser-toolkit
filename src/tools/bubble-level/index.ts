import { CalibrationStore } from './calibration';
import { isLevel, lowPass, roundToOne } from './math';
import { SensorService } from './sensor-service';
import { BubbleLevelUi, getUiElements } from './ui-controller';
import type { CalibrationOffset, LevelMode, OrientationReading } from './types';

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const uiElements = getUiElements();
  const toleranceSelect = document.getElementById('tolerance');
  const calibrateZeroButton = document.getElementById('calibrate-zero');
  const resetCalibrationButton = document.getElementById('reset-calibration');

  if (
    !uiElements ||
    !(toleranceSelect instanceof HTMLSelectElement) ||
    !(calibrateZeroButton instanceof HTMLButtonElement) ||
    !(resetCalibrationButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  const ui = new BubbleLevelUi(uiElements);
  const sensors = new SensorService();
  const calibration = new CalibrationStore();

  let mode: LevelMode = '2d';
  let tolerance = Number(toleranceSelect.value) || 0.2;
  let offset: CalibrationOffset = calibration.load();
  let filtered: OrientationReading = { pitch: 0, roll: 0 };
  let hasSignal = false;
  let stopSensors: (() => void) | null = null;

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
    calibration.save(offset);
    filtered = { pitch: 0, roll: 0 };
    ui.setStatus('ready', 'Calibration saved. Current surface now zero reference.');
  };

  const onResetCalibration = (): void => {
    offset = calibration.reset();
    ui.setStatus('ready', 'Calibration reset. Using raw sensor zero.');
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

  uiElements.mode2dButton.addEventListener('click', onMode2dClick);
  uiElements.mode1dButton.addEventListener('click', onMode1dClick);
  toleranceSelect.addEventListener('change', onToleranceChange);
  calibrateZeroButton.addEventListener('click', onCalibrateZero);
  resetCalibrationButton.addEventListener('click', onResetCalibration);
  uiElements.permissionButton.addEventListener('click', onPermissionClick);

  ui.setMode(mode);
  ui.setLocked(false);
  ui.updateReadout(0, 0);
  ui.updateBubblePosition(0, 0);
  ui.updateBeamPosition(0);

  if (sensors.canRequestPermission()) {
    ui.setStatus('permission-needed');
  } else {
    startSensors();
  }

  return () => {
    uiElements.mode2dButton.removeEventListener('click', onMode2dClick);
    uiElements.mode1dButton.removeEventListener('click', onMode1dClick);
    toleranceSelect.removeEventListener('change', onToleranceChange);
    calibrateZeroButton.removeEventListener('click', onCalibrateZero);
    resetCalibrationButton.removeEventListener('click', onResetCalibration);
    uiElements.permissionButton.removeEventListener('click', onPermissionClick);
    stopSensors?.();
    sensors.stop();
  };
}
