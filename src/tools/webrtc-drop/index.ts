import { setupFileDropzone } from '../../js/file-utils.ts';
import { showMessage, showProgress, hideProgress } from '../../js/ui.ts';
import { startCamera, stopCamera } from '../../js/camera-utils.ts';
import * as Utils from './utils.ts';
import { type PeerConnectionConfig, WebRTCManager } from './webrtc-manager.ts';
import { DiscoveryManager } from './discovery-manager.ts';
import { UIManager } from './ui-manager.ts';
import { TransferManager } from './transfer-manager.ts';

// @ts-ignore - Vite worker import
import ScanWorker from '../qr-scanner/scan.worker?worker';

// noinspection JSUnusedGlobalSymbols
export default async function init() {
  const selfName = Utils.generateName();
  const ui = new UIManager();

  let manager: WebRTCManager | null = null;
  let worker: Worker | null = null;
  let stream: MediaStream | null = null;
  let discovery: DiscoveryManager | null = null;

  const transfer = new TransferManager({
    onProgress: (msg, percent) => showProgress(msg, { progress: percent }),
    onComplete: (item) => ui.addToHistory(item),
    onMessage: (msg, type) => showMessage(msg, { type }),
    onIncomingFile: (sender, filename, size) => ui.showIncomingFile(sender, filename, size),
    onHideProgress: () => hideProgress(),
    onPeerNameReceived: (name) => ui.showConnected(name),
  });

  ui.setSelfInfo(selfName);

  // --- Discovery Setup ---
  function initDiscovery() {
    if (!ui.discoveryToggle || !ui.discoveryToggle.checked) return;
    if (discovery?.isEnabled) return;

    if (!discovery) discovery = new DiscoveryManager('webrtc-drop');

    discovery.start(
      (data: any) => handleDiscoveryMessage(data),
      (status) => ui.updateDiscoveryStatus(status === 'listening' ? 'listening' : 'error')
    );
  }

  function handleDiscoveryMessage(data: any) {
    if (data.type === 'offer') {
      console.debug('[Discovery] offer received from', data.name);
      transfer.setRemotePeerName(data.name || 'Peer');
      ui.addDiscoveryPeer(
        data.name,
        () => connectToDiscoveredPeer(data),
        Utils.simpleHash(data.sdp + (data.sender || ''))
      );
      try {
        localStorage.setItem('btk-last-offer', data.sdp);
      } catch (e) {}
    } else if (data.type === 'answer' && manager && !manager.isStable) {
      console.debug('[Discovery] answer received; processing SDP');
      ui.stepTitle.textContent = `Processing remote answer from ${data.name || 'peer'}`;
      manager.processSDP(data.sdp);
    }
  }

  async function connectToDiscoveredPeer(peer: any) {
    transfer.setRemotePeerName(peer.name || 'Peer');
    ui.showHandshake(`Connecting to ${peer.name || 'peer'}...`);
    if (ui.discoveryToggle.checked) initDiscovery();

    setTimeout(async () => {
      initManager();
      await manager?.createPeer(false);
      manager?.processSDP(peer.sdp);
    }, 800);
  }

  function stopDiscovery() {
    discovery?.stop();
    ui.updateDiscoveryStatus('off');
  }

  ui.discoveryToggle.onchange = () => {
    if (ui.discoveryToggle.checked) {
      initDiscovery();
      ui.updateDiscoveryStatus('starting');
      ui.discoveryCard.classList.remove('hidden');
      ui.reOfferBtn.classList.remove('hidden');
    } else {
      stopDiscovery();
      ui.discoveryCard.classList.add('hidden');
      ui.reOfferBtn.classList.add('hidden');
    }
  };

  // --- WebRTC Setup ---
  function initManager() {
    const cfg: PeerConnectionConfig = {
      onConnected: () => {
        manager?.send(JSON.stringify({ type: 'name', name: selfName }));
        if (manager?.hasRemoteDescription && manager.iceConnectionState === 'connected') {
          ui.showConnected(transfer.remotePeerNameText);
        }
      },
      onDisconnected: () => reset(),
      onData: (data) => transfer.handleData(data),
      onSDPGenerated: (compressed, isHost) => {
        ui.showQR(compressed, isHost);
        if (isHost) localStorage.setItem('btk-host-offer', compressed);

        if (discovery?.isEnabled) {
          discovery
            .broadcast({ type: isHost ? 'offer' : 'answer', name: selfName, sdp: compressed })
            .catch((err) => console.warn('[Discovery] broadcast failed', err));
        }
      },
    };

    manager = new WebRTCManager(cfg);
    transfer.setManager(manager);
  }

  async function startScanning(title: string) {
    ui.startScanning(title);
    ui.startScanBtn.onclick = async () => {
      ui.scanOverlay.classList.add('hidden');
      stream = await startCamera({ videoEl: ui.qrVideo });
      if (!stream) {
        showMessage('Could not start camera. Use manual mode.', { type: 'warning' });
        return;
      }

      if (!worker) {
        worker = new ScanWorker();
        worker.onmessage = (e: any) => {
          if (e.data.data) {
            manager?.processSDP(e.data.data);
            stopScan();
          }
        };
      }

      let lastScanTime = 0;
      const scan = async (time: number) => {
        if (!stream) return;
        if (time - lastScanTime >= 150) {
          lastScanTime = time;
          try {
            const bitmap = await createImageBitmap(ui.qrVideo);
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
    ui.stopScanning();
  }

  function reset() {
    stopScan();
    hideProgress();
    manager?.close();
    manager = null;
    transfer.reset();
    ui.reset();
    localStorage.removeItem('btk-last-offer');
    localStorage.removeItem('btk-host-offer');
  }

  // --- UI Event Listeners ---
  ui.hostBtn.onclick = async () => {
    ui.showHandshake('Step 1: Show this QR or Copy Handshake');
    initManager();
    await manager!.createPeer(true);
    if (ui.discoveryToggle.checked) {
      initDiscovery();
      await new Promise((r) => setTimeout(r, 500));
    }
    await manager!.generateHandshake(true);
  };

  ui.joinBtn.onclick = async () => {
    ui.showHandshake("Step 1: Scan Host's Offer QR");
    initManager();
    await manager!.createPeer(false);
    await startScanning("Step 1: Scan Host's Offer QR");
    if (ui.discoveryToggle.checked) initDiscovery();
  };

  ui.reOfferBtn.addEventListener('click', async () => {
    if (!manager) initManager();
    await manager!.createPeer(true);
    if (ui.discoveryToggle.checked) {
      initDiscovery();
      await new Promise((r) => setTimeout(r, 500));
    }
    await manager!.generateHandshake(true);
  });

  ui.hostScanAnswerBtn.onclick = () => startScanning("Step 2: Scan Joiner's Answer QR");

  ui.quickConnectBtn.onclick = () => {
    const lastOffer = localStorage.getItem('btk-last-offer');
    if (lastOffer) {
      localStorage.removeItem('btk-last-offer');
      manager?.processSDP(lastOffer);
      ui.stepTitle.textContent = 'Quick Connecting...';
    }
  };

  ui.sdpActionBtn.onclick = () => manager?.processSDP(ui.sdpText.value.trim());
  ui.copySdpBtn.onclick = () => {
    navigator.clipboard.writeText(ui.sdpText.value);
    showMessage('Handshake code copied!');
  };
  ui.pasteSdpBtn.onclick = async () => {
    const text = await navigator.clipboard.readText();
    ui.sdpText.value = text.trim();
    manager?.processSDP(text.trim());
  };

  ui.cancelHandshakeBtn.onclick = reset;
  ui.disconnectBtn.onclick = reset;

  ui.acceptBtn.onclick = async () => {
    let handle = null;
    if ('showSaveFilePicker' in window) {
      try {
        handle = await (window as any).showSaveFilePicker({
          suggestedName: transfer.incomingFileName,
        });
      } catch (e: any) {
        if (e.name === 'AbortError') {
          ui.receiveModal.close();
          transfer.rejectIncoming();
          return;
        }
      }
    }
    ui.receiveModal.close();
    await transfer.acceptIncoming(handle);
  };

  ui.rejectBtn.onclick = () => {
    ui.receiveModal.close();
    transfer.rejectIncoming();
  };

  setupFileDropzone('dropzone', 'file-input', (files) => {
    if (files.length > 0) transfer.sendFile(files[0]);
  });

  return () => {
    reset();
    worker?.terminate();
    stopDiscovery();
  };
}
