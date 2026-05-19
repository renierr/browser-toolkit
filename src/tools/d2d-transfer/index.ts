import { setupFileDropzone } from '@js/file-utils.ts';
import { showMessage } from '@js/ui.ts';
import { AudioSender, AudioReceiver, BIT_TIME_MS as AUDIO_BIT } from './audio-codec';
import { VisualSender, VisualReceiver, BIT_TIME_MS as VISUAL_BIT } from './visual-codec';
import { TransferStore } from './transfer-store';
import { HEADER_SIZE } from './protocol';

export default function init() {
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
  const ta = (id: string) => document.getElementById(id) as HTMLTextAreaElement;

  const els = {
    stepRole: el('step-role'),
    stepMethod: el('step-method'),
    stepSenderInput: el('step-sender-input'),
    stepReceiver: el('step-receiver'),
    stepTransfer: el('step-transfer'),
    stepSenderDone: el('step-sender-done'),
    stepReceived: el('step-received'),
    historySection: el('history-section'),
    historyList: el('history-list'),
    historyEmpty: el('history-empty'),
    methodInfo: el('method-info'),
    senderFileInfo: el('sender-file-info'),
    senderEstimate: el('sender-estimate'),
    senderText: ta('sender-text'),
    receiverAudioArea: el('receiver-audio-area'),
    receiverVisualArea: el('receiver-visual-area'),
    receiverCamera: document.getElementById('receiver-camera') as HTMLVideoElement,
    cameraPlaceholder: el('camera-placeholder'),
    statusBar: el('status-bar'),
    transferStatus: el('transfer-status'),
    transferProgressBar: el('transfer-progress-bar'),
    transferSent: el('transfer-sent'),
    transferTotal: el('transfer-total'),
    transferElapsed: el('transfer-elapsed'),
    transferMethod: el('transfer-method'),
    transferInstruction: el('transfer-instruction'),
    receiveSuccessText: el('receive-success-text'),
    receivedText: ta('received-text'),
    receivedTextContainer: el('received-text-container'),
    receivedFileContainer: el('received-file-container'),
    receivedFileName: el('received-file-name'),
    receivedFileSize: el('received-file-size'),
    receivedFileDownload: el('received-file-download') as HTMLAnchorElement,
    receivedImageContainer: el('received-image-container'),
    receivedImage: document.getElementById('received-image') as HTMLImageElement,
    receivedImageDownload: el('received-image-download') as HTMLAnchorElement,
  };

  let selectedRole: 'sender' | 'receiver' | null = null;
  let selectedMethod: 'audio' | 'visual' | null = null;
  let pendingFile: File | null = null;
  let pendingIsFile = false;
  let audioSender: AudioSender | null = null;
  let audioReceiver: AudioReceiver | null = null;
  let visualSender: VisualSender | null = null;
  let visualReceiver: VisualReceiver | null = null;
  let transferStartTime = 0;
  let progressTimer: number | null = null;
  const store = new TransferStore();

  function showStep(id: string): void {
    const all = [
      'step-role',
      'step-method',
      'step-sender-input',
      'step-receiver',
      'step-transfer',
      'step-sender-done',
      'step-received',
    ];
    for (const s of all) el(s).classList.toggle('hidden', s !== id);
  }

  function setStatus(msg: string): void {
    els.statusBar.classList.remove('hidden');
    els.statusBar.textContent = msg;
  }

  function hideStatus(): void {
    els.statusBar.classList.add('hidden');
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function dataSizeBytes(): number {
    if (pendingIsFile && pendingFile) return pendingFile.size;
    const text = els.senderText.value.trim();
    if (text) return new TextEncoder().encode(text).length + 1;
    return 0;
  }

  function refillSenderInput(): void {
    const fileInfo = pendingFile
      ? `${pendingFile.name} (${formatBytes(pendingFile.size)})`
      : 'No file selected';
    els.senderFileInfo.textContent = fileInfo;

    const hasData = els.senderText.value.trim().length > 0 || !!pendingFile;
    const size = dataSizeBytes();

    if (size > 0) {
      const audioBits = (size + HEADER_SIZE) * 8 * 3;
      const audioMs = audioBits * AUDIO_BIT;
      const visBits = (size + HEADER_SIZE) * 8 * 2;
      const visMs = visBits * VISUAL_BIT;
      els.senderEstimate.classList.remove('hidden');
      const warnAudio = size > 10240 ? ' ⚠️' : '';
      const warnVisual = size > 1024 ? ' ⚠️' : '';
      els.senderEstimate.innerHTML = `Estimated: ~${formatDuration(audioMs)} via Sound${warnAudio} &middot; ~${formatDuration(visMs)} via Light${warnVisual}`;
    } else {
      els.senderEstimate.classList.add('hidden');
    }

    btn('btn-send-audio').classList.toggle('hidden', !hasData || selectedMethod !== 'audio');
    btn('btn-send-visual').classList.toggle('hidden', !hasData || selectedMethod !== 'visual');
  }

  async function loadFileAsBytes(file: File): Promise<Uint8Array> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(file.name);
    const nameLen = nameBytes.length;
    if (nameLen > 65535) throw new Error('Filename too long');

    const result = new Uint8Array(3 + nameLen + bytes.length);
    result[0] = 0x01;
    result[1] = (nameLen >> 8) & 0xff;
    result[2] = nameLen & 0xff;
    result.set(nameBytes, 3);
    result.set(bytes, 3 + nameLen);
    return result;
  }

  function encodeText(text: string): Uint8Array {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);
    const result = new Uint8Array(1 + textBytes.length);
    result[0] = 0x00;
    result.set(textBytes, 1);
    return result;
  }

  function showReceivedData(raw: Uint8Array): void {
    if (raw.length === 0) return;
    const type = raw[0];
    el('step-received').classList.remove('hidden');

    els.receivedTextContainer.classList.add('hidden');
    els.receivedFileContainer.classList.add('hidden');
    els.receivedImageContainer.classList.add('hidden');

    if (type === 0x00) {
      const text = new TextDecoder().decode(raw.slice(1));
      els.receivedText.value = text;
      els.receivedTextContainer.classList.remove('hidden');
      els.receiveSuccessText.textContent = `Text received (${raw.length - 1} bytes)`;
    } else if (type === 0x01 || type === 0x02) {
      const nameLen = (raw[1] << 8) | raw[2];
      const name = new TextDecoder().decode(raw.slice(3, 3 + nameLen));
      const data = raw.slice(3 + nameLen);

      if (type === 0x02) {
        const mimeMatch = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
        const mime = mimeMatch
          ? `image/${mimeMatch[1] === 'jpg' ? 'jpeg' : mimeMatch[1].toLowerCase()}`
          : 'image/png';
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        els.receivedImage.src = url;
        els.receivedImageContainer.classList.remove('hidden');
        els.receivedImageDownload.href = url;
        els.receivedImageDownload.download = name;
        els.receiveSuccessText.textContent = `Image received: ${name} (${formatBytes(data.length)})`;
      } else {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        els.receivedFileName.textContent = name;
        els.receivedFileSize.textContent = formatBytes(data.length);
        els.receivedFileDownload.href = url;
        els.receivedFileDownload.download = name;
        els.receivedFileContainer.classList.remove('hidden');
        els.receiveSuccessText.textContent = `File received: ${name} (${formatBytes(data.length)})`;
      }
    }
  }

  // Steps
  btn('btn-sender').addEventListener('click', () => {
    selectedRole = 'sender';
    showStep('step-method');
  });

  btn('btn-receiver').addEventListener('click', () => {
    selectedRole = 'receiver';
    showStep('step-method');
  });

  btn('btn-method-audio').addEventListener('click', () => {
    selectedMethod = 'audio';
    els.methodInfo.innerHTML =
      'Uses near-ultrasonic FSK tones at <b>18.5 kHz</b> (0) and <b>19.5 kHz</b> (1). Hold devices <b>5–20 cm</b> apart with speaker facing mic.';
    if (selectedRole === 'sender') {
      showStep('step-sender-input');
      btn('btn-send-audio').classList.remove('hidden');
      btn('btn-send-visual').classList.add('hidden');
      refillSenderInput();
    } else {
      els.receiverAudioArea.classList.remove('hidden');
      els.receiverVisualArea.classList.add('hidden');
      showStep('step-receiver');
    }
  });

  btn('btn-method-visual').addEventListener('click', () => {
    selectedMethod = 'visual';
    els.methodInfo.innerHTML =
      "Flashes the screen <b>white (1)</b> and <b>black (0)</b> at 100ms per bit. Point the receiving device's camera at this screen. Fullscreen recommended.";
    if (selectedRole === 'sender') {
      showStep('step-sender-input');
      btn('btn-send-audio').classList.add('hidden');
      btn('btn-send-visual').classList.remove('hidden');
      refillSenderInput();
    } else {
      els.receiverAudioArea.classList.add('hidden');
      els.receiverVisualArea.classList.remove('hidden');
      showStep('step-receiver');
    }
  });

  btn('btn-back-role').addEventListener('click', () => showStep('step-role'));
  btn('btn-back-method-sender').addEventListener('click', () => showStep('step-method'));
  btn('btn-back-method-receiver').addEventListener('click', () => showStep('step-method'));
  btn('btn-reset-all').addEventListener('click', () => {
    cleanupAll();
    showStep('step-role');
  });
  btn('btn-send-another').addEventListener('click', () => {
    showStep('step-sender-input');
    refillSenderInput();
  });
  btn('btn-receive-new').addEventListener('click', () => {
    if (selectedMethod === 'audio') {
      els.receiverAudioArea.classList.remove('hidden');
      els.receiverVisualArea.classList.add('hidden');
    } else {
      els.receiverAudioArea.classList.add('hidden');
      els.receiverVisualArea.classList.remove('hidden');
    }
    hideStatus();
    showStep('step-receiver');
  });

  // Sender input
  els.senderText.addEventListener('input', refillSenderInput);

  setupFileDropzone('sender-dropzone', 'sender-file-input', (files) => {
    const file = files[0];
    if (!file) return;
    pendingFile = file;
    pendingIsFile = true;
    refillSenderInput();
  });

  // Clipboard paste
  btn('btn-paste').addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          els.senderText.value = text;
          refillSenderInput();
          return;
        }
      }
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              pendingFile = new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type });
              pendingIsFile = true;
              refillSenderInput();
              return;
            }
          }
        }
      }
      setStatus('Clipboard is empty or not accessible (try typing instead)');
    } catch {
      setStatus('Cannot read clipboard. Paste manually or type your message.');
    }
  });

  // Sender buttons
  btn('btn-send-audio').addEventListener('click', async () => {
    const data = await getPendingData();
    if (!data) return;
    startSender('audio', data);
  });

  btn('btn-send-visual').addEventListener('click', async () => {
    const data = await getPendingData();
    if (!data) return;
    startSender('visual', data);
  });

  async function getPendingData(): Promise<Uint8Array | null> {
    if (pendingIsFile && pendingFile) {
      try {
        return await loadFileAsBytes(pendingFile);
      } catch (e) {
        showMessage('Failed to read file', { type: 'alert' });
        return null;
      }
    }
    const text = els.senderText.value.trim();
    if (!text) {
      setStatus('Enter some text or select a file first');
      return null;
    }
    return encodeText(text);
  }

  function startSender(method: 'audio' | 'visual', data: Uint8Array): void {
    const totalBytes = data.length;
    hideStatus();
    showStep('step-transfer');
    els.transferStatus.textContent = `Sending via ${method === 'audio' ? 'Sound' : 'Light'}...`;
    els.transferTotal.textContent = formatBytes(totalBytes);
    els.transferMethod.textContent = method === 'audio' ? 'Sound' : 'Light';
    els.transferProgressBar.style.width = '0%';
    els.transferSent.textContent = '0';
    const inst =
      method === 'audio'
        ? "Hold devices 5–20 cm apart with the receiver's microphone facing this device's speaker."
        : 'Switch receiver to camera mode and point it at this screen. For best results, go fullscreen (F11).';
    els.transferInstruction.textContent = inst;

    transferStartTime = performance.now();
    let lastSent = 0;

    const onP = (pct: number) => {
      const sent = Math.floor(totalBytes * pct);
      if (sent !== lastSent) {
        lastSent = sent;
        els.transferSent.textContent = formatBytes(sent);
      }
      els.transferProgressBar.style.width = `${Math.round(pct * 100)}%`;
      const elapsed = performance.now() - transferStartTime;
      els.transferElapsed.textContent = formatDuration(elapsed);
    };

    const onDone = () => {
      cleanupSender();
      if (method === 'visual') cleanupVisualOverlay();
      onP(1);
      store.add({
        id: crypto.randomUUID(),
        direction: 'send',
        method,
        byteLength: totalBytes,
        timestamp: Date.now(),
        success: true,
      });
      refreshHistory();
      showStep('step-sender-done');
    };

    if (method === 'audio') {
      audioSender = new AudioSender();
      audioSender.onProgress(onP);
      audioSender.onComplete(onDone);
      audioSender.start(data).catch((e) => {
        console.error('[Send] audio error', e);
        setStatus('Failed to start audio sender');
        cleanupSender();
      });
    } else {
      visualSender = new VisualSender();
      visualSender.onProgress(onP);
      visualSender.onComplete(onDone);
      visualSender.onCancelRequest(() => {
        visualSender?.stop();
        cleanupSender();
        showStep('step-sender-input');
      });
      visualSender.start(data);
    }

    progressTimer = window.setInterval(() => {
      const elapsed = performance.now() - transferStartTime;
      els.transferElapsed.textContent = formatDuration(elapsed);
    }, 200);
  }

  btn('btn-cancel-transfer').addEventListener('click', () => {
    cleanupSender();
    cleanupReceiver();
    cleanupVisualOverlay();
    showStep('step-sender-input');
  });

  // Receiver
  btn('btn-listen').addEventListener('click', async () => {
    btn('btn-listen').disabled = true;
    btn('btn-listen').querySelector('span')!.textContent = 'Listening...';
    hideStatus();

    audioReceiver = new AudioReceiver();
    audioReceiver.onStatus((s) => {
      if (s === 'done') {
        btn('btn-listen').disabled = false;
        btn('btn-listen').querySelector('span')!.textContent = 'Listen via Microphone';
      }
      setStatus(
        s === 'done'
          ? 'Data received!'
          : s === 'listening'
            ? 'Listening for ultrasonic signal...'
            : s
      );
    });
    audioReceiver.onData((data) => {
      handleReceivedData(data, 'audio');
    });
    audioReceiver.onSignalLevel((level) => {
      updateVuMeter(level);
    });
    try {
      await audioReceiver.start();
    } catch {
      btn('btn-listen').disabled = false;
      btn('btn-listen').querySelector('span')!.textContent = 'Listen via Microphone';
      setStatus('Failed to access microphone');
    }
  });

  btn('btn-watch').addEventListener('click', async () => {
    btn('btn-watch').disabled = true;
    btn('btn-watch').querySelector('span')!.textContent = 'Watching...';

    els.receiverCamera.classList.remove('hidden');
    els.cameraPlaceholder.classList.add('hidden');
    hideStatus();

    visualReceiver = new VisualReceiver();
    visualReceiver.setVideoElement(els.receiverCamera);
    visualReceiver.onStatus((s) => {
      if (s === 'done') {
        btn('btn-watch').disabled = false;
        btn('btn-watch').querySelector('span')!.textContent = 'Watch via Camera';
      }
      setStatus(
        s === 'watching' ? 'Watching for light flashes...' : s === 'done' ? 'Data received!' : s
      );
    });
    visualReceiver.onData((data) => {
      handleReceivedData(data, 'visual');
    });

    try {
      await visualReceiver.start();
    } catch {
      btn('btn-watch').disabled = false;
      btn('btn-watch').querySelector('span')!.textContent = 'Watch via Camera';
      setStatus('Failed to access camera');
    }
  });

  function handleReceivedData(data: Uint8Array, method: 'audio' | 'visual'): void {
    cleanupReceiver();
    showReceivedData(data);
    store.add({
      id: crypto.randomUUID(),
      direction: 'receive',
      method,
      byteLength: data.length,
      timestamp: Date.now(),
      success: true,
    });
    refreshHistory();
  }

  function updateVuMeter(level: number): void {
    const bars = document.querySelectorAll('.vu-bar');
    const count = Math.round(level * bars.length);
    bars.forEach((bar, i) => {
      (bar as HTMLElement).style.opacity = i < count ? '1' : '0.2';
    });
  }

  // Copy received text
  btn('btn-copy-received').addEventListener('click', async () => {
    if (!els.receivedText.value) return;
    try {
      await navigator.clipboard.writeText(els.receivedText.value);
      btn('btn-copy-received').textContent = 'Copied!';
      setTimeout(() => {
        btn('btn-copy-received').textContent = 'Copy Text';
      }, 2000);
    } catch {
      setStatus('Failed to copy');
    }
  });

  // History
  btn('btn-clear-history').addEventListener('click', () => {
    store.clear();
    refreshHistory();
  });

  function refreshHistory(): void {
    const entries = store.getAll();
    if (entries.length === 0) {
      els.historySection.classList.add('hidden');
      return;
    }
    els.historySection.classList.remove('hidden');
    els.historyEmpty.classList.add('hidden');
    els.historyList.innerHTML = '';
    for (const e of entries) {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between p-2 bg-base-200 rounded text-xs';
      const icon = e.direction === 'send' ? '↑' : '↓';
      const method = e.method === 'audio' ? 'Sound' : 'Light';
      const size = e.byteLength;
      div.innerHTML = `
        <span>${icon} ${method} &middot; ${formatBytes(size)}</span>
        <span class="text-base-content/40">${new Date(e.timestamp).toLocaleTimeString()}</span>`;
      els.historyList.appendChild(div);
    }
  }

  // Cleanup
  function cleanupSender(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (audioSender) {
      audioSender.stop();
      audioSender = null;
    }
    if (visualSender) {
      visualSender.stop();
      visualSender = null;
    }
  }

  function cleanupReceiver(): void {
    if (audioReceiver) {
      audioReceiver.stop();
      audioReceiver = null;
    }
    if (visualReceiver) {
      visualReceiver.stop();
      visualReceiver = null;
    }
    els.receiverCamera.pause();
    els.receiverCamera.srcObject = null;
    els.receiverCamera.classList.add('hidden');
    els.cameraPlaceholder.classList.remove('hidden');
    btn('btn-listen').disabled = false;
    btn('btn-listen').querySelector('span')!.textContent = 'Listen via Microphone';
    btn('btn-watch').disabled = false;
    btn('btn-watch').querySelector('span')!.textContent = 'Watch via Camera';
  }

  function cleanupVisualOverlay(): void {
    document.querySelectorAll('.visual-cancel-btn').forEach((el) => el.remove());
  }

  function cleanupAll(): void {
    cleanupSender();
    cleanupReceiver();
    cleanupVisualOverlay();
    selectedRole = null;
    selectedMethod = null;
    pendingFile = null;
    pendingIsFile = false;
    hideStatus();
  }

  refreshHistory();

  return () => {
    cleanupAll();
  };
}
