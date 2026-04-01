import type { ModuleFile } from '../../js/chiptune/types';
import { noteToFrequency } from './note-utils';

let previewCtx: AudioContext | null = null;

export function previewInstrument(
  mod: ModuleFile,
  instIndex: number,
  note: string,
  octave: number
): void {
  if (instIndex < 0 || instIndex >= mod.instruments.length) return;
  const inst = mod.instruments[instIndex];
  if (!inst || inst.samples.length === 0) return;
  const sample = inst.samples[0];
  if (!sample.data || sample.data.length === 0) return;

  if (!previewCtx) {
    previewCtx = new AudioContext();
  }
  if (previewCtx.state === 'suspended') previewCtx.resume();

  const buffer = previewCtx.createBuffer(1, sample.data.length, previewCtx.sampleRate);
  buffer.getChannelData(0).set(sample.data);

  const source = previewCtx.createBufferSource();
  source.buffer = buffer;

  if (sample.loopLength > 2) {
    source.loop = true;
    source.loopStart = sample.loopStart / previewCtx.sampleRate;
    source.loopEnd = (sample.loopStart + sample.loopLength) / previewCtx.sampleRate;
  }

  const targetFreq = noteToFrequency(note, octave);
  const baseFreq = noteToFrequency('C', 4);
  source.playbackRate.value = targetFreq / baseFreq;

  const gain = previewCtx.createGain();
  gain.gain.setValueAtTime(0.4, previewCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, previewCtx.currentTime + 0.8);

  source.connect(gain);
  gain.connect(previewCtx.destination);

  source.start();
  source.stop(previewCtx.currentTime + 0.8);
}

export function cleanupPreview(): void {
  previewCtx?.close();
  previewCtx = null;
}
