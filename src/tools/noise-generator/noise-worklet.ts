declare const AudioWorkletProcessor: {
  new (): { port: MessagePort };
  prototype: { port: MessagePort };
};
declare const registerProcessor: (name: string, ctor: unknown) => void;

type NoiseType = 'white' | 'pink' | 'brown';

type NoiseWorkletMessage = { type: 'setNoiseType'; noiseType: NoiseType } | { type: 'stop' };

type ChannelState = {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  b6: number;
  lastOut: number;
};

class NoiseWorkletProcessor extends AudioWorkletProcessor {
  private noiseType: NoiseType = 'white';
  private playing = true;
  private channelStates: ChannelState[] = [];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<NoiseWorkletMessage>) => {
      const data = e.data;
      if (data.type === 'setNoiseType') {
        this.noiseType = data.noiseType;
      } else if (data.type === 'stop') {
        this.playing = false;
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    if (!output) return true;

    for (let ch = 0; ch < output.length; ch++) {
      if (!this.channelStates[ch]) {
        this.channelStates[ch] = {
          b0: 0,
          b1: 0,
          b2: 0,
          b3: 0,
          b4: 0,
          b5: 0,
          b6: 0,
          lastOut: 0,
        };
      }
      const channelData = output[ch];
      const st = this.channelStates[ch];

      if (!this.playing) {
        channelData.fill(0);
        continue;
      }

      const len = channelData.length;
      switch (this.noiseType) {
        case 'white':
          for (let i = 0; i < len; i++) {
            channelData[i] = Math.random() * 2 - 1;
          }
          break;
        case 'pink':
          for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            st.b0 = 0.99886 * st.b0 + w * 0.0555179;
            st.b1 = 0.99332 * st.b1 + w * 0.0750759;
            st.b2 = 0.969 * st.b2 + w * 0.153852;
            st.b3 = 0.8665 * st.b3 + w * 0.3104856;
            st.b4 = 0.55 * st.b4 + w * 0.5329522;
            st.b5 = -0.7616 * st.b5 - w * 0.016898;
            channelData[i] =
              (st.b0 + st.b1 + st.b2 + st.b3 + st.b4 + st.b5 + st.b6 + w * 0.5362) * 0.11;
            st.b6 = w * 0.115926;
          }
          break;
        case 'brown':
          for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            st.lastOut = (st.lastOut + 0.02 * w) / 1.02;
            channelData[i] = st.lastOut * 3.5;
          }
          break;
      }
    }
    return true;
  }
}

registerProcessor('noise-worklet', NoiseWorkletProcessor);
