import {
  sendControlCommand,
  resetControlState,
  startPitPatHeartbeat,
  stopPitPatHeartbeat,
} from './bluetooth';
import type { TreadmillDeviceType } from './bluetooth';
import { type TreadmillData } from './ftms-parser';
import { startSensors, type SensorsResult } from './sensors';
import { saveSession, getAllSessions, deleteSession, type TreadmillSession } from './db';
import * as details from './details';
import { generateShortId } from '../heart-rate-monitor/utils';
import { showMessage } from '../../js/ui';
import { acquireWakeLock } from '../../js/utils';

// noinspection JSUnusedGlobalSymbols
export function init() {
  const dashboard = document.getElementById('dashboard')!;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
  const statusMessage = document.getElementById('status-message')!;

  const speedDisplay = document.getElementById('speed-display')!;
  const inclineDisplay = document.getElementById('incline-display')!;
  const distanceDisplay = document.getElementById('distance-display')!;
  const timeDisplay = document.getElementById('time-display')!;
  const caloriesDisplay = document.getElementById('calories-display')!;

  // Optional Metrics
  const optionalMetrics = {
    steps: {
      display: document.getElementById('steps-display')!,
      container: document.getElementById('steps-container')!
    },
    cadence: {
      display: document.getElementById('cadence-display')!,
      container: document.getElementById('cadence-container')!
    },
    remainingTime: {
      display: document.getElementById('remaining-time-display')!,
      container: document.getElementById('remaining-time-container')!
    },
    averageSpeed: {
      display: document.getElementById('avg-speed-display')!,
      container: document.getElementById('avg-speed-container')!
    },
    heartRate: {
      display: document.getElementById('hr-display')!,
      container: document.getElementById('hr-container')!
    },
    instantaneousPace: {
      display: document.getElementById('pace-display')!,
      container: document.getElementById('pace-container')!
    },
    averagePace: {
      display: document.getElementById('avg-pace-display')!,
      container: document.getElementById('avg-pace-container')!
    },
    elevationGainPositive: {
      display: document.getElementById('elevation-display')!,
      container: document.getElementById('elevation-container')!
    },
    metabolicEquivalent: {
      display: document.getElementById('mets-display')!,
      container: document.getElementById('mets-container')!
    }
  };

  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  const speedUpBtn = document.getElementById('speed-up-btn') as HTMLButtonElement;
  const speedDownBtn = document.getElementById('speed-down-btn') as HTMLButtonElement;
  const inclineUpBtn = document.getElementById('incline-up-btn') as HTMLButtonElement;
  const inclineDownBtn = document.getElementById('incline-down-btn') as HTMLButtonElement;

  const controlButtons = [startBtn, stopBtn, speedUpBtn, speedDownBtn, inclineUpBtn, inclineDownBtn];

  let device: BluetoothDevice | null = null;
  let deviceType: TreadmillDeviceType | null = null;
  let pitpatWriteChar: BluetoothRemoteGATTCharacteristic | null = null;
  let sensorsHandle: SensorsResult | null = null;
  let currentSpeed = 0;
  let currentIncline = 0;
  let simulatorRef: any = null;
  // Session recording
  const sessionsList = document.getElementById('sessions-list')!;
  const noSessionsRow = document.getElementById('no-sessions')!;
  const exportAllBtn = document.getElementById('export-all-btn') as HTMLButtonElement | null;
  const viewJsonBtn = document.getElementById('view-json-btn') as HTMLButtonElement | null;
  const importInput = document.getElementById('import-input') as HTMLInputElement | null;

  let isRecording = false;
  let currentSession: TreadmillSession | null = null;
  let releaseWakeLock: (() => void) | null = null;

  details.initDetails();

  const updateStatus = (msg: string | null, type: 'info' | 'error' | 'success' = 'info') => {
    if (!msg) {
      statusMessage.classList.add('hidden');
      return;
    }
    statusMessage.classList.remove('hidden', 'alert-info', 'alert-error', 'alert-success');
    statusMessage.classList.add(type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info');
    statusMessage.querySelector('span')!.textContent = msg;
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (minPerKm: number): string => {
    const mins = Math.floor(minPerKm);
    const secs = Math.round((minPerKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onUpdate = (data: TreadmillData) => {
    if (data.speed !== undefined) {
      speedDisplay.textContent = data.speed.toFixed(1);
      currentSpeed = data.speed;
    }
    if (data.inclination !== undefined) {
      inclineDisplay.textContent = data.inclination.toFixed(1);
      currentIncline = data.inclination;
    }
    if (data.distance !== undefined) {
      distanceDisplay.textContent = data.distance.toFixed(2);
    }
    if (data.elapsedTime !== undefined) {
      timeDisplay.textContent = formatTime(data.elapsedTime);
    }
    if (data.calories !== undefined) {
      caloriesDisplay.textContent = data.calories.toString();
    }

    // Cadence (from RSC)
    if (data.cadence !== undefined) {
      optionalMetrics.cadence.container.classList.remove('hidden');
      optionalMetrics.cadence.display.textContent = Math.round(data.cadence).toString();
    } else {
      optionalMetrics.cadence.container.classList.add('hidden');
    }

    // Handle Optional Metrics
    if (data.remainingTime !== undefined) {
      optionalMetrics.remainingTime.container.classList.remove('hidden');
      optionalMetrics.remainingTime.display.textContent = formatTime(data.remainingTime);
    }
    if (data.averageSpeed !== undefined) {
      optionalMetrics.averageSpeed.container.classList.remove('hidden');
      optionalMetrics.averageSpeed.display.textContent = data.averageSpeed.toFixed(1);
    }
    if (data.heartRate !== undefined) {
      optionalMetrics.heartRate.container.classList.remove('hidden');
      optionalMetrics.heartRate.display.textContent = data.heartRate.toString();
    }
    if (data.instantaneousPace !== undefined) {
      optionalMetrics.instantaneousPace.container.classList.remove('hidden');
      optionalMetrics.instantaneousPace.display.textContent = formatPace(data.instantaneousPace);
    }
    if (data.averagePace !== undefined) {
      optionalMetrics.averagePace.container.classList.remove('hidden');
      optionalMetrics.averagePace.display.textContent = formatPace(data.averagePace);
    }
    if (data.elevationGainPositive !== undefined) {
      optionalMetrics.elevationGainPositive.container.classList.remove('hidden');
      optionalMetrics.elevationGainPositive.display.textContent = data.elevationGainPositive.toFixed(1);
    }
    if (data.metabolicEquivalent !== undefined) {
      optionalMetrics.metabolicEquivalent.container.classList.remove('hidden');
      optionalMetrics.metabolicEquivalent.display.textContent = data.metabolicEquivalent.toFixed(1);
    }
    // Steps: prefer cumulativeStrideCount (from RSC or proprietary), fall back to PitPat steps
    const cumulative = (data.cumulativeStrideCount !== undefined) ? data.cumulativeStrideCount : data.steps;
    if (cumulative !== undefined) {
      optionalMetrics.steps.container.classList.remove('hidden');
      optionalMetrics.steps.display.textContent = String(cumulative);
    } else {
      optionalMetrics.steps.container.classList.add('hidden');
    }
  };

  // Collector wrapper that records data when a session is active
  const collectorOnUpdate = (data: TreadmillData) => {
    onUpdate(data);
    if (isRecording && currentSession) {
      currentSession.dataPoints.push({ timestamp: Date.now(), data });
    }
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const loadSessions = async () => {
    const sessions = await getAllSessions();
    sessionsList.innerHTML = '';

    if (sessions.length === 0) {
      sessionsList.appendChild(noSessionsRow);
      return;
    }

    sessions.sort((a, b) => b.startTime - a.startTime);

    sessions.forEach((session) => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-base-200 cursor-pointer';
      const date = new Date(session.startTime).toLocaleString();
      const duration = session.endTime ? formatDuration(session.endTime - session.startTime) : '---';

      const speeds = session.dataPoints.map(p => p.data.speed ?? 0);
      const avgSpeed = speeds.length ? (speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
      const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

      row.innerHTML = `
        <td class="font-mono text-xs opacity-70">${session.uid || '---'}</td>
        <td>${date}</td>
        <td class="font-mono">${duration}</td>
        <td>${avgSpeed.toFixed(1)} <small class="text-base-content/50">km/h</small></td>
        <td>${maxSpeed.toFixed(1)} <small class="text-base-content/50">km/h</small></td>
        <td class="text-right">
          <button class="btn btn-ghost btn-xs text-info view-session" data-id="${session.id}">View</button>
          <button class="btn btn-ghost btn-xs text-error delete-session" data-id="${session.id}">Delete</button>
        </td>
      `;

      row.querySelector('.view-session')?.addEventListener('click', (e) => {
        e.stopPropagation();
        details.showSessionDetails(session);
      });

      row.addEventListener('click', () => {
        details.showSessionDetails(session);
      });

      row.querySelector('.delete-session')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number((e.currentTarget as HTMLElement).dataset.id);
        if (confirm('Delete this session?')) {
          await deleteSession(id);
          loadSessions();
        }
      });

      sessionsList.appendChild(row);
    });
  };

  const handleDisconnect = async () => {
    device = null;
    resetControlState();
    dashboard.classList.add('opacity-50', 'pointer-events-none');
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');
    updateStatus('Treadmill disconnected');

    // Reset visibility of optional metrics for next connection
    Object.values(optionalMetrics).forEach(m => m.container.classList.add('hidden'));

    // Cleanup sensor subscriptions if we started them
    if (sensorsHandle) {
      try {
        await sensorsHandle.cleanup();
      } catch (_) {
        // ignore
      }
      sensorsHandle = null;
    }

    // Enable all buttons (reset state)
    controlButtons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('btn-disabled');
      // Ensure any buttons hidden due to lack of support are shown again
      btn.classList.remove('hidden');
    });
  };

  connectBtn.addEventListener('click', async () => {
    try {
      updateStatus('Scanning for treadmill...');
      // Use Sensor Aggregator which handles FTMS/PitPat and RSC merging
      // use collectorOnUpdate so recorded sessions receive the same updates
      sensorsHandle = await startSensors(collectorOnUpdate, { stepsMode: 'session' });
      device = sensorsHandle.device;
      deviceType = sensorsHandle.type;
      simulatorRef = sensorsHandle.simulator ?? null;
      const support = sensorsHandle.support ?? { controlSupported: false, speedControlSupported: false, inclineControlSupported: false };
      if (sensorsHandle.writeChar && deviceType === 'PITPAT') {
        pitpatWriteChar = sensorsHandle.writeChar;
        startPitPatHeartbeat(device, pitpatWriteChar);
      }


      device.addEventListener('gattserverdisconnected', () => {
        handleDisconnect();
        stopPitPatHeartbeat();
      });

      dashboard.classList.remove('opacity-50', 'pointer-events-none');
      connectBtn.classList.add('hidden');
      disconnectBtn.classList.remove('hidden');
      updateStatus('Connected to ' + (device.name || 'Treadmill'), 'success');
      speedDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Check Support and Disable Controls
      if (!support.controlSupported) {
        controlButtons.forEach(btn => {
          // hide unsupported controls to avoid confusion
          btn.disabled = true;
          btn.classList.add('btn-disabled');
          btn.classList.add('hidden');
        });
        showMessage('Control Point not supported by this treadmill. Controls hidden.', { type: 'warning', timeoutMs: 7000 });
      } else {
        if (!support.speedControlSupported) {
          [speedUpBtn, speedDownBtn, startBtn, stopBtn].forEach(btn => {
             // hide speed related controls if treadmill doesn't support them
             btn.disabled = true;
             btn.classList.add('btn-disabled');
             btn.classList.add('hidden');
          });
          showMessage('Speed control not supported. Speed controls hidden.', { type: 'warning', timeoutMs: 5000 });
        }
        if (!support.inclineControlSupported) {
          [inclineUpBtn, inclineDownBtn].forEach(btn => {
             // hide incline controls if not supported
             btn.disabled = true;
             btn.classList.add('btn-disabled');
             btn.classList.add('hidden');
          });
          showMessage('Incline control not supported. Incline controls hidden.', { type: 'warning', timeoutMs: 5000 });
        }
      }

      // Some proprietary devices (PitPat) don't support incline control — hide those too
      if (deviceType === 'PITPAT') {
        [inclineUpBtn, inclineDownBtn].forEach(btn => {
          btn.disabled = true;
          btn.classList.add('btn-disabled');
          btn.classList.add('hidden');
        });
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.name === 'SecurityError') {
        // User likely canceled the dialog or blocked the request
        updateStatus(null);
        console.log('Treadmill: Connection cancelled by user');
      } else {
        console.error('Treadmill: Connection error', err);
        updateStatus(null);
        resetControlState();
        showMessage(err.message || 'Connection failed', { type: 'alert', timeoutMs: 10000 });
      }
    }
    // refresh session list when connecting
    loadSessions();
  });

  disconnectBtn.addEventListener('click', async () => {
    try {
      // If using simulator, call cleanup on sensorsHandle which stops the sim and emits disconnect
      if (sensorsHandle && sensorsHandle.simulator) {
        await sensorsHandle.cleanup();
        return;
      }

      // For real devices, attempt to disconnect the GATT server if present
      if (device?.gatt?.connected && typeof device.gatt.disconnect === 'function') {
        device.gatt.disconnect();
        return;
      }

      // Manual reset if a device is stuck or no gatt disconnect available
      handleDisconnect();
    } catch (err) {
      console.warn('Disconnect failed, performing manual cleanup', err);
      handleDisconnect();
    }
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  });

  // Control Point Commands
  // Note: These might fail if the machine doesn't support them or requires Control Request first.

  startBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      if (simulatorRef) {
        simulatorRef.start();
        showMessage('Simulated start command sent');
        // also start recording
        if (!isRecording) {
          isRecording = true;
          currentSession = {
            uid: generateShortId(),
            startTime: Date.now(),
            dataPoints: [],
          };
          releaseWakeLock = acquireWakeLock();
        }
        return;
      }
      if (deviceType === 'PITPAT') {
        // build PitPat packet for START
        const { makePitPatPacket } = await import('./pitpat-packets');
        const pkt = makePitPatPacket('START', currentSpeed || 1.0);
        // send via bluetooth module helper
        await sendControlCommand(device, pkt[0], Array.from(pkt.slice(1)));
      } else {
        // FTMS: 0x07 Start or Resume
        await sendControlCommand(device, 0x07);
      }
      showMessage('Start command sent');
      // Start session recording
      if (!isRecording) {
        isRecording = true;
        currentSession = {
          uid: generateShortId(),
          startTime: Date.now(),
          dataPoints: [],
        };
        releaseWakeLock = acquireWakeLock();
        showMessage('Recording session...', { type: 'info', timeoutMs: 3000 });
      }
    } catch (err: any) {
      showMessage(err.message || 'Failed to start', { type: 'alert' });
    }
  });

  stopBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      if (simulatorRef) {
        simulatorRef.stop();
        showMessage('Simulated stop command sent');
        // Stop session recording and save
        if (isRecording && currentSession) {
          isRecording = false;
          currentSession.endTime = Date.now();
          if (currentSession.dataPoints.length > 0) {
            await saveSession(currentSession);
            updateStatus('Session saved', 'success');
            loadSessions();
          } else {
            updateStatus('Session discarded (no data)', 'info');
          }
          if (releaseWakeLock) {
            releaseWakeLock();
            releaseWakeLock = null;
          }
          currentSession = null;
        }
        return;
      }

      if (deviceType === 'PITPAT') {
        const { makePitPatPacket } = await import('./pitpat-packets');
        const pkt = makePitPatPacket('STOP', currentSpeed || 1.0);
        await sendControlCommand(device, pkt[0], Array.from(pkt.slice(1)));
      } else {
        await sendControlCommand(device, 0x08);
      }
      showMessage('Stop command sent');

      // Stop session recording and save
        if (isRecording && currentSession) {
          isRecording = false;
          currentSession.endTime = Date.now();
          if (currentSession.dataPoints.length > 0) {
            await saveSession(currentSession);
            updateStatus('Session saved', 'success');
            loadSessions();
          } else {
            updateStatus('Session discarded (no data)', 'info');
          }
          if (releaseWakeLock) {
            releaseWakeLock();
            releaseWakeLock = null;
          }
          currentSession = null;
        }
    } catch (err: any) {
      showMessage(err.message || 'Failed to stop', { type: 'alert' });
    }
  });

  // Speed controls
  speedUpBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextSpeed = currentSpeed + 0.5;
      currentSpeed = nextSpeed;
      if (simulatorRef) {
        simulatorRef.changeSpeed(0.5);
        return;
      }
      if (deviceType === 'PITPAT') {
        const { makePitPatPacket } = await import('./pitpat-packets');
        const pkt = makePitPatPacket('SPEED', currentSpeed || 1.0);
        await sendControlCommand(device, pkt[0], Array.from(pkt.slice(1)));
      } else {
        const speedUint16 = Math.round(nextSpeed * 100);
        await sendControlCommand(device, 0x02, [speedUint16 & 0xFF, (speedUint16 >> 8) & 0xFF]);
      }
    } catch (err: any) {
      showMessage('Speed change failed', { type: 'alert' });
    }
  });

  speedDownBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextSpeed = Math.max(0, currentSpeed - 0.5);
      currentSpeed = nextSpeed;
      if (simulatorRef) {
        simulatorRef.changeSpeed(-0.5);
        return;
      }
      const speedUint16 = Math.round(nextSpeed * 100);
      await sendControlCommand(device, 0x02, [speedUint16 & 0xFF, (speedUint16 >> 8) & 0xFF]);
    } catch (err: any) {
      showMessage('Speed change failed', { type: 'alert' });
    }
  });

  const simulateConnectBtn = document.getElementById('simulate-connect-btn') as HTMLButtonElement | null;
  if (simulateConnectBtn) {
    simulateConnectBtn.addEventListener('click', async () => {
      await connectSensors(true);
    });
  }

  async function connectSensors(simulate: boolean) {
    try {
      updateStatus('Scanning for treadmill...');
      sensorsHandle = await startSensors(collectorOnUpdate, { stepsMode: 'session', simulate });
      device = sensorsHandle.device;
      deviceType = sensorsHandle.type;
      simulatorRef = (sensorsHandle as any).simulator ?? null;
      const support = sensorsHandle.support ?? { controlSupported: false, speedControlSupported: false, inclineControlSupported: false };
      if (sensorsHandle.writeChar && deviceType === 'PITPAT') {
        pitpatWriteChar = sensorsHandle.writeChar;
        startPitPatHeartbeat(device, pitpatWriteChar);
      }

      device.addEventListener('gattserverdisconnected', () => {
        handleDisconnect();
        stopPitPatHeartbeat();
      });

      dashboard.classList.remove('opacity-50', 'pointer-events-none');
      connectBtn.classList.add('hidden');
      disconnectBtn.classList.remove('hidden');
      updateStatus('Connected to ' + (device.name || 'Treadmill'), 'success');
      dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Check Support and Disable Controls
      if (!support.controlSupported) {
        controlButtons.forEach(btn => {
          // hide unsupported controls to avoid confusion
          btn.disabled = true;
          btn.classList.add('btn-disabled');
          btn.classList.add('hidden');
        });
        showMessage('Control Point not supported by this treadmill. Controls hidden.', { type: 'warning', timeoutMs: 7000 });
      } else {
        if (!support.speedControlSupported) {
          [speedUpBtn, speedDownBtn, startBtn, stopBtn].forEach(btn => {
             // hide speed related controls if treadmill doesn't support them
             btn.disabled = true;
             btn.classList.add('btn-disabled');
             btn.classList.add('hidden');
          });
          showMessage('Speed control not supported. Speed controls hidden.', { type: 'warning', timeoutMs: 5000 });
        }
        if (!support.inclineControlSupported) {
          [inclineUpBtn, inclineDownBtn].forEach(btn => {
             // hide incline controls if not supported
             btn.disabled = true;
             btn.classList.add('btn-disabled');
             btn.classList.add('hidden');
          });
          showMessage('Incline control not supported. Incline controls hidden.', { type: 'warning', timeoutMs: 5000 });
        }
      }

      // Some proprietary devices (PitPat) don't support incline control — hide those too
      if (deviceType === 'PITPAT') {
        [inclineUpBtn, inclineDownBtn].forEach(btn => {
          btn.disabled = true;
          btn.classList.add('btn-disabled');
          btn.classList.add('hidden');
        });
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.name === 'SecurityError') {
        // User likely canceled the dialog or blocked the request
        updateStatus(null);
        console.log('Treadmill: Connection cancelled by user');
      } else {
        console.error('Treadmill: Connection error', err);
        updateStatus(null);
        resetControlState();
        showMessage(err.message || 'Connection failed', { type: 'alert', timeoutMs: 10000 });
      }
    }
    // refresh session list when connecting
    loadSessions();
  }

  inclineUpBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextIncline = currentIncline + 0.5;
      // 0x03: Set Target Inclination (Units of 0.1%)
      currentIncline = nextIncline;
      if (simulatorRef) {
        simulatorRef.changeIncline(0.5);
        return;
      }
      if (deviceType === 'PITPAT') {
        // PitPat does not support incline in this implementation; inform user
        showMessage('Incline control not supported for PitPat devices', { type: 'warning', timeoutMs: 3000 });
      } else {
        const inclineInt16 = Math.round(nextIncline * 10);
        await sendControlCommand(device, 0x03, [inclineInt16 & 0xFF, (inclineInt16 >> 8) & 0xFF]);
      }
    } catch (err: any) {
      showMessage('Incline change failed', { type: 'alert' });
    }
  });

  inclineDownBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextIncline = currentIncline - 0.5;
      currentIncline = nextIncline;
      if (simulatorRef) {
        simulatorRef.changeIncline(-0.5);
        return;
      }
      if (deviceType === 'PITPAT') {
        showMessage('Incline control not supported for PitPat devices', { type: 'warning', timeoutMs: 3000 });
      } else {
        const inclineInt16 = Math.round(nextIncline * 10);
        await sendControlCommand(device, 0x03, [inclineInt16 & 0xFF, (inclineInt16 >> 8) & 0xFF]);
      }
    } catch (err: any) {
      showMessage('Incline change failed', { type: 'alert' });
    }
  });


  // Export / Import / View JSON handlers
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      const sessions = await getAllSessions();
      if (sessions.length === 0) {
        showMessage('No sessions to export', { type: 'info', timeoutMs: 3000 });
        return;
      }
      const data = JSON.stringify(sessions, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `treadmill-sessions-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Sessions exported', { type: 'info', timeoutMs: 3000 });
    });
  }

  if (viewJsonBtn && importInput) {
    viewJsonBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          const sessionToView = Array.isArray(data) ? data[0] : data;
          const allSessions = Array.isArray(data) ? data : [data];
          if (sessionToView && sessionToView.startTime && sessionToView.dataPoints) {
            details.showSessionDetails(sessionToView, allSessions);
            showMessage('JSON loaded. Viewing first session in file.', { type: 'info', timeoutMs: 5000 });
          } else {
            showMessage('JSON does not appear to be a valid session or array of sessions', { type: 'warning', timeoutMs: 7000 });
          }
        } catch (err) {
          console.error(err);
          showMessage('Failed to parse JSON file', { type: 'alert', timeoutMs: 7000 });
        }
        importInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // Initial load
  loadSessions();

  return () => {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  };
}
