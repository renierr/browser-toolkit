import { WebRTCManager } from './webrtc-manager.ts';
import { downloadFile } from '@js/file-utils.ts';
import { acquireWakeLock } from '@js/wake-lock';
import * as Utils from './utils.ts';

export interface TransferConfig {
  onProgress: (msg: string, percent: number) => void;
  onComplete: (item: { name: string; size: number; type: 'sent' | 'received' }) => void;
  onMessage: (msg: string, type?: 'info' | 'warning' | 'alert') => void;
  onIncomingFile: (sender: string, filename: string, size: number, type: string) => void;
  onHideProgress: () => void;
  onPeerNameReceived?: (name: string) => void;
}

export class TransferManager {
  private manager: WebRTCManager | null = null;
  private config: TransferConfig;

  private incomingChunks: (Uint8Array | ArrayBuffer)[] = [];
  private incomingMeta: any = null;
  private receivedSize = 0;
  private currentSendingFile: File | null = null;
  private writableStream: any = null; // FileSystemWritableFileStream
  private remotePeerName = 'Peer';

  private transferStartTime = 0;
  private transferBytesProcessed = 0;
  private releaseWakeLock: (() => void) | null = null;

  constructor(config: TransferConfig) {
    this.config = config;
  }

  setManager(manager: WebRTCManager | null) {
    this.manager = manager;
  }

  get incomingFileName(): string {
    return this.incomingMeta?.name || 'file';
  }

  get remotePeerNameText(): string {
    return this.remotePeerName;
  }

  setRemotePeerName(name: string) {
    this.remotePeerName = name;
  }

  handleData(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'name') {
          this.remotePeerName = msg.name;
          this.config.onPeerNameReceived?.(msg.name);
        } else if (msg.type === 'metadata') {
          this.incomingMeta = msg;
          this.incomingChunks = [];
          this.receivedSize = 0;
          this.config.onIncomingFile(this.remotePeerName, msg.name, msg.size, msg.mime);
        } else if (msg.type === 'accept') {
          if (this.currentSendingFile) this.startFileTransfer(this.currentSendingFile);
        } else if (msg.type === 'reject') {
          this.config.onHideProgress();
          this.config.onMessage('Peer rejected the file.');
        }
      } catch (e) {
        console.warn('Malformed string message', e);
      }
    } else {
      const chunk = data instanceof Blob ? data : (data as Uint8Array | ArrayBuffer);
      if (this.incomingMeta) {
        if (chunk instanceof Blob) {
          chunk.arrayBuffer().then((buf) => {
            this.handleReceivedChunk(new Uint8Array(buf));
          });
        } else {
          this.handleReceivedChunk(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk);
        }
      }
    }
  }

  private async handleReceivedChunk(chunk: Uint8Array) {
    if (this.writableStream) {
      await this.writableStream.write(chunk);
    } else {
      this.incomingChunks.push(chunk);
    }
    this.transferBytesProcessed += chunk.byteLength;
    this.processChunk(chunk.byteLength);
  }

  private async processChunk(size: number) {
    this.receivedSize += size;
    const percent = Math.round((this.receivedSize / this.incomingMeta.size) * 100);
    const duration = (Date.now() - this.transferStartTime) / 1000;
    const speed = duration > 0 ? this.receivedSize / duration : 0;

    this.config.onProgress(
      `Receiving ${this.incomingMeta.name}... (${Utils.formatBytes(this.incomingMeta.size - this.receivedSize)} remaining, ${Utils.formatBytes(speed)}/s)`,
      percent
    );

    if (this.receivedSize >= this.incomingMeta.size) {
      this.finishTransfer();

      if (this.writableStream) {
        await this.writableStream.close();
        this.writableStream = null;
      } else {
        const blob = new Blob(this.incomingChunks as any[], { type: this.incomingMeta.mime });
        downloadFile(blob, this.incomingMeta.name);
      }

      this.config.onComplete({
        name: this.incomingMeta.name,
        size: this.receivedSize,
        type: 'received',
      });
      this.incomingChunks = [];
      this.receivedSize = 0;
      this.incomingMeta = null;
      this.config.onMessage('File received');
    }
  }

  private finishTransfer() {
    this.config.onHideProgress();
    if (this.releaseWakeLock) {
      this.releaseWakeLock();
      this.releaseWakeLock = null;
    }
  }

  async acceptIncoming(saveHandle?: any) {
    if (this.incomingMeta && saveHandle) {
      try {
        this.writableStream = await saveHandle.createWritable();
      } catch (e) {
        console.warn('File streaming failed, falling back to memory', e);
        this.writableStream = null;
      }
    }

    this.transferStartTime = Date.now();
    this.transferBytesProcessed = 0;
    this.releaseWakeLock = acquireWakeLock();
    this.manager?.send(JSON.stringify({ type: 'accept' }));
    this.config.onProgress('Receiving...', 0);
  }

  rejectIncoming() {
    this.manager?.send(JSON.stringify({ type: 'reject' }));
    this.incomingChunks = [];
    this.receivedSize = 0;
    this.incomingMeta = null;
  }

  async sendFile(file: File) {
    if (!this.manager) return;
    this.currentSendingFile = file;
    this.manager.send(
      JSON.stringify({ type: 'metadata', name: file.name, size: file.size, mime: file.type })
    );
    this.config.onProgress(`Waiting for peer to accept ${file.name}...`, 0);
  }

  private async startFileTransfer(file: File) {
    if (!this.manager) return;
    this.config.onProgress(`Sending ${file.name}...`, 0);
    this.transferStartTime = Date.now();
    this.transferBytesProcessed = 0;
    this.releaseWakeLock = acquireWakeLock();

    const CHUNK_SIZE = 256 * 1024;
    let offset = 0;

    while (offset < file.size) {
      if (this.manager.bufferedAmount > 8 * 1024 * 1024) {
        // 8MB buffer threshold
        await new Promise((resolve) => {
          this.manager!.onBufferedAmountLow = () => {
            this.manager!.onBufferedAmountLow = null;
            resolve(null);
          };
        });
      }

      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await chunk.arrayBuffer();
      this.manager.send(buffer);
      offset += buffer.byteLength;
      this.transferBytesProcessed = offset;

      const duration = (Date.now() - this.transferStartTime) / 1000;
      const speed = duration > 0 ? offset / duration : 0;
      const remainingBytes = file.size - offset;
      const progressPercent = Math.round((offset / file.size) * 100);
      this.config.onProgress(
        `Sending ${file.name}... (${Utils.formatBytes(remainingBytes)} remaining, ${Utils.formatBytes(speed)}/s)`,
        progressPercent
      );
    }

    this.finishTransfer();
    this.currentSendingFile = null;
    this.config.onMessage('File sent!');
    this.config.onComplete({ name: file.name, size: file.size, type: 'sent' });
  }

  reset() {
    this.finishTransfer();
    this.incomingChunks = [];
    this.incomingMeta = null;
    this.receivedSize = 0;
    this.currentSendingFile = null;
    this.writableStream = null;
    this.remotePeerName = 'Peer';
  }
}
