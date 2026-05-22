import { AudioRecorder, type AudioRecorderOptions } from './audio-utils';
import { openInTool } from '@js/tool-chooser.ts';
import { showMessage } from '@js/ui.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
  const btnStopRecord = document.getElementById('btn-stop-record') as HTMLButtonElement;
  const recordingTimer = document.getElementById('recording-timer') as HTMLElement;
  const recordingIndicator = document.getElementById('recording-indicator') as HTMLElement;
  const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
  const recordingsList = document.getElementById('recordings-list') as HTMLElement;
  const noRecordingsMsg = document.getElementById('no-recordings-msg') as HTMLElement;

  let visualizerFrame: number | null = null;
  let analyser: AnalyserNode | null = null;

  // --- Audio Recorder Logic ---

  const onTimerUpdate = (time: string) => {
    recordingTimer.textContent = time;
  };

  const onStop = (url: string, date: Date, mimeType: string) => {
    addRecording(url, date, mimeType);
    stopVisualizer();
    btnRecord.classList.remove('hidden');
    btnStopRecord.classList.add('hidden');
    recordingIndicator.classList.add('hidden');
    recordingTimer.textContent = '00:00';
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

      const options: AudioRecorderOptions = {
        autoGainControl: autoGain,
        noiseSuppression,
        echoCancellation,
        audioBitrate,
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

  const addRecording = (url: string, date: Date, mimeType: string) => {
    noRecordingsMsg.classList.add('hidden');

    const item = document.createElement('div');
    item.className = 'flex flex-col gap-2 p-3 bg-base-200 rounded-lg border border-base-300';

    const name = `Recording ${date.toLocaleTimeString()}`;
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
    deleteBtn?.addEventListener('click', () => {
      item.remove();
      if (recordingsList.children.length === 1) {
        noRecordingsMsg.classList.remove('hidden');
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

  btnRecord.addEventListener('click', startRecording);
  btnStopRecord.addEventListener('click', stopRecording);

  // Cleanup
  return () => {
    stopRecording();
  };
}
