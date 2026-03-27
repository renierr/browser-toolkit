import type { TrackerState, CellData } from './tracker-state';
import { noteToFrequency } from './tracker-state';

export async function exportToWav(state: TrackerState): Promise<Blob> {
  const sampleRate = 44100;
  const numChannels = 2;
  const duration = calculateDuration(state);
  const numSamples = Math.ceil(duration * sampleRate);

  const offlineCtx = new OfflineAudioContext(numChannels, numSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(offlineCtx.destination);

  scheduleAllNotes(offlineCtx, masterGain, state);

  const renderedBuffer = await offlineCtx.startRendering();
  return encodeWav(renderedBuffer);
}

function calculateDuration(state: TrackerState): number {
  const rowDuration = 60 / state.bpm / 4;
  let totalRows = 0;
  for (const patternIdx of state.order) {
    const pattern = state.patterns[patternIdx];
    if (pattern) {
      totalRows += pattern.rows.length;
    }
  }
  return totalRows * rowDuration + 2;
}

function scheduleAllNotes(
  offlineCtx: OfflineAudioContext,
  masterGain: GainNode,
  state: TrackerState
): void {
  const rowDuration = 60 / state.bpm / 4;
  let currentTime = 0;
  let orderIndex = 0;

  while (orderIndex < state.order.length) {
    const patternIdx = state.order[orderIndex];
    const pattern = state.patterns[patternIdx];
    if (!pattern) {
      orderIndex++;
      continue;
    }

    for (let row = 0; row < pattern.rows.length; row++) {
      const cells = pattern.rows[row];
      for (let ch = 0; ch < cells.length; ch++) {
        const cell = cells[ch];
        scheduleCell(offlineCtx, masterGain, cell, currentTime, state);
      }
      currentTime += rowDuration;
    }

    orderIndex++;
    if (!state.isLooping && orderIndex >= state.order.length) break;
    if (state.isLooping && orderIndex >= state.order.length) {
      orderIndex = 0;
    }
  }

  const finalNoteTime = currentTime + 1;
  masterGain.gain.setValueAtTime(0.5, finalNoteTime - 1);
  masterGain.gain.linearRampToValueAtTime(0, finalNoteTime);
}

function scheduleCell(
  offlineCtx: OfflineAudioContext,
  masterGain: GainNode,
  cell: CellData,
  time: number,
  state: TrackerState
): void {
  if (cell.note === null || cell.octave === null) return;

  const instrumentId = cell.instrument ?? 1;
  const instrument = state.instruments.find((i) => i.id === instrumentId) ?? state.instruments[0];
  if (!instrument) return;

  const freq = noteToFrequency(cell.note, cell.octave);
  if (freq <= 0) return;

  if (instrument.waveform === 'noise') {
    scheduleNoise(offlineCtx, masterGain, cell.volume, time);
    return;
  }

  const osc = offlineCtx.createOscillator();
  osc.type = instrument.waveform === 'pulse' ? 'square' : (instrument.waveform as OscillatorType);
  osc.frequency.value = freq;

  const gain = offlineCtx.createGain();
  const vol = cell.volume !== null ? cell.volume / 64 : 1;

  osc.connect(gain);
  gain.connect(masterGain);

  const attack = instrument.attack;
  const decay = instrument.decay;
  const sustain = instrument.sustain * vol;
  const release = instrument.release;
  const noteEnd = time + 0.5;

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol, time + attack);
  gain.gain.linearRampToValueAtTime(sustain, time + attack + decay);
  gain.gain.setValueAtTime(sustain, noteEnd - release);
  gain.gain.linearRampToValueAtTime(0, noteEnd);

  osc.start(time);
  osc.stop(noteEnd + 0.05);
}

function scheduleNoise(
  offlineCtx: OfflineAudioContext,
  masterGain: GainNode,
  volume: number | null,
  time: number
): void {
  const bufferSize = offlineCtx.sampleRate * 0.1;
  const buffer = offlineCtx.createBuffer(1, bufferSize, offlineCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const noiseGain = offlineCtx.createGain();
  const vol = volume !== null ? volume / 64 : 0.5;
  noiseGain.gain.setValueAtTime(vol, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

  source.connect(noiseGain);
  noiseGain.connect(masterGain);
  source.start(time);
  source.stop(time + 0.1);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
