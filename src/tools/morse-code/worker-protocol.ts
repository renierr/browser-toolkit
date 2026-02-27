export type DecodePCMMessage = {
  type: 'decode-pcm';
  id: number;
  audio: Float32Array;
  sampleRate: number;
};

export type WorkerInMessage = DecodePCMMessage;

export type DecodeResultMessage = {
  type: 'decode-result';
  id: number;
  text: string | null;
  reason?: string;
};

export type WorkerOutMessage = DecodeResultMessage;
