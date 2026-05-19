import { setupFileDropzone } from '@js/file-utils.ts';
import { showMessage } from '@js/ui.ts';
import { acquireWakeLock } from '@js/wake-lock';
import { AudioSender, AudioReceiver, BIT_TIME_MS as AUDIO_BIT, FREQ_DEFAULT } from './audio-codec';
import { VisualSender, VisualReceiver, BIT_TIME_MS as VISUAL_BIT } from './visual-codec';
import { TransferStore } from './transfer-store';
import { HEADER_SIZE } from './protocol';

export default function init() {
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
  const inp = (id: string) => document.getElementById(id) as HTMLInputElement;

  const els = {
    senderEstimate: el('sender-estimate'),
    senderText: document.getElementById('sender-text') as HTMLTextAreaElement,
    receiverCamera: document.getElementById('receiver-camera') as HTMLVideoElement,
    statusBar: el('status-bar'),
    transferStatus: el('transfer-status'),
    transferProgressBar: el('transfer-progress-bar'),
    transferSent: el('transfer-sent'),
    transferTotal: el('transfer-total'),
    transferElapsed: el('transfer-elapsed'),
    transferMethod: el('transfer-method'),
    transferInstruction: el('transfer-instruction'),
    receiveSuccessText: el('receive-success-text'),
    receivedText: document.getElementById('received-text') as HTMLTextAreaElement,
    receivedFileName: el('received-file-name'),
    receivedFileSize: el('received-file-size'),
    receivedFileDownload: el('received-file-download') as HTMLAnchorElement,
    receivedImage: document.getElementById('received-image') as HTMLImageElement,
    receivedImageDownload: el('received-image-download') as HTMLAnchorElement,
    rxSignalDot: el('rx-signal-dot'),
    rxSignalText: el('rx-signal-text'),
    rxVdot: el('rx-vdot'),
    rxVtext: el('rx-vtext'),
  };

  let role: 'sender' | 'receiver' | null = null;
  let method: 'audio' | 'visual' | null = null;
  let pendingFile: File | null = null;
  let isFile = false;
  let audioSender: AudioSender | null = null;
  let audioReceiver: AudioReceiver | null = null;
  let visualSender: VisualSender | null = null;
  let visualReceiver: VisualReceiver | null = null;
  const store = new TransferStore();

  let freqBase = FREQ_DEFAULT;
  let sendTimer: ReturnType<typeof setInterval> | null = null;
  let releaseWakeLock: (() => void) | null = null;

  function show(id: string): void {
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

  function fmtDur(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
  function fmtBytes(b: number): string {
    return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
  }

  function dataSize(): number {
    if (isFile && pendingFile) return pendingFile.size;
    const t = els.senderText.value.trim();
    return t ? new TextEncoder().encode(t).length + 1 : 0;
  }

  function refillSender(): void {
    els.senderEstimate.textContent = pendingFile
      ? `${pendingFile.name} (${fmtBytes(pendingFile.size)})`
      : 'No file selected';
    const size = dataSize();
    const has = els.senderText.value.trim().length > 0 || !!pendingFile;

    if (size > 0) {
      const aBits = (size + HEADER_SIZE) * 8;
      const aMs = aBits * AUDIO_BIT + 300;
      const vBits = (size + HEADER_SIZE) * 8;
      const vMs = vBits * VISUAL_BIT + 500;
      els.senderEstimate.classList.remove('hidden');
      els.senderEstimate.innerHTML =
        'Est. per loop: ~' +
        fmtDur(aMs) +
        ' via Sound &middot; ~' +
        fmtDur(vMs) +
        ' via Light (auto-stops after 3 loops)';
    } else {
      els.senderEstimate.classList.add('hidden');
    }

    btn('btn-send-audio').classList.toggle('hidden', !has || method !== 'audio');
    btn('btn-send-visual').classList.toggle('hidden', !has || method !== 'visual');
  }

  async function loadFile(file: File): Promise<Uint8Array> {
    const buf = await file.arrayBuffer();
    const b = new Uint8Array(buf);
    const enc = new TextEncoder();
    const nb = enc.encode(file.name);
    const nl = nb.length;
    const r = new Uint8Array(3 + nl + b.length);
    r[0] = 0x01;
    r[1] = (nl >> 8) & 0xff;
    r[2] = nl & 0xff;
    r.set(nb, 3);
    r.set(b, 3 + nl);
    return r;
  }

  function encText(text: string): Uint8Array {
    const tb = new TextEncoder().encode(text);
    const r = new Uint8Array(1 + tb.length);
    r[0] = 0x00;
    r.set(tb, 1);
    return r;
  }

  function showReceived(raw: Uint8Array): void {
    if (!raw.length) return;
    const t = raw[0];
    el('step-received').classList.remove('hidden');
    el('received-text-container').classList.add('hidden');
    el('received-file-container').classList.add('hidden');
    el('received-image-container').classList.add('hidden');

    if (t === 0x00) {
      const text = new TextDecoder().decode(raw.slice(1));
      els.receivedText.value = text;
      el('received-text-container').classList.remove('hidden');
      els.receiveSuccessText.textContent = 'Text received (' + (raw.length - 1) + ' bytes)';
    } else if (t === 0x01 || t === 0x02) {
      const nl = (raw[1] << 8) | raw[2];
      const name = new TextDecoder().decode(raw.slice(3, 3 + nl));
      const data = raw.slice(3 + nl);
      if (t === 0x02) {
        const m = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
        const mime = m ? 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1].toLowerCase()) : 'image/png';
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        els.receivedImage.src = url;
        el('received-image-container').classList.remove('hidden');
        els.receivedImageDownload.href = url;
        els.receivedImageDownload.download = name;
        els.receiveSuccessText.textContent =
          'Image received: ' + name + ' (' + fmtBytes(data.length) + ')';
      } else {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        els.receivedFileName.textContent = name;
        els.receivedFileSize.textContent = fmtBytes(data.length);
        els.receivedFileDownload.href = url;
        els.receivedFileDownload.download = name;
        el('received-file-container').classList.remove('hidden');
        els.receiveSuccessText.textContent =
          'File received: ' + name + ' (' + fmtBytes(data.length) + ')';
      }
    }
  }

  // --- Navigation ---
  btn('btn-sender').addEventListener('click', function () {
    role = 'sender';
    show('step-method');
  });
  btn('btn-receiver').addEventListener('click', function () {
    role = 'receiver';
    show('step-method');
  });

  btn('btn-method-audio').addEventListener('click', function () {
    method = 'audio';
    el('method-info').innerHTML =
      'Uses FSK tones at <b>base</b> and <b>base+2 kHz</b>. Lower frequencies are more audible but work on more devices. Adjust slider on next screen.';
    if (role === 'sender') {
      show('step-sender-input');
      el('sender-audio-settings').classList.remove('hidden');
      btn('btn-send-audio').classList.remove('hidden');
      btn('btn-send-visual').classList.add('hidden');
      refillSender();
    } else {
      el('receiver-audio-area').classList.remove('hidden');
      el('receiver-visual-area').classList.add('hidden');
      el('receiver-audio-freq').classList.remove('hidden');
      show('step-receiver');
    }
  });

  btn('btn-method-visual').addEventListener('click', function () {
    method = 'visual';
    el('method-info').innerHTML =
      'Flashes screen <b>white (1)</b> / <b>black (0)</b> at 200ms per bit. Point receiver camera at this screen. Fullscreen recommended (F11).';
    if (role === 'sender') {
      show('step-sender-input');
      el('sender-audio-settings').classList.add('hidden');
      btn('btn-send-audio').classList.add('hidden');
      btn('btn-send-visual').classList.remove('hidden');
      refillSender();
    } else {
      el('receiver-audio-area').classList.add('hidden');
      el('receiver-visual-area').classList.remove('hidden');
      show('step-receiver');
    }
  });

  btn('btn-back-role').addEventListener('click', function () {
    show('step-role');
  });
  btn('btn-back-method-sender').addEventListener('click', function () {
    show('step-method');
  });
  btn('btn-back-method-receiver').addEventListener('click', function () {
    show('step-method');
  });
  btn('btn-reset-all').addEventListener('click', function () {
    cleanupAll();
    show('step-role');
  });
  btn('btn-send-another').addEventListener('click', function () {
    show('step-sender-input');
    refillSender();
  });
  btn('btn-receive-new').addEventListener('click', function () {
    el('receiver-audio-area').classList.toggle('hidden', method !== 'audio');
    el('receiver-visual-area').classList.toggle('hidden', method !== 'visual');
    hideStatus();
    show('step-receiver');
  });

  // --- Frequency slider ---
  const freqSlider = inp('freq-slider');
  const freqDisplay = el('freq-display');
  const rxSlider = inp('rx-freq-slider');
  const rxDisplay = el('rx-freq-display');

  freqSlider.addEventListener('input', function () {
    freqBase = parseInt(freqSlider.value) * 1000;
    freqDisplay.textContent = String(parseInt(freqSlider.value));
    if (audioSender) audioSender.setFrequency(freqBase);
  });

  rxSlider.addEventListener('input', function () {
    const v = parseInt(rxSlider.value) * 1000;
    rxDisplay.textContent = String(parseInt(rxSlider.value));
    if (audioReceiver) audioReceiver.setFrequency(v);
  });

  // --- Sender input ---
  els.senderText.addEventListener('input', refillSender);

  setupFileDropzone('sender-dropzone', 'sender-file-input', function (files) {
    const f = files[0];
    if (!f) return;
    pendingFile = f;
    isFile = true;
    refillSender();
  });

  btn('btn-paste').addEventListener('click', function () {
    doPaste();
  });

  async function doPaste(): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const t = await navigator.clipboard.readText();
        if (t) {
          els.senderText.value = t;
          refillSender();
          return;
        }
      }
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              pendingFile = new File([blob], 'clipboard.' + (type.split('/')[1] || 'png'), {
                type,
              });
              isFile = true;
              refillSender();
              return;
            }
          }
        }
      }
      setStatus('Clipboard empty or not accessible');
    } catch {
      setStatus('Cannot read clipboard');
    }
  }

  async function getData(): Promise<Uint8Array | null> {
    if (isFile && pendingFile) {
      try {
        return await loadFile(pendingFile);
      } catch {
        showMessage('Failed to read file', { type: 'alert' });
        return null;
      }
    }
    const t = els.senderText.value.trim();
    if (!t) {
      setStatus('Enter text or select a file');
      return null;
    }
    return encText(t);
  }

  // --- Sender start ---
  btn('btn-send-audio').addEventListener('click', function () {
    getData().then(function (d) {
      if (d) startSend('audio', d);
    });
  });
  btn('btn-send-visual').addEventListener('click', function () {
    getData().then(function (d) {
      if (d) startSend('visual', d);
    });
  });

  function startSend(m: 'audio' | 'visual', data: Uint8Array): void {
    const total = data.length;
    hideStatus();
    show('step-transfer');
    els.transferStatus.textContent =
      'Broadcasting via ' + (m === 'audio' ? 'Sound' : 'Light') + ' (3 passes)...';
    els.transferTotal.textContent = fmtBytes(total);
    els.transferMethod.textContent = m === 'audio' ? 'Sound' : 'Light';
    els.transferProgressBar.style.width = '0%';
    els.transferSent.textContent = '0';
    els.transferInstruction.textContent =
      m === 'audio'
        ? 'Sender broadcasts 3 passes then auto-stops. Place receiver mic near laptop speaker.'
        : 'Sender flashes 3 passes then auto-stops. Point receiver camera at this screen.';

    releaseWakeLock = acquireWakeLock();

    const start = performance.now();

    function onP(pct: number): void {
      const s = Math.floor(total * pct);
      els.transferSent.textContent = fmtBytes(s);
      els.transferProgressBar.style.width = Math.round(pct * 100) + '%';
      els.transferElapsed.textContent = fmtDur(performance.now() - start);
    }

    function onDone(): void {
      cleanupSend();
      els.transferProgressBar.style.width = '100%';
      els.transferSent.textContent = fmtBytes(total);
      show('step-sender-done');
    }

    if (m === 'audio') {
      audioSender = new AudioSender();
      audioSender.setFrequency(freqBase);
      audioSender.onProgress(onP);
      audioSender.onComplete(onDone);
      audioSender.start(data).catch(function () {
        setStatus('Failed to start audio');
        cleanupSend();
      });
    } else {
      visualSender = new VisualSender();
      visualSender.onProgress(onP);
      visualSender.onComplete(onDone);
      visualSender.onCancelRequest(function () {
        visualSender?.stop();
        cleanupSend();
        show('step-sender-input');
      });
      visualSender.start(data);
    }

    sendTimer = setInterval(function () {
      els.transferElapsed.textContent = fmtDur(performance.now() - start);
    }, 500);
  }

  // --- Cancel ---
  btn('btn-cancel-transfer').addEventListener('click', function () {
    cleanupSend();
    cleanupRcv();
    show('step-sender-input');
  });

  // --- Receiver ---
  btn('btn-listen').addEventListener('click', function () {
    btn('btn-listen').disabled = true;
    btn('btn-listen').querySelector('span')!.textContent = 'Listening...';
    rxSignal('audio', false, 0);

    releaseWakeLock = acquireWakeLock();

    audioReceiver = new AudioReceiver();
    audioReceiver.setFrequency((parseInt(rxSlider.value) || 12) * 1000);

    audioReceiver.onSignal(function (detected, level) {
      rxSignal('audio', detected, level);
      updateVU(level);
    });
    audioReceiver.onData(function (data) {
      handleRx(data, 'audio');
    });

    audioReceiver.start().catch(function () {
      btn('btn-listen').disabled = false;
      btn('btn-listen').querySelector('span')!.textContent = 'Listen via Microphone';
      setStatus('Failed to access microphone');
    });
  });

  btn('btn-watch').addEventListener('click', function () {
    btn('btn-watch').disabled = true;
    btn('btn-watch').querySelector('span')!.textContent = 'Watching...';
    el('receiver-camera').classList.remove('hidden');
    el('camera-placeholder').classList.add('hidden');
    rxSignal('visual', false, 0);

    releaseWakeLock = acquireWakeLock();

    visualReceiver = new VisualReceiver();
    visualReceiver.setVideoElement(els.receiverCamera);
    visualReceiver.onSignal(function (detected, level) {
      rxSignal('visual', detected, level);
    });
    visualReceiver.onData(function (data) {
      handleRx(data, 'visual');
    });

    visualReceiver.start().catch(function () {
      btn('btn-watch').disabled = false;
      btn('btn-watch').querySelector('span')!.textContent = 'Watch via Camera';
      setStatus('Failed to access camera');
    });
  });

  function rxSignal(type: 'audio' | 'visual', detected: boolean, level: number): void {
    const dot = type === 'audio' ? els.rxSignalDot : els.rxVdot;
    const txt = type === 'audio' ? els.rxSignalText : els.rxVtext;
    if (detected) {
      dot.className =
        'w-3 h-3 rounded-full shrink-0 ' + (level > 0.5 ? 'bg-green-500' : 'bg-yellow-400');
      txt.textContent = level > 0.5 ? 'Signal detected! Receiving...' : 'Weak signal...';
    } else {
      dot.className = 'w-3 h-3 rounded-full bg-gray-400 shrink-0';
      txt.textContent =
        type === 'audio' ? 'Waiting for audio signal...' : 'Waiting for light flashes...';
    }
  }

  function updateVU(level: number): void {
    const bars = document.querySelectorAll('.vu-bar');
    const count = Math.round(level * bars.length);
    bars.forEach(function (b, i) {
      (b as HTMLElement).style.opacity = i < count ? '1' : '0.15';
    });
  }

  function handleRx(data: Uint8Array, m: 'audio' | 'visual'): void {
    cleanupRcv();
    showReceived(data);
    store.add({
      id: crypto.randomUUID(),
      direction: 'receive',
      method: m,
      byteLength: data.length,
      timestamp: Date.now(),
      success: true,
    });
    refreshHistory();
  }

  // --- Copy ---
  btn('btn-copy-received').addEventListener('click', function () {
    if (!els.receivedText.value) return;
    navigator.clipboard
      .writeText(els.receivedText.value)
      .then(function () {
        btn('btn-copy-received').textContent = 'Copied!';
        setTimeout(function () {
          btn('btn-copy-received').textContent = 'Copy Text';
        }, 2000);
      })
      .catch(function () {
        setStatus('Failed to copy');
      });
  });

  // --- History ---
  btn('btn-clear-history').addEventListener('click', function () {
    store.clear();
    refreshHistory();
  });

  function refreshHistory(): void {
    const entries = store.getAll();
    if (!entries.length) {
      el('history-section').classList.add('hidden');
      return;
    }
    el('history-section').classList.remove('hidden');
    el('history-empty').classList.add('hidden');
    el('history-list').innerHTML = '';
    for (const e of entries) {
      const d = document.createElement('div');
      d.className = 'flex items-center justify-between p-2 bg-base-200 rounded text-xs';
      d.innerHTML =
        '<span>' +
        (e.direction === 'send' ? '\u2191' : '\u2193') +
        ' ' +
        (e.method === 'audio' ? 'Sound' : 'Light') +
        ' &middot; ' +
        fmtBytes(e.byteLength) +
        '</span><span class="text-base-content/40">' +
        new Date(e.timestamp).toLocaleTimeString() +
        '</span>';
      el('history-list').appendChild(d);
    }
  }

  // --- Cleanup ---
  function cleanupSend(): void {
    if (sendTimer !== null) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
    if (audioSender) {
      audioSender.stop();
      audioSender = null;
    }
    if (visualSender) {
      visualSender.stop();
      visualSender = null;
    }
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  }

  function cleanupRcv(): void {
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
    btn('btn-listen').disabled = false;
    btn('btn-listen').querySelector('span')!.textContent = 'Listen via Microphone';
    btn('btn-watch').disabled = false;
    btn('btn-watch').querySelector('span')!.textContent = 'Watch via Camera';
    if (releaseWakeLock) {
      releaseWakeLock();
      releaseWakeLock = null;
    }
  }

  function cleanupAll(): void {
    cleanupSend();
    cleanupRcv();
    role = null;
    method = null;
    pendingFile = null;
    isFile = false;
    hideStatus();
  }

  refreshHistory();

  return function () {
    cleanupAll();
  };
}
