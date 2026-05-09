import { isBackendAvailable } from '@js/tools';

export class DiscoveryManager {
  private topic: string;
  private peerId: string = Math.random().toString(36).substring(2, 10);
  private eventSource: EventSource | null = null;
  public isEnabled: boolean = false;

  constructor(roomName: string) {
    // Hash the room name so ntfy never sees the cleartext name
    this.topic = `btk_${this.simpleHash(roomName)}`;
  }

  private simpleHash(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  async broadcast(data: any) {
    if (!this.isEnabled) return;
    console.debug('[Discovery] broadcasting', this.topic, data);

    const url = isBackendAvailable
      ? `/api/discovery/${this.topic}`
      : `https://ntfy.sh/${this.topic}`;

    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ ...data, sender: this.peerId }),
    });
    if (!res.ok) throw new Error('Failed to broadcast');
  }

  /**
   * Start listening for discovery messages.
   * onMessage receives parsed payloads. onStatus receives 'listening'|'error'.
   */
  start(onMessage: (data: any) => void, onStatus?: (s: 'listening' | 'error') => void) {
    this.isEnabled = true;
    try {
      const sseUrl = isBackendAvailable
        ? `/api/discovery/${this.topic}/sse`
        : `https://ntfy.sh/${this.topic}/sse`;

      this.eventSource = new EventSource(sseUrl);
      this.eventSource.onopen = () => {
        console.debug(
          '[Discovery] SSE open',
          this.topic,
          isBackendAvailable ? '(local)' : '(ntfy)'
        );
        onStatus?.('listening');
      };
      this.eventSource.onerror = (e) => {
        console.warn('[Discovery] SSE error', this.topic, e);
        onStatus?.('error');
      };
      this.eventSource.onmessage = (e) => {
        try {
          // ntfy and our local backend send a JSON envelope; message field contains our payload JSON
          const parsed = JSON.parse(e.data);
          const msg =
            typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
          console.debug('[Discovery] SSE message', this.topic, msg);
          if (msg.sender !== this.peerId) onMessage(msg);
        } catch (err) {
          console.warn('[Discovery] malformed SSE payload', e.data);
          // ignore malformed messages
        }
      };
    } catch (err) {
      console.warn('[Discovery] start failed', err);
      onStatus?.('error');
    }
  }

  stop() {
    console.debug('[Discovery] stop', this.topic);
    this.isEnabled = false;
    this.eventSource?.close();
  }
}
