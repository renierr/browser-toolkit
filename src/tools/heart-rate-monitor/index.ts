import { connectHeartRate, type HeartRateUpdate } from './bluetooth';
import { deleteSession, getAllSessions, type HeartRateSession, saveSession } from './db';
import { showMessage } from '../../js/ui';
import { formatDuration, generateShortId } from './utils';
import { EKGGraph } from './graph';
import { initDetails, showSessionDetails } from './details';

// noinspection JSUnusedGlobalSymbols
export function init() {
  const hrDisplay = document.getElementById('hr-display')!;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
  const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;
  const recordingControls = document.getElementById('recording-controls')!;
  const recordingStatus = document.getElementById('recording-status')!;
  const recordTimer = document.getElementById('record-timer')!;
  const statusMessage = document.getElementById('status-message')!;
  const sessionsList = document.getElementById('sessions-list')!;
  const noSessionsRow = document.getElementById('no-sessions')!;
  const ekgContainer = document.getElementById('ekg-container')!;
  const ekgCanvas = document.getElementById('ekg-canvas') as HTMLCanvasElement;
  const batteryIndicator = document.getElementById('battery-indicator')!;
  const batteryLevel = document.getElementById('battery-level')!;
  const batteryIcon = document.getElementById('battery-icon')!;
  const exportAllBtn = document.getElementById('export-all-btn') as HTMLButtonElement;
  const viewJsonBtn = document.getElementById('view-json-btn') as HTMLButtonElement;
  const importInput = document.getElementById('import-input') as HTMLInputElement;

  let device: BluetoothDevice | null = null;
  let isRecording = false;
  let currentSession: HeartRateSession | null = null;
  let recordingStartTime: number | null = null;
  let timerInterval: number | null = null;

  const updateStatus = (
    msg: string | null,
    type: 'info' | 'error' | 'success' | 'warning' = 'info',
    persistent = false
  ) => {
    if (!msg) {
      statusMessage.classList.add('hidden');
      return;
    }

    if (persistent) {
      statusMessage.classList.remove(
        'hidden',
        'alert-info',
        'alert-error',
        'alert-success',
        'alert-warning'
      );
      const alertClass =
        type === 'error'
          ? 'alert-error'
          : type === 'success'
            ? 'alert-success'
            : type === 'warning'
              ? 'alert-warning'
              : 'alert-info';
      statusMessage.classList.add(alertClass);
      statusMessage.querySelector('span')!.textContent = msg;
    } else {
      const msgType: 'info' | 'warning' | 'alert' =
        type === 'error' ? 'alert' : type === 'success' ? 'info' : type;
      showMessage(msg, { type: msgType });
    }
  };

  const ekgGraph = new EKGGraph(ekgCanvas);
  ekgGraph.start();

  initDetails();

  const loadSessions = async () => {
    const sessions = await getAllSessions();
    sessionsList.innerHTML = '';

    if (sessions.length === 0) {
      sessionsList.appendChild(noSessionsRow);
      return;
    }

    // Sort newest first
    sessions.sort((a, b) => b.startTime - a.startTime);

    sessions.forEach((session) => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-base-200 cursor-pointer';
      const date = new Date(session.startTime).toLocaleString();
      const duration = session.endTime
        ? formatDuration(session.endTime - session.startTime)
        : '---';

      const hrs = session.dataPoints.map((p) => p.heartRate);
      const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
      const maxHr = hrs.length ? Math.max(...hrs) : 0;

      row.innerHTML = `
        <td class="font-mono text-xs opacity-70">${session.uid || '---'}</td>
        <td>${date}</td>
        <td class="font-mono">${duration}</td>
        <td>${avgHr} <small class="text-base-content/50">BPM</small></td>
        <td>${maxHr} <small class="text-base-content/50">BPM</small></td>
        <td class="text-right">
          <button class="btn btn-ghost btn-xs text-info view-session" data-id="${session.id}">View</button>
          <button class="btn btn-ghost btn-xs text-error delete-session" data-id="${session.id}">Delete</button>
        </td>
      `;

      row.querySelector('.view-session')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showSessionDetails(session);
      });

      row.addEventListener('click', () => {
        showSessionDetails(session);
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

  const onHeartRateUpdate = (data: HeartRateUpdate) => {
    if (data.heartRate !== -1) {
      ekgGraph.setHeartRate(data.heartRate);
      hrDisplay.textContent = data.heartRate.toString();

      if (isRecording && currentSession) {
        currentSession.dataPoints.push({
          timestamp: Date.now(),
          heartRate: data.heartRate,
        });
      }
    }

    if (data.batteryLevel !== undefined) {
      batteryIndicator.classList.remove('hidden');
      batteryLevel.textContent = `${data.batteryLevel}%`;

      // Update battery icon based on level
      batteryIcon.setAttribute('data-lucide', getBatteryIcon(data.batteryLevel));
      // @ts-ignore - Lucide is available globally
      if ((window as any).lucide)
        (window as any).lucide.createIcons({
          attrs: { class: 'size-4' },
          nameAttr: 'data-lucide',
          icons: [batteryIcon],
        });
    }
  };

  const getBatteryIcon = (level: number): string => {
    if (level > 90) return 'battery-full';
    if (level > 60) return 'battery-medium';
    if (level > 20) return 'battery-low';
    return 'battery-warning';
  };

  const startRecording = () => {
    isRecording = true;
    recordingStartTime = Date.now();
    currentSession = {
      uid: generateShortId(),
      startTime: recordingStartTime,
      dataPoints: [],
    };

    recordBtn.innerHTML = '<i data-lucide="square" class="fill-current"></i> Stop Recording';
    recordingStatus.classList.remove('hidden');
    updateStatus('Recording started', 'success');

    timerInterval = window.setInterval(() => {
      if (recordingStartTime) {
        recordTimer.textContent = formatDuration(Date.now() - recordingStartTime);
      }
    }, 1000);
  };

  const stopRecording = async () => {
    if (!isRecording || !currentSession) return;

    isRecording = false;
    currentSession.endTime = Date.now();

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (currentSession.dataPoints.length > 0) {
      await saveSession(currentSession);
      updateStatus('Session saved', 'success');
      loadSessions();
    } else {
      updateStatus('Session discarded (no data)', 'info');
    }

    currentSession = null;
    recordingStartTime = null;
    recordBtn.innerHTML = '<i data-lucide="circle" class="fill-current"></i> Start Recording';
    recordingStatus.classList.add('hidden');
    recordTimer.textContent = '00:00';
  };

  const handleDisconnect = () => {
    if (isRecording) stopRecording();

    device = null;
    ekgGraph.setHeartRate(0);
    hrDisplay.textContent = '--';
    batteryIndicator.classList.add('hidden');
    batteryLevel.textContent = '--%';
    connectBtn.classList.remove('hidden');
    recordingControls.classList.add('hidden');
    disconnectBtn.classList.add('hidden');
    ekgContainer.classList.add('hidden');
    updateStatus(null, 'info', true);
    updateStatus('Device disconnected');
  };

  connectBtn.addEventListener('click', async () => {
    try {
      updateStatus('Connecting...');
      device = await connectHeartRate(onHeartRateUpdate);

      device.addEventListener('gattserverdisconnected', handleDisconnect);

      connectBtn.classList.add('hidden');
      recordingControls.classList.remove('hidden');
      disconnectBtn.classList.remove('hidden');
      ekgContainer.classList.remove('hidden');
      updateStatus('Connected to ' + (device.name || 'Device'), 'success', true);
    } catch (err: any) {
      console.error(err);
      updateStatus(err.message || 'Connection failed', 'error');
    }
  });

  disconnectBtn.addEventListener('click', () => {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  });

  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  exportAllBtn.addEventListener('click', async () => {
    const sessions = await getAllSessions();
    if (sessions.length === 0) {
      updateStatus('No sessions to export', 'warning');
      return;
    }

    const data = JSON.stringify(sessions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heart-rate-sessions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    updateStatus('Sessions exported', 'success');
  });

  viewJsonBtn.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        // Check if it's a single session or an array of sessions
        const sessionToView = Array.isArray(data) ? data[0] : data;
        const allSessions = Array.isArray(data) ? data : [data];

        if (sessionToView && sessionToView.startTime && sessionToView.dataPoints) {
          showSessionDetails(sessionToView, allSessions);
          updateStatus('JSON loaded successfully', 'success');
        } else {
          updateStatus('Invalid JSON format', 'error');
        }
      } catch (err) {
        console.error(err);
        updateStatus('Failed to parse JSON', 'error');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  // Initial load
  loadSessions();

  return () => {
    ekgGraph.stop();
    if (timerInterval) clearInterval(timerInterval);
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  };
}
