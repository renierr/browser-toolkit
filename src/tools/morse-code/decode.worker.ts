import { decodeFromFloat32 } from './decoder.ts';
import type { WorkerInMessage, WorkerOutMessage } from './worker-protocol';

self.addEventListener('message', async (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type !== 'decode-pcm') return;

  try {
    const text = await decodeFromFloat32(msg.audio, msg.sampleRate);
    const out: WorkerOutMessage = { type: 'decode-result', id: msg.id, text };
    postMessage(out);
  } catch (e: any) {
    const out: WorkerOutMessage = { type: 'decode-result', id: msg.id, text: null, reason: String(e) };
    postMessage(out);
  }
});
