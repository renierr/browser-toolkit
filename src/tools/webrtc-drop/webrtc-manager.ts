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
        console.debug('[WebRTC] createPeer, isHost=', isHost);
        this.pc = new RTCPeerConnection({ iceServers: [] });

        if (isHost) {
            this.dataChannel = this.pc.createDataChannel('transfer', { ordered: true });
            console.debug('[WebRTC] created data channel (host)');
            this.setupDataChannel(this.dataChannel);
        } else {
            this.pc.ondatachannel = (ev) => {
                console.debug('[WebRTC] received datachannel event', ev.channel.label);
                this.dataChannel = ev.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }

        this.pc.oniceconnectionstatechange = () => {
            console.debug('[WebRTC] iceConnectionState=', this.pc?.iceConnectionState);
            if (this.pc?.iceConnectionState === 'connected') {
                this.config.onConnected();
            } else if (this.pc?.iceConnectionState === 'disconnected' || this.pc?.iceConnectionState === 'failed') {
                this.config.onDisconnected();
            }
        };

        this.pc.onicecandidate = () => {
            // optional debug: we don't send candidates separately
        };
    }

    private setupDataChannel(channel: RTCDataChannel) {
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
            console.debug('[WebRTC] datachannel open');
            this.config.onConnected();
        };
        channel.onclose = () => {
            console.debug('[WebRTC] datachannel close');
            this.config.onDisconnected();
        };
        channel.onmessage = (ev) => {
            this.config.onData(ev.data);
        };
    }

    async generateHandshake(isHost: boolean) {
        if (!this.pc) return;

        console.debug('[WebRTC] generateHandshake, isHost=', isHost);
        const offer = await (isHost ? this.pc.createOffer() : this.pc.createAnswer());
        await this.pc.setLocalDescription(offer);
        console.debug('[WebRTC] setLocalDescription complete, type=', this.pc.localDescription?.type);

        await this.waitForIceGathering();

        const sdp = this.pc.localDescription?.sdp || '';
        const compressed = compressSDP(sdp);
        console.debug('[WebRTC] handshake generated, compressed length=', compressed.length);
        this.config.onSDPGenerated(compressed, isHost);
    }

    private async waitForIceGathering() {
        if (!this.pc || this.pc.iceGatheringState === 'complete') return;

        console.debug('[WebRTC] waiting for ICE gathering...');
        await new Promise<void>(resolve => {
            const check = () => {
                if (this.pc?.iceGatheringState === 'complete') {
                    this.pc.removeEventListener('icegatheringstatechange', check);
                    console.debug('[WebRTC] ICE gathering complete');
                    resolve();
                }
            };
            this.pc?.addEventListener('icegatheringstatechange', check);
            setTimeout(() => {
                console.debug('[WebRTC] ICE gathering timeout fallback');
                resolve();
            }, 2000);
        });
    }

    async processSDP(data: string) {
        if (!this.pc) {
            console.warn('[WebRTC] processSDP called but pc is null');
            return;
        }

        const isOffer = this.pc.signalingState === 'stable';
        console.debug('[WebRTC] processSDP incoming, len=', data.length, 'isOffer=', isOffer, 'signalingState=', this.pc.signalingState);
        let sdp = data;

        if (data.length < 1000) {
            sdp = decompressSDP(data, isOffer);
            console.debug('[WebRTC] decompressed SDP len=', sdp.length);
        }

        if (isOffer) {
            console.debug('[WebRTC] setting remote description as offer');
            await this.pc.setRemoteDescription({ type: 'offer', sdp });
            console.debug('[WebRTC] remote offer set, generating answer...');
            await this.generateHandshake(false);
        } else {
            console.debug('[WebRTC] setting remote description as answer');
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
