let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export const ensureAudioContextReady = async (): Promise<void> => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
};

export function playTone(durationMs: number, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 600; // Classic CW tone frequency

    // Use envelope to avoid clicking (attack/decay)
    const now = ctx.currentTime;
    const attackTime = 0.005; // 5ms attack
    const decayTime = 0.005; // 5ms decay
    const peakGain = volume * 0.3;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attackTime);
    gainNode.gain.setValueAtTime(peakGain, now + durationMs / 1000 - decayTime);
    gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.01);

    osc.onended = () => resolve();
  });
}

export async function exportAudio(
  morse: string,
  unitMs: number,
  wordGapUnits: number,
  format: 'wav' | 'webm',
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const unitSec = unitMs / 1000;
  const sampleRate = 8000;

  // Calculate total duration
  let totalUnits = 0;
  const parts = morse.split(' ');

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '//') {
      totalUnits += wordGapUnits;
    } else if (part === '/') {
      totalUnits += 3;
    } else {
      for (let j = 0; j < part.length; j++) {
        const sym = part[j];
        totalUnits += sym === '-' ? 3 : 1;
        if (j < part.length - 1) {
          totalUnits += 1; // Inter-element gap
        }
      }
    }
  }

  // Add a little padding
  totalUnits += 2;

  const totalDuration = totalUnits * unitSec;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * totalDuration), sampleRate);

  const osc = offlineCtx.createOscillator();
  const gainNode = offlineCtx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 600;
  osc.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  let currentTime = 0;
  const attackTime = 0.005;
  const decayTime = 0.005;
  const peakGain = 0.5;

  gainNode.gain.setValueAtTime(0, 0);
  osc.start(0);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '//') {
      currentTime += wordGapUnits * unitSec;
    } else if (part === '/') {
      currentTime += 3 * unitSec;
    } else {
      for (let j = 0; j < part.length; j++) {
        const sym = part[j];
        const duration = (sym === '-' ? 3 : 1) * unitSec;

        gainNode.gain.setTargetAtTime(peakGain, currentTime, attackTime / 3);
        gainNode.gain.setTargetAtTime(0, currentTime + duration - decayTime, decayTime / 3);

        currentTime += duration;
        if (j < part.length - 1) {
          currentTime += unitSec; // Inter-element gap
        }
      }
    }
  }

  osc.stop(totalDuration);

  const renderedBuffer = await offlineCtx.startRendering();

  if (format === 'webm') {
    return bufferToWebM(renderedBuffer, onProgress);
  } else {
    onProgress?.(100);
    return bufferToWave(renderedBuffer, renderedBuffer.length);
  }
}

function bufferToWave(abuffer: AudioBuffer, len: number): Blob {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this function)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  const totalFrames = abuffer.length;
  while (offset < totalFrames && pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

async function bufferToWebM(
  buffer: AudioBuffer,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  // Create a new context for recording
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);

  const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
  const chunks: Blob[] = [];

  return new Promise((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'audio/webm' }));
      ctx.close(); // Clean up context
    };

    // Progress tracking
    const duration = buffer.duration;
    const interval = setInterval(() => {
      if (ctx.state === 'running') {
        const pct = Math.min(100, Math.round((ctx.currentTime / duration) * 100));
        onProgress?.(pct);
      }
    }, 100);

    recorder.start();
    source.start(0);

    // Stop recording when the buffer finishes playing
    source.onended = () => {
      clearInterval(interval);
      onProgress?.(100);
      recorder.stop();
    };
  });
}
