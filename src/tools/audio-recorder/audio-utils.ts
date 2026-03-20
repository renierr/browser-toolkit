export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private recordingStartTime: number = 0;
  private recordingInterval: number | null = null;
  private onTimerUpdate: ((time: string) => void) | null = null;
  private onStop: ((url: string, date: Date) => void) | null = null;

  constructor(onTimerUpdate?: (time: string) => void, onStop?: (url: string, date: Date) => void) {
    this.onTimerUpdate = onTimerUpdate || null;
    this.onStop = onStop || null;
  }

  async start(): Promise<AnalyserNode | null> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        if (this.onStop) {
          this.onStop(audioUrl, new Date());
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
