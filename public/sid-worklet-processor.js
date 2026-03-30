class SidWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.running = true;

    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        const data = event.data.data;
        for (let i = 0; i < data.length; i++) {
          this.buffer[this.bufferIndex] = data[i];
          this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
        }
      } else if (event.data.type === 'stop') {
        this.running = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.running) return false;

    const output = outputs[0];
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      channel[i] = this.buffer[this.bufferIndex];
      this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    }

    return true;
  }
}

registerProcessor('sid-worklet-processor', SidWorkletProcessor);
