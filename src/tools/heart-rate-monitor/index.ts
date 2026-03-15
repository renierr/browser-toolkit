import { connectHeartRate, type HeartRateUpdate } from './bluetooth';
import { deleteSession, getAllSessions, type HeartRateSession, saveSession } from './db';

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

  let device: BluetoothDevice | null = null;
  let isRecording = false;
  let currentSession: HeartRateSession | null = null;
  let recordingStartTime: number | null = null;
  let timerInterval: number | null = null;

  const updateStatus = (msg: string | null, type: 'info' | 'error' | 'success' = 'info') => {
    if (!msg) {
      statusMessage.classList.add('hidden');
      return;
    }
    statusMessage.classList.remove('hidden', 'alert-info', 'alert-error', 'alert-success');
    statusMessage.classList.add(`alert-${type}`);
    statusMessage.querySelector('span')!.textContent = msg;
  };

  const formatDuration = (ms: number) => {
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

    // Sort newest first
    sessions.sort((a, b) => b.startTime - a.startTime);

    sessions.forEach((session) => {
      const row = document.createElement('tr');
      const date = new Date(session.startTime).toLocaleString();
      const duration = session.endTime
        ? formatDuration(session.endTime - session.startTime)
        : '---';

      const hrs = session.dataPoints.map((p) => p.heartRate);
      const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
      const maxHr = hrs.length ? Math.max(...hrs) : 0;

      row.innerHTML = `
        <td>${date}</td>
        <td class="font-mono">${duration}</td>
        <td>${avgHr} <small class="text-base-content/50">BPM</small></td>
        <td>${maxHr} <small class="text-base-content/50">BPM</small></td>
        <td class="text-right">
          <button class="btn btn-ghost btn-xs text-error delete-session" data-id="${session.id}">Delete</button>
        </td>
      `;

      row.querySelector('.delete-session')?.addEventListener('click', async (e) => {
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
    hrDisplay.textContent = data.heartRate.toString();

    if (isRecording && currentSession) {
      currentSession.dataPoints.push({
        timestamp: Date.now(),
        heartRate: data.heartRate,
      });
    }
  };

  const startRecording = () => {
    isRecording = true;
    recordingStartTime = Date.now();
    currentSession = {
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
    hrDisplay.textContent = '--';
    connectBtn.classList.remove('hidden');
    recordingControls.classList.add('hidden');
    disconnectBtn.classList.add('hidden');
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
      updateStatus('Connected to ' + (device.name || 'Device'), 'success');
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

  // Initial load
  loadSessions();

  return () => {
    if (timerInterval) clearInterval(timerInterval);
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  };
}
