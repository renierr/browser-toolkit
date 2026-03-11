import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import { showMessage, showProgress, hideProgress } from '../../js/ui.ts';
import { startCamera, stopCamera } from '../../js/camera-utils.ts';
import QRCode from 'qrcode';
import * as Utils from './utils.ts';
import { type PeerConnectionConfig, WebRTCManager } from './webrtc-manager.ts';
import { DiscoveryManager } from './discovery-manager.ts';

// @ts-ignore - Vite worker import
import ScanWorker from '../qr-scanner/scan.worker?worker';

// noinspection JSUnusedGlobalSymbols
export default async function init() {
  const selfName = Utils.generateName();
  let manager: WebRTCManager | null = null;
  let worker: Worker | null = null;
  let stream: MediaStream | null = null;
  let discovery: DiscoveryManager | null = null;

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
  const remotePeerNameEl = document.getElementById('remote-peer-name')!;
  const disconnectBtn = document.getElementById('disconnect-btn')!;
  const historyList = document.getElementById('transfer-history-list')!;
  const noHistoryMsg = document.getElementById('no-history-msg')!;
  const discoveryList = document.getElementById('discovery-list')!;
  const discoveryCard = discoveryList.closest('.card') as HTMLElement | null;
  const reOfferBtn = document.getElementById('re-offer-btn') as HTMLButtonElement | null;
  const discoveryToggle = document.getElementById('discovery-toggle') as HTMLInputElement | null;
  const discoveryStatusEl = document.getElementById('discovery-status')!;
  const discoveryDotEl = document.getElementById('discovery-dot')!;

  const receiveModal = document.getElementById('receive-modal') as HTMLDialogElement;
  const senderNameEl = document.getElementById('sender-name')!;
  const incomingFilenameEl = document.getElementById('incoming-filename')!;
  const incomingSizeEl = document.getElementById('incoming-size')!;
  const acceptBtn = document.getElementById('accept-btn')!;
  const rejectBtn = document.getElementById('reject-btn')!;

  selfNameEl.textContent = selfName;
  selfInitialsEl.textContent = selfName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2);

  // --- DiscoveryManager (optional online discovery via ntfy.sh) ---
  let discoveryStarted = false;

  function initDiscovery() {
    if (!discoveryToggle || !discoveryToggle.checked) return;
    if (discoveryStarted) return;
    discoveryStarted = true;
    if (!discovery) discovery = new DiscoveryManager('webrtc-drop');
    discovery.start(
      (data: any) => {
        try {
          // data: { type, name, sdp, sender }
          if (data.type === 'offer') {
            console.debug('[Discovery] offer received from', data.name, 'sender', data.sender);
            addOrUpdateDiscoveredPeer({ name: data.name, sdp: data.sdp, sender: data.sender });
            try {
              localStorage.setItem('btk-last-offer', data.sdp);
            } catch (e) {}
          } else if (data.type === 'answer' && manager && !manager.isStable) {
            console.debug('[Discovery] answer received for local manager; processing SDP');
            stepTitle.textContent = `Processing remote answer from ${data.name || 'peer'}`;
            manager.processSDP(data.sdp);
          }
        } catch (e) {
          console.warn('Discovery message error', e);
        }
      },
      (status) => {
        if (status === 'listening') {
          discoveryStatusEl.textContent = 'Discovery: Listening';
          discoveryDotEl.className = 'w-2 h-2 rounded-full bg-green-400';
        } else if (status === 'error') {
          discoveryStatusEl.textContent = 'Discovery: Error';
          discoveryDotEl.className = 'w-2 h-2 rounded-full bg-red-400';
        }
      }
    );
  }

  function stopDiscovery() {
    discovery?.stop();
    discovery = null;
    discoveryStarted = false;
    discoveryStatusEl.textContent = 'Discovery: Off';
    discoveryDotEl.className = 'w-2 h-2 rounded-full bg-gray-300';
  }

  // Wire the toggle to start/stop discovery
  if (discoveryToggle) {
    discoveryToggle.checked = false; // default OFF
    if (discoveryCard) discoveryCard.style.display = 'none';
    if (reOfferBtn) reOfferBtn.style.display = 'none';
    discoveryToggle.onchange = () => {
      if (discoveryToggle.checked) {
        initDiscovery();
        discoveryStatusEl.textContent = 'Discovery: Starting...';
        discoveryDotEl.className = 'w-2 h-2 rounded-full bg-yellow-400';
        if (discoveryCard) discoveryCard.style.display = '';
        if (reOfferBtn) reOfferBtn.style.display = '';
      } else {
        stopDiscovery();
        discoveryStatusEl.textContent = 'Discovery: Off';
        discoveryDotEl.className = 'w-2 h-2 rounded-full bg-gray-300';
        if (discoveryCard) discoveryCard.style.display = 'none';
        if (reOfferBtn) reOfferBtn.style.display = 'none';
      }
    };
  }

  // --- WebRTC Setup ---
  function initManager() {
    console.debug('[webrtc-drop] initManager');
    const cfg = {
      onConnected: () => {
        manager?.send(JSON.stringify({ type: 'name', name: selfName }));
        showConnected();
      },
      onDisconnected: () => reset(),
      onData: (data: any) => handleData(data),
      onSDPGenerated: (compressed: string, isHost: boolean) => {
        showQR(compressed);

        if (isHost) {
          localStorage.setItem('btk-host-offer', compressed);
          hostScanAnswerBtn.classList.remove('hidden');
          qrInstruction.textContent =
            "STEP 1: Show this to the Joiner. THEN click 'Scan their Answer'.";
          qrInstruction.classList.add('text-primary');
          stepTitle.textContent = 'Step 1: Show this QR or Copy Handshake';
        } else {
          hostScanAnswerBtn.classList.add('hidden');
          qrInstruction.textContent = 'STEP 2: Offer scanned! NOW show this Answer QR to the Host.';
          qrInstruction.classList.add('text-secondary');
          stepTitle.textContent = 'Step 2: Show Answer QR or Copy Handshake';
        }

        if (discovery && discovery.isEnabled) {
          try {
            discovery
              .broadcast({ type: isHost ? 'offer' : 'answer', name: selfName, sdp: compressed })
              .catch((err: any) => {
                console.warn('[Discovery] broadcast failed', err);
              });
          } catch (err) {
            console.warn('[Discovery] broadcast exception', err);
          }
        } else {
          console.debug(
            '[Discovery] not broadcasting (discovery enabled?):',
            !!discovery,
            discovery?.isEnabled
          );
        }
      },
    } as PeerConnectionConfig;

    manager = new WebRTCManager(cfg);
  }

  function showConnected() {
    // show connected UI as soon as ICE/datachannel are connected and we have remote description.
    if (!manager || manager.iceConnectionState !== 'connected' || !manager.hasRemoteDescription)
      return;
    handshakeView.classList.add('hidden');
    setupView.classList.add('hidden');
    connectedView.classList.remove('hidden');
    statusBadge.textContent = 'Connected';
    statusBadge.className = 'badge badge-success';
  }

  function showQR(text: string) {
    qrOutputContainer.classList.remove('hidden');
    scannerContainer.classList.add('hidden');
    QRCode.toCanvas(
      qrCanvasOutput,
      text,
      { width: 600, margin: 1, color: { dark: '#000000', light: '#ffffff' } },
      (err) => {
        if (err) console.error('QR Error:', err);
        qrCanvasOutput.style.width = '';
        qrCanvasOutput.style.height = '';
      }
    );
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
        worker.onmessage = (e: any) => {
          if (e.data.data) {
            manager?.processSDP(e.data.data);
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
          } catch (e) {}
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

  function reset() {
    stopScan();
    hideProgress();
    manager?.close();
    manager = null;
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

  function addOrUpdateDiscoveredPeer(peer: { name: string; sdp: string; sender?: string }) {
    const key = Utils.simpleHash(peer.sdp + (peer.sender || ''));
    let row = document.querySelector<HTMLDivElement>(`#discovery-peer-${key}`);
    if (!row) {
      row = document.createElement('div');
      row.id = `discovery-peer-${key}`;
      row.className =
        'p-2 rounded border border-base-300 flex items-center justify-between bg-base-200/50';
      const info = document.createElement('div');
      info.className = 'text-sm truncate';
      info.textContent = peer.name || 'Peer';
      if (peer.sender) row.dataset.sender = peer.sender;
      const actions = document.createElement('div');
      actions.className = 'flex gap-2';
      const joinBtnEl = document.createElement('button');
      joinBtnEl.className = 'btn btn-xs btn-ghost';
      joinBtnEl.textContent = 'Connect';
      joinBtnEl.onclick = () => {
        console.debug('[Discovery] Connect clicked for', peer.name);
        // switch UI to handshake view and start the answerer flow
        setupView.classList.add('hidden');
        handshakeView.classList.remove('hidden');
        stepTitle.textContent = `Connecting to ${peer.name || 'peer'}...`;
        // ensure discovery is started if toggle is checked (we don't auto-enable it)
        if (discoveryToggle && discoveryToggle.checked) initDiscovery();

        // process the offer after a short delay to allow SSE to open
        setTimeout(() => {
          initManager();
          manager
            ?.createPeer(false)
            .then(() => {
              console.debug('[Discovery] processing remote offer');
              manager?.processSDP(peer.sdp);
            })
            .catch((err) => console.warn('createPeer failed', err));
        }, 800);
      };
      actions.appendChild(joinBtnEl);
      row.appendChild(info);
      row.appendChild(actions);
      discoveryList.prepend(row);
    } else {
      const info = row.querySelector('div');
      if (info) info.textContent = peer.name || 'Peer';
    }
  }

  // Re-offer helper: same as creating an offer — regenerate offer and broadcast when discovery ON.
  if (reOfferBtn) {
    reOfferBtn.addEventListener('click', async () => {
      // Same flow as host: init manager if needed, create peer as host, generate handshake
      if (!manager) initManager();
      await manager!.createPeer(true);
      // ensure discovery is running if the toggle is checked and give SSE a moment to open
      if (discoveryToggle && discoveryToggle.checked) {
        initDiscovery();
        await new Promise((r) => setTimeout(r, 500));
      }
      manager!.generateHandshake(true);
    });
  }

  // --- Actions ---
  hostBtn.onclick = async () => {
    setupView.classList.add('hidden');
    handshakeView.classList.remove('hidden');
    initManager();
    await manager!.createPeer(true);
    if (discoveryToggle && discoveryToggle.checked) {
      initDiscovery();
      await new Promise((r) => setTimeout(r, 500));
    }
    manager!.generateHandshake(true);
  };

  hostScanAnswerBtn.onclick = () => startScanning("Step 2: Scan Joiner's Answer QR");

  joinBtn.onclick = async () => {
    setupView.classList.add('hidden');
    handshakeView.classList.remove('hidden');
    initManager();
    await manager!.createPeer(false);
    startScanning("Step 1: Scan Host's Offer QR");
    if (discoveryToggle && discoveryToggle.checked) initDiscovery();
    console.debug('Join flow: discovery active?', !!discovery);
  };

  quickConnectBtn.onclick = () => {
    const lastOffer = localStorage.getItem('btk-last-offer');
    if (lastOffer) {
      localStorage.removeItem('btk-last-offer');
      manager?.processSDP(lastOffer);
      stepTitle.textContent = 'Quick Connecting...';
    }
  };

  sdpActionBtn.onclick = () => manager?.processSDP(sdpText.value.trim());
  copySdpBtn.onclick = () => {
    navigator.clipboard.writeText(sdpText.value);
    showMessage('Handshake code copied!');
  };
  pasteSdpBtn.onclick = async () => {
    const text = await navigator.clipboard.readText();
    sdpText.value = text.trim();
    manager?.processSDP(text.trim());
  };
  cancelHandshakeBtn.onclick = () => reset();
  disconnectBtn.onclick = reset;

  // --- Transfer Logic ---
  let incomingChunks: (Uint8Array | ArrayBuffer)[] = [];
  let incomingMeta: any = null;
  let receivedSize = 0;
  let currentSendingFile: File | null = null;
  let writableStream: any = null; // FileSystemWritableFileStream

  function handleData(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'name') {
          remotePeerNameEl.textContent = msg.name;
          showConnected();
        } else if (msg.type === 'metadata') {
          incomingMeta = msg;
          senderNameEl.textContent = remotePeerNameEl.textContent || 'Peer';
          incomingFilenameEl.textContent = msg.name;
          incomingSizeEl.textContent = Utils.formatBytes(msg.size);
          incomingChunks = [];
          receivedSize = 0;
          receiveModal.showModal();
        } else if (msg.type === 'accept') {
          if (currentSendingFile) startFileTransfer(currentSendingFile);
        } else if (msg.type === 'reject') {
          hideProgress();
          showMessage('Peer rejected the file.');
        }
      } catch (e) {
        console.warn('Malformed string message', e);
      }
    } else {
      const chunk = data instanceof Blob ? data : (data as Uint8Array | ArrayBuffer);
      if (incomingMeta) {
        if (chunk instanceof Blob) {
          chunk.arrayBuffer().then((buf) => {
            handleReceivedChunk(new Uint8Array(buf));
          });
        } else {
          handleReceivedChunk(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk);
        }
      }
    }
  }

  async function handleReceivedChunk(chunk: Uint8Array) {
    if (writableStream) {
      await writableStream.write(chunk);
    } else {
      incomingChunks.push(chunk);
    }
    processChunk(chunk.byteLength);
  }

  async function processChunk(size: number) {
    receivedSize += size;
    const percent = Math.round((receivedSize / incomingMeta.size) * 100);
    const remaining = incomingMeta.size - receivedSize;
    
    showProgress(
      `Receiving ${incomingMeta.name}... (${Utils.formatBytes(remaining)} remaining)`, 
      { progress: percent }
    );

    if (receivedSize >= incomingMeta.size) {
      hideProgress();
      
      if (writableStream) {
        await writableStream.close();
        writableStream = null;
      } else {
        // Cast to any[] to avoid strict type issues with Uint8Array vs BlobPart in some TS versions
        const blob = new Blob(incomingChunks as any[], { type: incomingMeta.mime });
        downloadFile(blob, incomingMeta.name);
      }

      addToHistory({
        name: incomingMeta.name,
        size: receivedSize,
        type: 'received',
      });
      incomingChunks = [];
      receivedSize = 0;
      incomingMeta = null;
      showMessage('File received');
    }
  }

  acceptBtn.onclick = async () => {
    // Check for File System Access API support
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: incomingMeta.name,
        });
        writableStream = await handle.createWritable();
      } catch (e: any) {
        if (e.name === 'AbortError') {
          console.debug('[Streaming] user canceled save dialog; rejecting');
          receiveModal.close();
          manager?.send(JSON.stringify({ type: 'reject' }));
          incomingChunks = [];
          receivedSize = 0;
          return;
        }
        console.warn('File streaming failed, falling back to memory', e);
        writableStream = null;
      }
    }

    receiveModal.close();
    manager?.send(JSON.stringify({ type: 'accept' }));
    showProgress('Receiving...', { progress: 0 });
  };

  rejectBtn.onclick = () => {
    receiveModal.close();
    manager?.send(JSON.stringify({ type: 'reject' }));
    incomingChunks = [];
    receivedSize = 0;
  };

  async function sendFile(file: File) {
    if (!manager) return;
    currentSendingFile = file;
    manager.send(
      JSON.stringify({ type: 'metadata', name: file.name, size: file.size, mime: file.type })
    );
    showProgress(`Waiting for peer to accept ${file.name}...`, { progress: 0 });
  }

  async function startFileTransfer(file: File) {
    if (!manager) return;
    showProgress(`Sending ${file.name}...`, { progress: 0 });
    const CHUNK_SIZE = 16 * 1024;
    let offset = 0;

    while (offset < file.size) {
      if (manager.bufferedAmount > CHUNK_SIZE * 50) {
        await new Promise((resolve) => {
          manager!.onBufferedAmountLow = () => {
            manager!.onBufferedAmountLow = null;
            resolve(null);
          };
        });
      }
      
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await chunk.arrayBuffer();
      manager.send(buffer);
      offset += buffer.byteLength;
      
      const remainingBytes = file.size - offset;
      const progressPercent = Math.round((offset / file.size) * 100);
      showProgress(
        `Sending ${file.name}... (${Utils.formatBytes(remainingBytes)} remaining)`, 
        { progress: progressPercent }
      );
    }

    hideProgress();
    currentSendingFile = null;
    showMessage('File sent!');
    addToHistory({ name: file.name, size: file.size, type: 'sent' });
  }

  function addToHistory(item: {
    name: string;
    size: number;
    type: 'sent' | 'received';
  }) {
    noHistoryMsg.classList.add('hidden');
    const div = document.createElement('div');
    div.className =
      'flex items-center justify-between p-2 rounded bg-base-200/50 text-xs border border-base-300';

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
    sizeText.textContent = Utils.formatBytes(item.size);

    info.appendChild(icon);
    info.appendChild(nameText);
    info.appendChild(sizeText);

    const actions = document.createElement('div');
    actions.className = 'flex gap-1';

    div.appendChild(info);
    div.appendChild(actions);
    historyList.prepend(div);

    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }

  setupFileDropzone('dropzone', 'file-input', (files) => {
    if (files.length > 0) sendFile(files[0]);
  });

  return () => {
    reset();
    worker?.terminate();
    stopDiscovery();
  };
}
