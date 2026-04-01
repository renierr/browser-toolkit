import type { ModuleFile } from '../../js/chiptune/types';

export function createPreview(ctxRef: { current: AudioContext | null }): AudioContext {
  if (!ctxRef.current) {
    ctxRef.current = new AudioContext();
  }
  if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
  return ctxRef.current;
}

export function playPreview(
  mod: ModuleFile,
  instIndex: number,
  note: string,
  octave: number,
  ctxRef: { current: AudioContext | null }
): void {
  if (instIndex < 0 || instIndex >= mod.instruments.length) return;
  const inst = mod.instruments[instIndex];
  if (!inst || inst.samples.length === 0) return;
  const sample = inst.samples[0];
  if (!sample.data || sample.data.length === 0) return;

  const ctx = createPreview(ctxRef);

  const buffer = ctx.createBuffer(1, sample.data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(sample.data);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  if (sample.loopLength > 2) {
    source.loop = true;
    source.loopStart = sample.loopStart / ctx.sampleRate;
    source.loopEnd = (sample.loopStart + sample.loopLength) / ctx.sampleRate;
  }

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const targetFreq = 440 * Math.pow(2, ((octave + 1) * 12 + NOTE_NAMES.indexOf(note) - 69) / 12);
  const baseFreq = 440 * Math.pow(2, ((4 + 1) * 12 + NOTE_NAMES.indexOf(note) - 69) / 12);
  source.playbackRate.value = targetFreq / baseFreq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + 0.8);
}

export function cleanupPreview(ctxRef: { current: AudioContext | null }): void {
  ctxRef.current?.close();
  ctxRef.current = null;
}
