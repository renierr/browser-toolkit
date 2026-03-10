import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showMessage, showProgress, hideProgress } from '../../js/ui.ts';
import { startCamera, stopCamera } from '../../js/camera-utils.ts';
import QRCode from 'qrcode';

// @ts-ignore - Vite worker import
import ScanWorker from '../qr-scanner/scan.worker?worker';

const ADJECTIVES = ['Golden', 'Silent', 'Funny', 'Grateful', 'Brave', 'Swift', 'Calm', 'Wild', 'Shiny', 'Ancient'];
const ANIMALS = ['Hippo', 'Cat', 'Dog', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Deer'];

function generateName() {
    const saved = localStorage.getItem('btk-drop-name');
    if (saved) return saved;
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const name = `${adj} ${animal} ${Math.floor(Math.random() * 900) + 100}`;
    localStorage.setItem('btk-drop-name', name);
    return name;
}

export default async function init() {
    const selfName = generateName();
    let pc: RTCPeerConnection | null = null;
    let dataChannel: RTCDataChannel | null = null;
    let worker: Worker | null = null;
    let stream: MediaStream | null = null;

    // UI Elements
    const selfNameEl = document.getElementById('self-name')!;
    const selfInitialsEl = document.getElementById('self-initials')!;
    const statusBadge = document.getElementById('status-badge')!;
    const setupView = document.getElementById('setup-view')!;
    const handshakeView = document.getElementById('handshake-view')!;
    const connectedView = document.getElementById('connected-view')!;
    const hostBtn = document.getElementById('host-btn')!;
    const joinBtn = document.getElementById('join-btn')!;
    const cancelHandshakeBtn = document.getElementById('cancel-handshake')!;
    const stepTitle = document.getElementById('handshake-step-title')!;
    const qrOutputContainer = document.getElementById('qr-output-container')!;
    const qrCanvasOutput = document.getElementById('qr-canvas-output') as HTMLCanvasElement;
    const scannerContainer = document.getElementById('scanner-container')!;
    const qrVideo = document.getElementById('qr-video') as HTMLVideoElement;
    const sdpText = document.getElementById('sdp-text') as HTMLTextAreaElement;
    const sdpActionBtn = document.getElementById('sdp-action-btn')!;
    const remotePeerNameEl = document.getElementById('remote-peer-name')!;
    const disconnectBtn = document.getElementById('disconnect-btn')!;


    const receiveModal = document.getElementById('receive-modal') as HTMLDialogElement;
    const senderNameEl = document.getElementById('sender-name')!;
    const incomingFilenameEl = document.getElementById('incoming-filename')!;
    const incomingSizeEl = document.getElementById('incoming-size')!;
    const acceptBtn = document.getElementById('accept-btn')!;
    const rejectBtn = document.getElementById('reject-btn')!;

    selfNameEl.textContent = selfName;
    selfInitialsEl.textContent = selfName.split(' ').map(n => n[0]).join('').substring(0, 2);

    // --- Handshake Logic ---

    async function createPeer(isHost: boolean) {
        pc = new RTCPeerConnection({
            iceServers: []
        });

        if (isHost) {
            dataChannel = pc.createDataChannel('transfer', { ordered: true });
            setupDataChannel(dataChannel);
        } else {
            pc.ondatachannel = (ev) => {
                dataChannel = ev.channel;
                setupDataChannel(dataChannel);
            };
        }

        pc.oniceconnectionstatechange = () => {
             if (pc?.iceConnectionState === 'connected') {
                 showConnected();
             } else if (pc?.iceConnectionState === 'disconnected' || pc?.iceConnectionState === 'failed') {
                 reset();
             }
        };
    }

    function setupDataChannel(channel: RTCDataChannel) {
        channel.onopen = () => showConnected();
        channel.onclose = () => reset();
        channel.onmessage = (ev) => handleData(ev.data);
    }

    async function generateHandshake(isHost: boolean) {
        if (!pc) return;
        
        // Add metadata to SDP (simplified by prefixing or just metadata packet later)
        // For now, let's keep it simple and send metadata as first message.

        const offer = await (isHost ? pc.createOffer() : pc.createAnswer());
        await pc.setLocalDescription(offer);

        // Wait for ICE candidates to gather (since we are offline/serverless)
        // For local network, we want them in the initial SDP
        if (pc.iceGatheringState !== 'complete') {
            await new Promise<void>(resolve => {
                const check = () => {
                    if (pc?.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', check);
                        resolve();
                    }
                };
                pc?.addEventListener('icegatheringstatechange', check);
                // Fallback timeout
                setTimeout(resolve, 1000);
            });
        }

        const sdp = pc.localDescription?.sdp || '';
        showQR(sdp);
        stepTitle.textContent = isHost ? "Step 1: Show this QR to Peer" : "Step 2: Show this Answer QR to Peer";
    }

    function showQR(text: string) {
        qrOutputContainer.classList.remove('hidden');
        scannerContainer.classList.add('hidden');
        QRCode.toCanvas(qrCanvasOutput, text, { width: 320, margin: 2 });
        sdpText.value = text;
    }

    async function startScanning(title: string) {
        stepTitle.textContent = title;
        qrOutputContainer.classList.add('hidden');
        scannerContainer.classList.remove('hidden');
        
        stream = await startCamera({ videoEl: qrVideo });
        if (!stream) {
            showMessage('Could not start camera. Use manual mode.', { type: 'warning' });
            return;
        }

        if (!worker) {
            worker = new ScanWorker();
            worker.onmessage = (e) => {
                if (e.data.data) {
                    processSDP(e.data.data);
                    stopScan();
                }
            };
        }

        const scan = async () => {
            if (!stream) return;
            const bitmap = await createImageBitmap(qrVideo);
            worker?.postMessage({ type: 'scan-image', id: Date.now(), bitmap }, [bitmap]);
            requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
    }

    function stopScan() {
        stream = stopCamera(stream);
        scannerContainer.classList.add('hidden');
    }

    async function processSDP(data: string) {
        if (!pc) return;
        try {
            if (pc.signalingState === 'stable') {
                // We got an offer
                await pc.setRemoteDescription({ type: 'offer', sdp: data });
                generateHandshake(false);
            } else {
                // We got an answer
                await pc.setRemoteDescription({ type: 'answer', sdp: data });
            }
        } catch (e) {
            console.error('SDP Error:', e);
            showMessage('Invalid handshake data.', { type: 'alert' });
        }
    }

    // --- Actions ---

    hostBtn.onclick = async () => {
        setupView.classList.add('hidden');
        handshakeView.classList.remove('hidden');
        await createPeer(true);
        generateHandshake(true);
    };

    joinBtn.onclick = async () => {
        setupView.classList.add('hidden');
        handshakeView.classList.remove('hidden');
        await createPeer(false);
        startScanning("Step 1: Scan Host's Offer QR");
    };

    sdpActionBtn.onclick = () => {
        processSDP(sdpText.value);
    };

    cancelHandshakeBtn.onclick = () => reset();

    function showConnected() {
        handshakeView.classList.add('hidden');
        connectedView.classList.remove('hidden');
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'badge badge-success';
        
        // Send our name once connected
        dataChannel?.send(JSON.stringify({ type: 'name', name: selfName }));
    }

    function reset() {
        stopScan();
        pc?.close();
        pc = null;
        dataChannel = null;
        setupView.classList.remove('hidden');
        handshakeView.classList.add('hidden');
        connectedView.classList.add('hidden');
        statusBadge.textContent = 'Ready';
        statusBadge.className = 'badge badge-outline';
    }

    disconnectBtn.onclick = reset;

    // --- Transfer Logic ---

    let incomingChunks: any[] = [];
    let incomingMeta: any = null;
    let receivedSize = 0;

    function handleData(data: any) {
        if (typeof data === 'string') {
            const msg = JSON.parse(data);
            if (msg.type === 'name') {
                remotePeerNameEl.textContent = msg.name;
            } else if (msg.type === 'metadata') {
                incomingMeta = msg;
                senderNameEl.textContent = remotePeerNameEl.textContent || 'Peer';
                incomingFilenameEl.textContent = msg.name;
                incomingSizeEl.textContent = formatBytes(msg.size);
                receiveModal.showModal();
            } else if (msg.type === 'accept') {
                // Peer accepted
            } else if (msg.type === 'reject') {
                hideProgress();
                showMessage('Peer rejected the file.');
            }
        } else {
            // Binary chunk
            incomingChunks.push(new Uint8Array(data));
            receivedSize += data.byteLength;
            
            if (incomingMeta) {
                const percent = Math.round((receivedSize / incomingMeta.size) * 100);
                showProgress(`Receiving ${incomingMeta.name}...`, { progress: percent });
                
                if (receivedSize >= incomingMeta.size) {
                    hideProgress();
                    const blob = new Blob(incomingChunks, { type: incomingMeta.mime });
                    downloadFile(blob, incomingMeta.name);
                    incomingChunks = [];
                    receivedSize = 0;
                    showMessage('File received: ' + incomingMeta.name);
                }
            }
        }
    }

    acceptBtn.onclick = () => {
        receiveModal.close();
        dataChannel?.send(JSON.stringify({ type: 'accept' }));
        showProgress('Receiving...', { progress: 0 });
    };

    rejectBtn.onclick = () => {
        receiveModal.close();
        dataChannel?.send(JSON.stringify({ type: 'reject' }));
        incomingChunks = [];
        receivedSize = 0;
    };

    async function sendFile(file: File) {
        if (!dataChannel || dataChannel.readyState !== 'open') return;

        dataChannel.send(JSON.stringify({
            type: 'metadata',
            name: file.name,
            size: file.size,
            mime: file.type
        }));

        showProgress(`Sending ${file.name}...`, { progress: 0 });

        const reader = file.stream().getReader();
        let sent = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Simple flow control
            if (dataChannel.bufferedAmount > 16 * 1024 * 1024) {
                 await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            dataChannel.send(value);
            sent += value.byteLength;
            showProgress(`Sending ${file.name}...`, { progress: Math.round((sent/file.size)*100) });
        }
        
        hideProgress();
        showMessage('File sent!');
    }

    setupFileDropzone('dropzone', 'file-input', (files) => {
        if (files.length > 0) sendFile(files[0]);
    });

    function formatBytes(bytes: number) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
    }

    return () => {
        reset();
        worker?.terminate();
    };
}
