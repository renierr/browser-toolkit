import { 
  connectTreadmill, 
  sendControlCommand 
} from './bluetooth';
import { type TreadmillData } from './ftms-parser';
import { showMessage } from '../../js/ui';

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

  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  const speedUpBtn = document.getElementById('speed-up-btn') as HTMLButtonElement;
  const speedDownBtn = document.getElementById('speed-down-btn') as HTMLButtonElement;
  const inclineUpBtn = document.getElementById('incline-up-btn') as HTMLButtonElement;
  const inclineDownBtn = document.getElementById('incline-down-btn') as HTMLButtonElement;

  let device: BluetoothDevice | null = null;
  let currentSpeed = 0;
  let currentIncline = 0;

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
  };

  const handleDisconnect = () => {
    device = null;
    dashboard.classList.add('opacity-50', 'pointer-events-none');
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');
    updateStatus('Treadmill disconnected');
  };

  connectBtn.addEventListener('click', async () => {
    try {
      updateStatus('Scanning for treadmill...');
      device = await connectTreadmill(onUpdate);
      device.addEventListener('gattserverdisconnected', handleDisconnect);

      dashboard.classList.remove('opacity-50', 'pointer-events-none');
      connectBtn.classList.add('hidden');
      disconnectBtn.classList.remove('hidden');
      updateStatus('Connected to ' + (device.name || 'Treadmill'), 'success');
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

  // Control Point Commands
  // Note: These might fail if the machine doesn't support them or requires Control Request first.

  startBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      // 0x07: Start or Resume
      await sendControlCommand(device, 0x07);
      showMessage('Start command sent');
    } catch (err: any) {
      showMessage(err.message || 'Failed to start', { type: 'alert' });
    }
  });

  stopBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      // 0x08: Stop or Pause (Stop/Reset is often 0x01 according to some docs, 0x08 is Pause)
      // FTMS OpCodes: 0x07 Start, 0x08 Stop
      await sendControlCommand(device, 0x08);
      showMessage('Stop command sent');
    } catch (err: any) {
      showMessage(err.message || 'Failed to stop', { type: 'alert' });
    }
  });

  speedUpBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextSpeed = currentSpeed + 0.5;
      // 0x02: Set Target Speed (Speed in units of 0.01 km/h)
      const speedUint16 = Math.round(nextSpeed * 100);
      await sendControlCommand(device, 0x02, [speedUint16 & 0xFF, (speedUint16 >> 8) & 0xFF]);
    } catch (err: any) {
      showMessage('Speed change failed', { type: 'alert' });
    }
  });

  speedDownBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextSpeed = Math.max(0, currentSpeed - 0.5);
      const speedUint16 = Math.round(nextSpeed * 100);
      await sendControlCommand(device, 0x02, [speedUint16 & 0xFF, (speedUint16 >> 8) & 0xFF]);
    } catch (err: any) {
      showMessage('Speed change failed', { type: 'alert' });
    }
  });

  inclineUpBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextIncline = currentIncline + 0.5;
      // 0x03: Set Target Inclination (Units of 0.1%)
      const inclineInt16 = Math.round(nextIncline * 10);
      await sendControlCommand(device, 0x03, [inclineInt16 & 0xFF, (inclineInt16 >> 8) & 0xFF]);
    } catch (err: any) {
      showMessage('Incline change failed', { type: 'alert' });
    }
  });

  inclineDownBtn.addEventListener('click', async () => {
    if (!device) return;
    try {
      const nextIncline = currentIncline - 0.5;
      const inclineInt16 = Math.round(nextIncline * 10);
      await sendControlCommand(device, 0x03, [inclineInt16 & 0xFF, (inclineInt16 >> 8) & 0xFF]);
    } catch (err: any) {
      showMessage('Incline change failed', { type: 'alert' });
    }
  });

  return () => {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  };
}
