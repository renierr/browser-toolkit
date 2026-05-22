export type AudioRecorderOptions = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  audioBitrate?: number;
};

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private recordingStartTime: number = 0;
  private recordingInterval: number | null = null;
  private onTimerUpdate: ((time: string) => void) | null = null;
  private onStop: ((url: string, date: Date, mimeType: string) => void) | null = null;
  private recordedMimeType: string = 'audio/webm';

  constructor(
    onTimerUpdate?: (time: string) => void,
    onStop?: (url: string, date: Date, mimeType: string) => void
  ) {
    this.onTimerUpdate = onTimerUpdate || null;
    this.onStop = onStop || null;
  }

  async start(options: AudioRecorderOptions = {}): Promise<AnalyserNode | null> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: options.noiseSuppression ?? true,
          autoGainControl: options.autoGainControl ?? true,
        },
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/aac',
        'audio/mp4',
      ];
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (
          typeof MediaRecorder.isTypeSupported === 'function' &&
          MediaRecorder.isTypeSupported(type)
        ) {
          selectedMimeType = type;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
        this.recordedMimeType = selectedMimeType;
      } else {
        this.recordedMimeType = 'audio/webm';
      }

      if (options.audioBitrate) {
        recorderOptions.audioBitsPerSecond = options.audioBitrate;
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.recordedMimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        if (this.onStop) {
          this.onStop(audioUrl, new Date(), this.recordedMimeType);
        }
      };

      this.mediaRecorder.start();
      this.recordingStartTime = Date.now();
      this.updateTimer();
      this.recordingInterval = window.setInterval(() => this.updateTimer(), 1000);

      return this.analyser;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      throw err;
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private updateTimer() {
    const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    if (this.onTimerUpdate) {
      this.onTimerUpdate(`${minutes}:${seconds}`);
    }
  }
}
