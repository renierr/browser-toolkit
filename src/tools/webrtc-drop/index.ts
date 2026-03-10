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

// --- SDP Compression ---
// We only need: ufrag, pwd, fingerprints, and candidates for DataChannel.
function compressSDP(sdp: string): string {
    const lines = sdp.split('\n');
    const data: any = { u: '', p: '', f: '', c: [] };
    const candidates: string[] = [];
    
    lines.forEach(l => {
        const line = l.trim();
        if (line.startsWith('a=ice-ufrag:')) data.u = line.split(':')[1].trim();
        else if (line.startsWith('a=ice-pwd:')) data.p = line.split(':')[1].trim();
        else if (line.startsWith('a=fingerprint:sha-256 ')) data.f = line.split('sha-256 ')[1].trim();
        else if (line.startsWith('a=candidate:')) {
            const parts = line.split(' ');
            // Include only 'host' candidates (LAN)
            if (parts[7] === 'host') {
                candidates.push(`${parts[4]}:${parts[5]}`);
            }
        }
    });

    // Deduplicate and prioritize IPv4 (shorter), then limit to 4 to keep QR code small
    const uniqueCandidates = [...new Set(candidates)];
    data.c = uniqueCandidates
        .sort((a, b) => {
            // More robust IPv4 check: IPv6 has many colons
            const aColons = (a.match(/:/g) || []).length;
            const bColons = (b.match(/:/g) || []).length;
            const aIsReallyIPv4 = aColons === 1;
            const bIsReallyIPv4 = bColons === 1;

            if (aIsReallyIPv4 && !bIsReallyIPv4) return -1;
            if (!aIsReallyIPv4 && bIsReallyIPv4) return 1;
            return 0;
        })
        .slice(0, 4);

    return btoa(JSON.stringify(data));
}

function decompressSDP(compressed: string, isOffer: boolean): string {
    const data = JSON.parse(atob(compressed));
    const lines = [
        'v=0',
        'o=- 0 0 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=msid-semantic: WMS',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        'a=mid:0',
        `a=setup:${isOffer ? 'actpass' : 'active'}`,
        `a=ice-ufrag:${data.u}`,
        `a=ice-pwd:${data.p}`,
        `a=fingerprint:sha-256 ${data.f}`,
        'a=sctp-port:5000',
        'a=max-message-size:262144'
    ];

    data.c.forEach((c: string) => {
        const lastColon = c.lastIndexOf(':');
        if (lastColon === -1) return;
        const ip = c.substring(0, lastColon);
        const port = c.substring(lastColon + 1);
        lines.push(`a=candidate:1 1 udp 2122260223 ${ip} ${port} typ host generation 0`);
    });

    return lines.join('\r\n') + '\r\n';
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
    const qrInstruction = document.getElementById('qr-instruction')!;
    const hostScanAnswerBtn = document.getElementById('host-scan-answer-btn')!;
    const scannerContainer = document.getElementById('scanner-container')!;
    const qrVideo = document.getElementById('qr-video') as HTMLVideoElement;
    const sdpText = document.getElementById('sdp-text') as HTMLTextAreaElement;
    const sdpActionBtn = document.getElementById('sdp-action-btn')!;
    const copySdpBtn = document.getElementById('copy-sdp-btn')!;
    const pasteSdpBtn = document.getElementById('paste-sdp-btn')!;
    const quickStatus = document.getElementById('quick-status')!;
    const scanOverlay = document.getElementById('scan-overlay')!;
    const startScanBtn = document.getElementById('start-scan-btn')!;
    const quickConnectOverlay = document.getElementById('quick-connect-overlay')!;
    const quickConnectBtn = document.getElementById('quick-connect-btn')!;
    const discoveredPeerNameEl = document.getElementById('discovered-peer-name')!;
    const remotePeerNameEl = document.getElementById('remote-peer-name')!;
    const disconnectBtn = document.getElementById('disconnect-btn')!;
    const historyList = document.getElementById('transfer-history-list')!;
    const noHistoryMsg = document.getElementById('no-history-msg')!;


    const receiveModal = document.getElementById('receive-modal') as HTMLDialogElement;
    const senderNameEl = document.getElementById('sender-name')!;
    const incomingFilenameEl = document.getElementById('incoming-filename')!;
    const incomingSizeEl = document.getElementById('incoming-size')!;
    const acceptBtn = document.getElementById('accept-btn')!;
    const rejectBtn = document.getElementById('reject-btn')!;

    selfNameEl.textContent = selfName;
    selfInitialsEl.textContent = selfName.split(' ').map(n => n[0]).join('').substring(0, 2);

    // --- BroadcastChannel for Quick Connect ---
    const bc = new BroadcastChannel('btk-webrtc-drop');
    bc.onmessage = (ev) => {
        const msg = ev.data;
        if (msg.type === 'ping') {
             // If we have an offer generated, broadcast it again for the newcomer
             const sdp = localStorage.getItem('btk-host-offer');
             if (sdp) bc.postMessage({ type: 'offer', name: selfName, sdp });
        } else if (msg.type === 'offer' && !pc) {
            quickStatus.classList.remove('hidden');
            quickStatus.textContent = `Quick Connect found: ${msg.name}`;
            discoveredPeerNameEl.textContent = msg.name;
            quickConnectOverlay.classList.remove('hidden');
            joinBtn.classList.add('btn-secondary', 'animate-pulse');
            localStorage.setItem('btk-last-offer', msg.sdp);
        } else if (msg.type === 'answer' && pc?.signalingState === 'have-local-offer') {
             processSDP(msg.sdp);
        }
    };

    // Discovery ping
    bc.postMessage({ type: 'ping' });

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
             console.log('ICE Connection State:', pc?.iceConnectionState);
             if (pc?.iceConnectionState === 'connected') {
                 showConnected();
             } else if (pc?.iceConnectionState === 'disconnected' || pc?.iceConnectionState === 'failed') {
                 reset();
             }
        };
    }

    function setupDataChannel(channel: RTCDataChannel) {
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
             // Send our name once connected
             channel.send(JSON.stringify({ type: 'name', name: selfName }));
             showConnected();
        };
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
                // Fallback timeout - give it a bit more time for multi-interface devices
                setTimeout(resolve, 2000);
            });
        }

        const sdp = pc.localDescription?.sdp || '';
        const compressed = compressSDP(sdp);
        showQR(compressed);
        
        if (isHost) {
            localStorage.setItem('btk-host-offer', compressed);
            hostScanAnswerBtn.classList.remove('hidden');
            qrInstruction.textContent = "STEP 1: Show this to the Joiner. THEN click 'Scan their Answer'.";
            qrInstruction.classList.add('text-primary');
        } else {
            hostScanAnswerBtn.classList.add('hidden');
            qrInstruction.textContent = "STEP 2: Offer scanned! NOW show this Answer QR to the Host.";
            qrInstruction.classList.add('text-secondary');
        }

        // Broadcast for quick connect
        bc.postMessage({
            type: isHost ? 'offer' : 'answer',
            name: selfName,
            sdp: compressed
        });

        stepTitle.textContent = isHost ? "Step 1: Show this QR or Copy Handshake" : "Step 2: Show Answer QR or Copy Handshake";
    }

    function showQR(text: string) {
        qrOutputContainer.classList.remove('hidden');
        scannerContainer.classList.add('hidden');
        
        // Use a high resolution (600px). 
        // Tailwind CSS in template.html (w-full max-w-xs) will scale it down elegantly.
        QRCode.toCanvas(qrCanvasOutput, text, { 
            width: 600, 
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' } 
        }, (err) => {
            if (err) console.error('QR Error:', err);
            // Ensure canvas doesn't have fixed inline width/height that overrides CSS
            qrCanvasOutput.style.width = '';
            qrCanvasOutput.style.height = '';
        });
        sdpText.value = text;
    }

    async function startScanning(title: string) {
        stepTitle.textContent = title;
        qrOutputContainer.classList.add('hidden');
        scannerContainer.classList.remove('hidden');
        scanOverlay.classList.remove('hidden');
        
        startScanBtn.onclick = async () => {
            scanOverlay.classList.add('hidden');
            stream = await startCamera({ videoEl: qrVideo });
            if (!stream) {
                showMessage('Could not start camera. Use manual mode.', { type: 'warning' });
                return;
            }

            let lastScanTime = 0;
            const SCAN_INTERVAL = 150;

            if (!worker) {
                worker = new ScanWorker();
                worker.onmessage = (e) => {
                    if (e.data.data) {
                        processSDP(e.data.data);
                        stopScan();
                    }
                };
            }

            const scan = async (time: number) => {
                if (!stream) return;
                if (time - lastScanTime >= SCAN_INTERVAL) {
                    lastScanTime = time;
                    try {
                        const bitmap = await createImageBitmap(qrVideo);
                        worker?.postMessage({ type: 'scan-image', id: Date.now(), bitmap }, [bitmap]);
                    } catch (e) {
                        // Ignore transient errors
                    }
                }
                requestAnimationFrame(scan);
            };
            requestAnimationFrame(scan);
        };
    }

    function stopScan() {
        stream = stopCamera(stream);
        scannerContainer.classList.add('hidden');
    }

    async function processSDP(data: string) {
        if (!pc) {
            console.error('No peer connection');
            return;
        }
        try {
            const isOffer = pc.signalingState === 'stable';
            let sdp = data;
            if (data.length < 1000) {
                try {
                    sdp = decompressSDP(data, isOffer);
                } catch (err) {
                    console.error('Decompression failed:', err, data);
                    throw new Error('Malformed compressed SDP');
                }
            }
            
            if (isOffer) {
                console.log('Processing Offer...');
                await pc.setRemoteDescription({ type: 'offer', sdp });
                stopScan(); // Important: stop scanning before showing our own QR
                await generateHandshake(false);
            } else {
                console.log('Processing Answer...');
                await pc.setRemoteDescription({ type: 'answer', sdp });
                // Host has finished scanning Answer, but showConnected will trigger via ICE
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
        hostScanAnswerBtn.classList.add('hidden'); // Reset
        await createPeer(true);
        generateHandshake(true);
    };

    hostScanAnswerBtn.onclick = () => {
        startScanning("Step 2: Scan Joiner's Answer QR");
    };

    joinBtn.onclick = async () => {
        setupView.classList.add('hidden');
        handshakeView.classList.remove('hidden');
        await createPeer(false);

        // If quick connect data exists, the button will handle it
        startScanning("Step 1: Scan Host's Offer QR");
    };

    quickConnectBtn.onclick = () => {
        const lastOffer = localStorage.getItem('btk-last-offer');
        if (lastOffer) {
            localStorage.removeItem('btk-last-offer');
            processSDP(lastOffer);
            stepTitle.textContent = "Quick Connecting...";
        }
    };

    sdpActionBtn.onclick = () => {
        processSDP(sdpText.value.trim());
    };

    copySdpBtn.onclick = () => {
        navigator.clipboard.writeText(sdpText.value);
        showMessage('Handshake code copied!');
    };

    pasteSdpBtn.onclick = async () => {
        const text = await navigator.clipboard.readText();
        sdpText.value = text.trim();
        processSDP(text.trim());
    };

    cancelHandshakeBtn.onclick = () => reset();

    function showConnected() {
        // Guard: We need a connection, a remote description, AND a remote name (to confirm signal exchange)
        if (!pc || pc.iceConnectionState !== 'connected' || !pc.remoteDescription || !remotePeerNameEl.textContent) {
            console.log('showConnected deferred:', {
                ice: pc?.iceConnectionState,
                hasRemoteDesc: !!pc?.remoteDescription,
                hasRemoteName: !!remotePeerNameEl.textContent
            });
            return;
        }

        handshakeView.classList.add('hidden');
        connectedView.classList.remove('hidden');
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'badge badge-success';
    }

    function reset() {
        stopScan();
        hideProgress();
        pc?.close();
        pc = null;
        dataChannel = null;
        currentSendingFile = null;
        remotePeerNameEl.textContent = '';
        setupView.classList.remove('hidden');
        handshakeView.classList.add('hidden');
        connectedView.classList.add('hidden');
        quickStatus.classList.add('hidden');
        quickConnectOverlay.classList.add('hidden');
        scanOverlay.classList.remove('hidden');
        hostScanAnswerBtn.classList.add('hidden');
        joinBtn.classList.remove('animate-pulse', 'btn-secondary');
        localStorage.removeItem('btk-last-offer');
        localStorage.removeItem('btk-host-offer');
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
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'name') {
                    remotePeerNameEl.textContent = msg.name;
                    showConnected(); // Try showing UI now that we have the name
                } else if (msg.type === 'metadata') {
                    incomingMeta = msg;
                    senderNameEl.textContent = remotePeerNameEl.textContent || 'Peer';
                    incomingFilenameEl.textContent = msg.name;
                    incomingSizeEl.textContent = formatBytes(msg.size);
                    incomingChunks = [];
                    receivedSize = 0;
                    receiveModal.showModal();
                } else if (msg.type === 'accept') {
                    // Start sending if we have a file queued
                    if (currentSendingFile) {
                        startFileTransfer(currentSendingFile);
                    }
                } else if (msg.type === 'reject') {
                    hideProgress();
                    showMessage('Peer rejected the file.');
                }
            } catch (e) {
                console.warn('Malformed string message', e);
            }
        } else {
            // Binary chunk (Blob or ArrayBuffer)
            const chunk = data instanceof Blob ? data : new Uint8Array(data);
            
            if (incomingMeta) {
                if (chunk instanceof Blob) {
                    chunk.arrayBuffer().then(buf => {
                        incomingChunks.push(new Uint8Array(buf));
                        processChunk(buf.byteLength);
                    });
                } else {
                    incomingChunks.push(chunk);
                    processChunk(chunk.byteLength);
                }
            }
        }
    }

    function processChunk(size: number) {
        receivedSize += size;
        const percent = Math.round((receivedSize / incomingMeta.size) * 100);
        showProgress(`Receiving ${incomingMeta.name}...`, { progress: percent });
        
        if (receivedSize >= incomingMeta.size) {
            hideProgress();
            const fileName = incomingMeta.name;
            const mimeType = incomingMeta.mime;
            const blob = new Blob(incomingChunks, { type: mimeType });
            downloadFile(blob, fileName);
            
            addToHistory({
                name: fileName,
                size: receivedSize,
                type: 'received',
                blob: receivedSize < 50 * 1024 * 1024 ? blob : null, // Only keep small files for preview
                mime: mimeType
            });

            incomingChunks = [];
            receivedSize = 0;
            incomingMeta = null;
            showMessage('File received: ' + fileName);
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

    let currentSendingFile: File | null = null;

    async function sendFile(file: File) {
        if (!dataChannel || dataChannel.readyState !== 'open') return;
        currentSendingFile = file;

        // Reset state and send metadata
        dataChannel.send(JSON.stringify({
            type: 'metadata',
            name: file.name,
            size: file.size,
            mime: file.type
        }));

        showProgress(`Waiting for peer to accept ${file.name}...`, { progress: 0 });
    }

    async function startFileTransfer(file: File) {
        if (!dataChannel || dataChannel.readyState !== 'open') return;
        
        showProgress(`Sending ${file.name}...`, { progress: 0 });

        const CHUNK_SIZE = 16 * 1024; // 16KB
        const buffer = await file.arrayBuffer();
        let offset = 0;

        while (offset < file.size) {
            // Flow control: wait if buffer is too full
            if (dataChannel.bufferedAmount > CHUNK_SIZE * 50) { // ~800KB buffer
                 await new Promise(resolve => {
                     dataChannel!.onbufferedamountlow = () => {
                         dataChannel!.onbufferedamountlow = null;
                         resolve(null);
                     };
                 });
            }

            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            dataChannel.send(chunk);
            offset += chunk.byteLength;
            
            const percent = Math.round((offset / file.size) * 100);
            showProgress(`Sending ${file.name}...`, { progress: percent });
        }
        
        hideProgress();
        currentSendingFile = null;
        showMessage('File sent!');

        addToHistory({
            name: file.name,
            size: file.size,
            type: 'sent',
            blob: null // Don't need to keep sent file in memory
        });
    }

    function addToHistory(item: { name: string, size: number, type: 'sent' | 'received', blob?: Blob | null, mime?: string }) {
        noHistoryMsg.classList.add('hidden');
        
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 rounded bg-base-200/50 text-xs border border-base-300';
        
        const info = document.createElement('div');
        info.className = 'flex items-center gap-2 overflow-hidden mr-2';
        
        const icon = document.createElement('i');
        icon.className = 'w-4 h-4 shrink-0 ' + (item.type === 'sent' ? 'text-primary' : 'text-success');
        icon.setAttribute('data-lucide', item.type === 'sent' ? 'arrow-up-right' : 'arrow-down-left');
        
        const nameText = document.createElement('span');
        nameText.className = 'truncate font-medium';
        nameText.textContent = item.name;
        
        const sizeText = document.createElement('span');
        sizeText.className = 'opacity-40 text-[10px] whitespace-nowrap';
        sizeText.textContent = formatBytes(item.size);
        
        info.appendChild(icon);
        info.appendChild(nameText);
        info.appendChild(sizeText);
        
        const actions = document.createElement('div');
        actions.className = 'flex gap-1';
        
        if (item.blob) {
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-ghost btn-xs text-primary';
            viewBtn.textContent = 'View';
            viewBtn.onclick = () => {
                const url = URL.createObjectURL(item.blob!);
                window.open(url, '_blank');
            };
            actions.appendChild(viewBtn);
        }

        const reDownloadBtn = document.createElement('button');
        reDownloadBtn.className = 'btn btn-ghost btn-xs';
        reDownloadBtn.title = 'Download again';
        reDownloadBtn.innerHTML = '<i class="w-3 h-3" data-lucide="download"></i>';
        reDownloadBtn.onclick = () => {
            if (item.blob) {
                downloadFile(item.blob, item.name);
            } else {
                showMessage('Original data cleared from memory.', { type: 'warning' });
            }
        };
        // actions.appendChild(reDownloadBtn); // Keep it simple for now, maybe add later

        div.appendChild(info);
        div.appendChild(actions);
        historyList.prepend(div);
        
        // Refresh icons if needed, or just let them be
        // @ts-ignore
        if (window.lucide) window.lucide.createIcons();
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
        bc.close();
    };
}
