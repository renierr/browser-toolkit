import { compressSDP, decompressSDP } from './sdp-utils';

export interface PeerConnectionConfig {
    onConnected: () => void;
    onDisconnected: () => void;
    onData: (data: any) => void;
    onSDPGenerated: (compressedSDP: string, isHost: boolean) => void;
}

export class WebRTCManager {
    private pc: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private config: PeerConnectionConfig;

    constructor(config: PeerConnectionConfig) {
        this.config = config;
    }

    async createPeer(isHost: boolean) {
        this.pc = new RTCPeerConnection({ iceServers: [] });

        if (isHost) {
            this.dataChannel = this.pc.createDataChannel('transfer', { ordered: true });
            this.setupDataChannel(this.dataChannel);
        } else {
            this.pc.ondatachannel = (ev) => {
                this.dataChannel = ev.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }

        this.pc.oniceconnectionstatechange = () => {
            if (this.pc?.iceConnectionState === 'connected') {
                this.config.onConnected();
            } else if (this.pc?.iceConnectionState === 'disconnected' || this.pc?.iceConnectionState === 'failed') {
                this.config.onDisconnected();
            }
        };
    }

    private setupDataChannel(channel: RTCDataChannel) {
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
            this.config.onConnected();
        };
        channel.onclose = () => this.config.onDisconnected();
        channel.onmessage = (ev) => this.config.onData(ev.data);
    }

    async generateHandshake(isHost: boolean) {
        if (!this.pc) return;

        const offer = await (isHost ? this.pc.createOffer() : this.pc.createAnswer());
        await this.pc.setLocalDescription(offer);

        await this.waitForIceGathering();

        const sdp = this.pc.localDescription?.sdp || '';
        const compressed = compressSDP(sdp);
        this.config.onSDPGenerated(compressed, isHost);
    }

    private async waitForIceGathering() {
        if (!this.pc || this.pc.iceGatheringState === 'complete') return;

        await new Promise<void>(resolve => {
            const check = () => {
                if (this.pc?.iceGatheringState === 'complete') {
                    this.pc.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            this.pc?.addEventListener('icegatheringstatechange', check);
            setTimeout(resolve, 2000);
        });
    }

    async processSDP(data: string) {
        if (!this.pc) return;

        const isOffer = this.pc.signalingState === 'stable';
        let sdp = data;

        if (data.length < 1000) {
            sdp = decompressSDP(data, isOffer);
        }

        if (isOffer) {
            await this.pc.setRemoteDescription({ type: 'offer', sdp });
            await this.generateHandshake(false);
        } else {
            await this.pc.setRemoteDescription({ type: 'answer', sdp });
        }
    }

    send(data: string | ArrayBuffer | Uint8Array) {
        if (this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(data as any);
        }
    }

    get bufferedAmount() {
        return this.dataChannel?.bufferedAmount || 0;
    }

    set onBufferedAmountLow(fn: (() => void) | null) {
        if (this.dataChannel) {
            this.dataChannel.onbufferedamountlow = fn;
        }
    }

    close() {
        this.pc?.close();
        this.pc = null;
        this.dataChannel = null;
    }

    get isStable() {
        return this.pc?.signalingState === 'stable';
    }

    get hasRemoteDescription() {
        return !!this.pc?.remoteDescription;
    }

    get iceConnectionState() {
        return this.pc?.iceConnectionState;
    }
}
