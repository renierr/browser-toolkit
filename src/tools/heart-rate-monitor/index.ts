import { connectHeartRate, type HeartRateUpdate } from './bluetooth';
import { deleteSession, getAllSessions, type HeartRateSession, saveSession } from './db';
import { showMessage } from '../../js/ui';

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
  const ctx = ekgCanvas.getContext('2d')!;

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

  // EKG Graph Logic
  let animationFrameId: number | null = null;
  const ekgPoints: number[] = [];
  const maxPoints = 200;
  let lastHeartRate = 0;
  let phase = 0;

  const drawEKG = () => {
    const width = ekgCanvas.clientWidth;
    const height = ekgCanvas.clientHeight;
    if (ekgCanvas.width !== width || ekgCanvas.height !== height) {
      ekgCanvas.width = width;
      ekgCanvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.strokeStyle = '#ff52d9'; // primary color or error color
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    const step = width / (maxPoints - 1);
    for (let i = 0; i < ekgPoints.length; i++) {
      const x = i * step;
      const y = height / 2 - ekgPoints[i] * (height / 3);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Generate next point
    if (lastHeartRate > 0) {
      // Basic EKG spike logic based on BPM
      const period = (60 / lastHeartRate) * 60; // frames at 60fps
      phase++;
      let spike = 0;
      const p = phase % Math.floor(period);

      // Typical EKG components: P, QRS, T
      if (p < 5)
        spike = 0.1; // P wave
      else if (p >= 5 && p < 7)
        spike = -0.1; // Q
      else if (p >= 7 && p < 10)
        spike = 1.0; // R (the big spike)
      else if (p >= 10 && p < 12)
        spike = -0.2; // S
      else if (p >= 20 && p < 30)
        spike = 0.2; // T wave
      else spike = (Math.random() - 0.5) * 0.05; // Base noise

      ekgPoints.push(spike);
    } else {
      ekgPoints.push((Math.random() - 0.5) * 0.05);
    }

    if (ekgPoints.length > maxPoints) ekgPoints.shift();
    animationFrameId = requestAnimationFrame(drawEKG);
  };

  animationFrameId = requestAnimationFrame(drawEKG);

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
    lastHeartRate = data.heartRate;
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
    lastHeartRate = 0;
    hrDisplay.textContent = '--';
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

  // Initial load
  loadSessions();

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (timerInterval) clearInterval(timerInterval);
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  };
}
