import { acquireWakeLock } from '@js/utils';
import { BaselineStore } from './calibration';
import { deltaFromBaseline, lowPass } from './math';
import { SensorService } from './sensor-service';
import { EmfDetectorUi, getUiElements } from './ui-controller';
import type { Baseline, MagnetometerReading } from './types';

const HISTORY_LIMIT = 72;

// noinspection JSUnusedGlobalSymbols
export default function init(): void | (() => void) {
  const uiElements = getUiElements();
  if (!uiElements) {
    return;
  }

  const ui = new EmfDetectorUi(uiElements);
  const sensors = new SensorService();
  const baselineStore = new BaselineStore();

  let baseline: Baseline = baselineStore.load();
  let current: MagnetometerReading = { x: 0, y: 0, z: 0, magnitude: 0 };
  let active = false;
  let hasSignal = false;
  let stopSensors: (() => void) | null = null;
  let releaseWakeLock: (() => void) | null = null;
  let frameId: number | null = null;
  const history: number[] = [];

  const render = (): void => {
    const delta = deltaFromBaseline(current, baseline);
    ui.render({
      reading: current,
      baseline,
      delta,
      history,
      range: ui.getRange(),
      active,
    });
    frameId = window.requestAnimationFrame(render);
  };

  const startRenderLoop = (): void => {
    if (frameId !== null) {
      return;
    }
    frameId = window.requestAnimationFrame(render);
  };

  const stopRenderLoop = (): void => {
    if (frameId === null) {
      return;
    }
    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  const applyReading = (reading: MagnetometerReading): void => {
    hasSignal = true;
    current = {
      x: lowPass(current.x, reading.x, 0.22),
      y: lowPass(current.y, reading.y, 0.22),
      z: lowPass(current.z, reading.z, 0.22),
      magnitude: lowPass(current.magnitude, reading.magnitude, 0.22),
    };

    history.push(current.magnitude);
    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }
  };

  const stopMonitoring = (): void => {
    active = false;
    stopSensors?.();
    stopSensors = null;
    ui.setRunning(false);
    ui.setStatus('ready', 'Sensor stopped. Press Start to scan again.');
  };

  const startMonitoring = async (): Promise<void> => {
    const permissionState = await sensors.getPermissionState();
    if (permissionState === 'denied') {
      ui.setStatus(
        'permission-needed',
        'Magnetometer permission denied. Enable it in browser settings.'
      );
      return;
    }

    stopSensors?.();
    const startResult = sensors.start(applyReading, (error) => {
      active = false;
      ui.setRunning(false);

      if (error.kind === 'permission-denied') {
        ui.setStatus(
          'permission-needed',
          'Magnetometer permission denied. Allow Motion and Sensors in browser site settings.'
        );
        return;
      }

      if (error.kind === 'not-readable') {
        ui.setStatus(
          'error',
          'Sensor not readable. Device may not have a usable magnetic sensor or it is blocked by the OS.'
        );
        return;
      }

      if (error.kind === 'not-supported') {
        ui.setStatus(
          'unsupported',
          'Magnetometer API unavailable on this device/browser. No magnetic sensor access possible here.'
        );
        return;
      }

      ui.setStatus('error', `Magnetometer error: ${error.message}`);
    });
    if (startResult.status !== 'ready') {
      if (startResult.status === 'unsupported') {
        ui.setStatus(
          'unsupported',
          'Magnetometer API unavailable on this device/browser. No magnetic sensor access possible here.'
        );
      } else {
        ui.setStatus(startResult.status);
      }
      active = false;
      ui.setRunning(false);
      return;
    }

    stopSensors = startResult.stop;
    active = true;
    ui.setRunning(true);
    ui.setStatus('ready');
  };

  const updateWakeLockButton = (): void => {
    ui.setWakeLockActive(Boolean(releaseWakeLock));
  };

  const onStartClick = (): void => {
    void startMonitoring();
  };

  const onStopClick = (): void => {
    stopMonitoring();
  };

  const onCalibrateClick = (): void => {
    if (!hasSignal) {
      ui.setStatus('error', 'Cannot calibrate yet. Wait for a sensor signal first.');
      return;
    }
    baseline = baselineStore.save(current);
    ui.setBaseline(baseline);
    ui.setStatus('ready', 'Baseline calibrated to current field level.');
  };

  const onResetClick = (): void => {
    baseline = baselineStore.reset();
    ui.setBaseline(baseline);
    ui.setStatus('ready', 'Baseline reset to zero.');
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

  uiElements.startButton.addEventListener('click', onStartClick);
  uiElements.stopButton.addEventListener('click', onStopClick);
  uiElements.calibrateButton.addEventListener('click', onCalibrateClick);
  uiElements.resetButton.addEventListener('click', onResetClick);
  uiElements.wakeLockButton.addEventListener('click', onWakeLockClick);

  ui.setBaseline(baseline);
  updateWakeLockButton();
  ui.setRunning(false);
  startRenderLoop();

  if (!sensors.isSecureContext()) {
    ui.setStatus('insecure-context');
  } else if (!sensors.isSupported()) {
    ui.setStatus(
      'unsupported',
      'No Magnetometer API detected. This device/browser likely has no exposed magnetic sensor.'
    );
  } else {
    void sensors.canStartWithoutPrompt().then((canStart) => {
      if (!canStart) {
        ui.setStatus(
          'permission-needed',
          'Magnetometer permission denied. Enable it in browser settings.'
        );
        return;
      }
      ui.setStatus('ready', 'Ready. Tap Start to begin scanning magnetic fields.');
    });
  }

  return () => {
    uiElements.startButton.removeEventListener('click', onStartClick);
    uiElements.stopButton.removeEventListener('click', onStopClick);
    uiElements.calibrateButton.removeEventListener('click', onCalibrateClick);
    uiElements.resetButton.removeEventListener('click', onResetClick);
    uiElements.wakeLockButton.removeEventListener('click', onWakeLockClick);

    stopRenderLoop();
    stopSensors?.();
    sensors.stop();

    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  };
}
