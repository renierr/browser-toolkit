import { AudioRecorder, type AudioRecorderOptions } from './audio-utils';
import { openInTool } from '@js/tool-chooser.ts';
import { showMessage } from '@js/ui.ts';
import { getSettings } from '@js/settings.ts';
import { openDB, getAllRecordings, saveRecording, deleteRecording, STORE_NAME } from './db';
import { SyncManager } from '@js/sync.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const settings = getSettings('audio-recorder');

  const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
  const btnStopRecord = document.getElementById('btn-stop-record') as HTMLButtonElement;
  const recordingTimer = document.getElementById('recording-timer') as HTMLElement;
  const recordingIndicator = document.getElementById('recording-indicator') as HTMLElement;
  const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
  const recordingsList = document.getElementById('recordings-list') as HTMLElement;
  const noRecordingsMsg = document.getElementById('no-recordings-msg') as HTMLElement;
  const syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;

  let db: IDBDatabase | null = null;
  let visualizerFrame: number | null = null;
  let analyser: AnalyserNode | null = null;
  const activeUrls = new Set<string>();

  // --- Audio Recorder Logic ---

  const onTimerUpdate = (time: string) => {
    recordingTimer.textContent = time;
  };

  const onStop = async (url: string, date: Date, mimeType: string, blob: Blob) => {
    stopVisualizer();
    btnRecord.classList.remove('hidden');
    btnStopRecord.classList.add('hidden');
    recordingIndicator.classList.add('hidden');
    recordingTimer.textContent = '00:00';

    if (db) {
      const name = `Recording ${date.toLocaleTimeString()}`;
      try {
        const saved = await saveRecording(db, name, mimeType, blob);
        const objUrl = URL.createObjectURL(blob);
        activeUrls.add(objUrl);
        addRecording(objUrl, date, mimeType, saved.id, saved.name);
        void handleSync(); // Sync in background
      } catch (err) {
        console.error('[AudioRecorder] Failed to save recording to DB', err);
        showMessage('Failed to save recording locally.', { type: 'alert' });
        activeUrls.add(url);
        addRecording(url, date, mimeType);
      }
    } else {
      activeUrls.add(url);
      addRecording(url, date, mimeType);
    }
  };

  const audioRecorder = new AudioRecorder(onTimerUpdate, onStop);

  const startRecording = async () => {
    try {
      const autoGain =
        (document.getElementById('settings-auto-gain') as HTMLInputElement)?.checked ?? true;
      const noiseSuppression =
        (document.getElementById('settings-noise-suppression') as HTMLInputElement)?.checked ??
        true;
      const echoCancellation =
        (document.getElementById('settings-echo-cancellation') as HTMLInputElement)?.checked ??
        true;
      const qualitySelect = document.getElementById('settings-audio-quality') as HTMLSelectElement;
      const audioBitrate = qualitySelect ? parseInt(qualitySelect.value, 10) : 256000;
      const deviceId =
        (document.getElementById('settings-audio-device') as HTMLSelectElement)?.value || undefined;

      const options: AudioRecorderOptions = {
        autoGainControl: autoGain,
        noiseSuppression,
        echoCancellation,
        audioBitrate,
        deviceId,
      };

      analyser = await audioRecorder.start(options);

      btnRecord.classList.add('hidden');
      btnStopRecord.classList.remove('hidden');
      recordingIndicator.classList.remove('hidden');

      drawVisualizer(canvas);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure you have granted permission.');
    }
  };

  const stopRecording = () => {
    audioRecorder.stop();
  };

  const drawVisualizer = (canvas: HTMLCanvasElement) => {
    if (!analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Adjust canvas size to match display size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const draw = () => {
      if (!analyser) return;

      visualizerFrame = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgb(240, 240, 240)'; // Light background
      // Use theme-aware background if possible, but canvas needs explicit color
      // We'll clear with transparent to let CSS background show through
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444'; // Red color (Tailwind red-500)
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  const stopVisualizer = () => {
    if (visualizerFrame) {
      cancelAnimationFrame(visualizerFrame);
      visualizerFrame = null;
    }
    // Clear canvas
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getExtension = (mime: string): string => {
    if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
    if (mime.includes('ogg')) return 'ogg';
    return 'webm';
  };

  const addRecording = (
    url: string,
    date: Date,
    mimeType: string,
    id?: number,
    customName?: string
  ) => {
    noRecordingsMsg.classList.add('hidden');

    const item = document.createElement('div');
    item.className = 'flex flex-col gap-2 p-3 bg-base-200 rounded-lg border border-base-300';

    const name = customName || `Recording ${date.toLocaleTimeString()}`;
    const ext = getExtension(mimeType);

    item.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <div class="min-w-0 overflow-hidden mr-2">
          <div class="font-medium text-sm truncate" title="${name}">${name}</div>
          <div class="text-xs text-base-content/60">${date.toLocaleDateString()}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <a href="${url}" download="recording-${date.getTime()}.${ext}" class="btn btn-ghost btn-xs btn-square" title="Download">
            <i data-lucide="download" class="w-4 h-4"></i>
          </a>
          <button class="btn btn-ghost btn-xs btn-square text-error btn-delete" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
      <audio src="${url}" controls class="w-full h-8"></audio>
    `;

    // Delete handler
    const deleteBtn = item.querySelector('.btn-delete');
    deleteBtn?.addEventListener('click', async () => {
      item.remove();
      if (recordingsList.children.length === 1) {
        noRecordingsMsg.classList.remove('hidden');
      }
      if (id !== undefined && db) {
        await deleteRecording(db, id);
        void handleSync(); // Sync in background
      }
    });

    // Share / Open in tool handler
    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-ghost btn-xs btn-square';
    shareBtn.title = 'Open in tool';
    shareBtn.innerHTML = `<i data-lucide="share-2" class="w-4 h-4"></i>`;

    shareBtn.addEventListener('click', async () => {
      try {
        // Fetch the blob from the object URL and open in tool
        const resp = await fetch(url);
        const blob = await resp.blob();
        const filename = `recording-${date.getTime()}.${ext}`;
        const file = new File([blob], filename, { type: blob.type || mimeType });
        await openInTool(file, { filename, mimeType: file.type });
      } catch (err) {
        console.error('Failed to open recording in tool:', err);
        showMessage('Could not open recording in another tool.', { type: 'warning' });
      }
    });

    // Insert share button into the controls area (after download, before delete)
    const controls = item.querySelector('.flex.items-center.gap-1.shrink-0');
    if (controls) {
      controls.insertBefore(shareBtn, controls.querySelector('.btn-delete') || null);
    }

    recordingsList.insertBefore(item, recordingsList.firstElementChild?.nextElementSibling || null);
  };

  const deviceSelect = document.getElementById('settings-audio-device') as HTMLSelectElement;

  const populateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (deviceSelect) {
        const savedDeviceId = settings.get<string>('deviceId', '');
        deviceSelect.innerHTML = '';
        devices.forEach((device) => {
          if (device.kind === 'audioinput') {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${deviceSelect.length + 1}`;
            if (device.deviceId === savedDeviceId) {
              option.selected = true;
            }
            deviceSelect.appendChild(option);
          }
        });
        if (deviceSelect.children.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No microphones found';
          deviceSelect.appendChild(option);
        }
      }
    } catch (err) {
      console.warn('Could not enumerate audio devices:', err);
    }
  };

  // Sync handler
  async function handleSync(manual = false) {
    if (!db) return;
    if (syncBtn) {
      syncBtn.classList.add('syncing');
      syncBtn.disabled = true;
    }
    try {
      await SyncManager.sync(db, STORE_NAME, 'audio-recorder', 'shortId', { manual });
      await loadRecordings();
    } catch (e) {
      console.warn('[AudioRecorder] Sync failed (likely offline):', e);
    } finally {
      if (syncBtn) {
        syncBtn.classList.remove('syncing');
        syncBtn.disabled = false;
      }
    }
  }

  // Load recordings from DB
  async function loadRecordings() {
    if (!db) return;
    const recordings = await getAllRecordings(db);

    // Clear list but keep 'no recordings' element
    recordingsList.innerHTML = '';
    recordingsList.appendChild(noRecordingsMsg);

    // Revoke old URLs to prevent memory leaks
    activeUrls.forEach((url) => URL.revokeObjectURL(url));
    activeUrls.clear();

    if (recordings.length === 0) {
      noRecordingsMsg.classList.remove('hidden');
    } else {
      noRecordingsMsg.classList.add('hidden');
      // Sort newest first
      recordings.sort((a, b) => b.createdAt - a.createdAt);

      for (const rec of recordings) {
        const url = URL.createObjectURL(rec.audioData);
        activeUrls.add(url);
        addRecording(url, new Date(rec.createdAt), rec.mimeType, rec.id, rec.name);
      }
    }
  }

  // Populate initially
  populateDevices();

  // Listen for device changes
  navigator.mediaDevices.addEventListener('devicechange', populateDevices);

  btnRecord.addEventListener('click', startRecording);
  btnStopRecord.addEventListener('click', stopRecording);

  // Initialize DB and load recordings
  openDB()
    .then(async (openedDb) => {
      db = openedDb;
      await loadRecordings();

      const available = await SyncManager.isBackendAvailable();
      if (available && syncBtn) {
        syncBtn.classList.remove('hidden');
        syncBtn.addEventListener('click', () => handleSync(true));
        void handleSync(); // BG sync
      }
    })
    .catch((err) => {
      console.error('[AudioRecorder] Failed to open IndexedDB:', err);
    });

  // Cleanup
  return () => {
    stopRecording();
    navigator.mediaDevices.removeEventListener('devicechange', populateDevices);
    activeUrls.forEach((url) => URL.revokeObjectURL(url));
  };
}
