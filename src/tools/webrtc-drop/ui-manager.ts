import * as Utils from './utils.ts';
import QRCode from 'qrcode';

export class UIManager {
  // Elements
  public readonly selfNameEl = document.getElementById('self-name')!;
  public readonly selfInitialsEl = document.getElementById('self-initials')!;
  public readonly statusBadge = document.getElementById('status-badge')!;
  public readonly setupView = document.getElementById('setup-view')!;
  public readonly handshakeView = document.getElementById('handshake-view')!;
  public readonly connectedView = document.getElementById('connected-view')!;
  public readonly hostBtn = document.getElementById('host-btn')!;
  public readonly joinBtn = document.getElementById('join-btn')!;
  public readonly cancelHandshakeBtn = document.getElementById('cancel-handshake')!;
  public readonly stepTitle = document.getElementById('handshake-step-title')!;
  public readonly qrOutputContainer = document.getElementById('qr-output-container')!;
  public readonly qrCanvasOutput = document.getElementById('qr-canvas-output') as HTMLCanvasElement;
  public readonly qrInstruction = document.getElementById('qr-instruction')!;
  public readonly hostScanAnswerBtn = document.getElementById('host-scan-answer-btn')!;
  public readonly scannerContainer = document.getElementById('scanner-container')!;
  public readonly qrVideo = document.getElementById('qr-video') as HTMLVideoElement;
  public readonly sdpText = document.getElementById('sdp-text') as HTMLTextAreaElement;
  public readonly sdpActionBtn = document.getElementById('sdp-action-btn')!;
  public readonly copySdpBtn = document.getElementById('copy-sdp-btn')!;
  public readonly pasteSdpBtn = document.getElementById('paste-sdp-btn')!;
  public readonly quickStatus = document.getElementById('quick-status')!;
  public readonly scanOverlay = document.getElementById('scan-overlay')!;
  public readonly startScanBtn = document.getElementById('start-scan-btn')!;
  public readonly quickConnectOverlay = document.getElementById('quick-connect-overlay')!;
  public readonly quickConnectBtn = document.getElementById('quick-connect-btn')!;
  public readonly remotePeerNameEl = document.getElementById('remote-peer-name')!;
  public readonly disconnectBtn = document.getElementById('disconnect-btn')!;
  public readonly historyList = document.getElementById('transfer-history-list')!;
  public readonly noHistoryMsg = document.getElementById('no-history-msg')!;
  public readonly discoveryList = document.getElementById('discovery-list')!;
  public readonly discoveryCard = this.discoveryList.closest('.card')!;
  public readonly reOfferBtn = document.getElementById('re-offer-btn')!;
  public readonly discoveryToggle = document.getElementById('discovery-toggle') as HTMLInputElement;
  public readonly discoveryStatusEl = document.getElementById('discovery-status')!;
  public readonly discoveryDotEl = document.getElementById('discovery-dot')!;

  public readonly receiveModal = document.getElementById('receive-modal') as HTMLDialogElement;
  public readonly senderNameEl = document.getElementById('sender-name')!;
  public readonly incomingFilenameEl = document.getElementById('incoming-filename')!;
  public readonly incomingSizeEl = document.getElementById('incoming-size')!;
  public readonly acceptBtn = document.getElementById('accept-btn')!;
  public readonly rejectBtn = document.getElementById('reject-btn')!;

  public readonly dropzone = document.getElementById('dropzone')!;
  public readonly fileInput = document.getElementById('file-input') as HTMLInputElement;

  setSelfInfo(name: string) {
    this.selfNameEl.textContent = name;
    this.selfInitialsEl.textContent = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2);
  }

  showSetup() {
    this.setupView.classList.remove('hidden');
    this.handshakeView.classList.add('hidden');
    this.connectedView.classList.add('hidden');
  }

  showHandshake(title: string) {
    this.setupView.classList.add('hidden');
    this.handshakeView.classList.remove('hidden');
    this.connectedView.classList.add('hidden');
    this.stepTitle.textContent = title;
  }

  showConnected(remoteName: string) {
    this.setupView.classList.add('hidden');
    this.handshakeView.classList.add('hidden');
    this.connectedView.classList.remove('hidden');
    this.remotePeerNameEl.textContent = remoteName;
    this.statusBadge.textContent = 'Connected';
    this.statusBadge.className = 'badge badge-success';
  }

  reset() {
    this.statusBadge.textContent = 'Ready';
    this.statusBadge.className = 'badge badge-outline';
    this.showSetup();
    this.qrOutputContainer.classList.add('hidden');
    this.scannerContainer.classList.add('hidden');
    this.scanOverlay.classList.remove('hidden');
    this.quickStatus.classList.add('hidden');
    this.quickConnectOverlay.classList.add('hidden');
    this.hostScanAnswerBtn.classList.add('hidden');
    this.remotePeerNameEl.textContent = '';
    this.sdpText.value = '';
    this.qrInstruction.textContent = 'Follow the steps below';
    this.qrInstruction.className =
      'text-[10px] font-bold text-primary text-center leading-tight mb-1';
  }

  showQR(text: string, isHost: boolean) {
    this.qrOutputContainer.classList.remove('hidden');
    this.scannerContainer.classList.add('hidden');
    QRCode.toCanvas(
      this.qrCanvasOutput,
      text,
      { width: 600, margin: 1, color: { dark: '#000000', light: '#ffffff' } },
      (err) => {
        if (err) console.error('QR Error:', err);
        this.qrCanvasOutput.style.width = '';
        this.qrCanvasOutput.style.height = '';
      }
    );
    this.sdpText.value = text;

    if (isHost) {
      this.hostScanAnswerBtn.classList.remove('hidden');
      this.qrInstruction.textContent =
        "STEP 1: Show this to the Joiner. THEN click 'Scan their Answer'.";
      this.qrInstruction.classList.add('text-primary');
      this.stepTitle.textContent = 'Step 1: Show this QR or Copy Handshake';
    } else {
      this.hostScanAnswerBtn.classList.add('hidden');
      this.qrInstruction.textContent =
        'STEP 2: Offer scanned! NOW show this Answer QR to the Host.';
      this.qrInstruction.classList.add('text-secondary');
      this.stepTitle.textContent = 'Step 2: Show Answer QR or Copy Handshake';
    }
  }

  startScanning(title: string) {
    this.stepTitle.textContent = title;
    this.qrOutputContainer.classList.add('hidden');
    this.scannerContainer.classList.remove('hidden');
    this.scanOverlay.classList.remove('hidden');
  }

  stopScanning() {
    this.scannerContainer.classList.add('hidden');
  }

  updateDiscoveryStatus(status: 'off' | 'starting' | 'listening' | 'error') {
    switch (status) {
      case 'off':
        this.discoveryStatusEl.textContent = 'Discovery: Off';
        this.discoveryDotEl.className = 'w-2 h-2 rounded-full bg-gray-300';
        break;
      case 'starting':
        this.discoveryStatusEl.textContent = 'Discovery: Starting...';
        this.discoveryDotEl.className = 'w-2 h-2 rounded-full bg-yellow-400';
        break;
      case 'listening':
        this.discoveryStatusEl.textContent = 'Discovery: Listening';
        this.discoveryDotEl.className = 'w-2 h-2 rounded-full bg-green-400';
        break;
      case 'error':
        this.discoveryStatusEl.textContent = 'Discovery: Error';
        this.discoveryDotEl.className = 'w-2 h-2 rounded-full bg-red-400';
        break;
    }
  }

  addDiscoveryPeer(peerName: string, onClick: () => void, peerKey: string) {
    let row = document.querySelector<HTMLDivElement>(`#discovery-peer-${peerKey}`);
    if (!row) {
      row = document.createElement('div');
      row.id = `discovery-peer-${peerKey}`;
      row.className =
        'p-2 rounded border border-base-300 flex items-center justify-between bg-base-200/50';
      const info = document.createElement('div');
      info.className = 'text-sm truncate';
      info.textContent = peerName || 'Peer';
      const actions = document.createElement('div');
      actions.className = 'flex gap-2';
      const joinBtnEl = document.createElement('button');
      joinBtnEl.className = 'btn btn-xs btn-ghost';
      joinBtnEl.textContent = 'Connect';
      joinBtnEl.onclick = onClick;
      actions.appendChild(joinBtnEl);
      row.appendChild(info);
      row.appendChild(actions);
      this.discoveryList.prepend(row);
    } else {
      const info = row.querySelector('div');
      if (info) info.textContent = peerName || 'Peer';
    }
  }

  showIncomingFile(sender: string, filename: string, size: number) {
    this.senderNameEl.textContent = sender;
    this.incomingFilenameEl.textContent = filename;
    this.incomingSizeEl.textContent = Utils.formatBytes(size);
    this.receiveModal.showModal();
  }

  addToHistory(item: { name: string; size: number; type: 'sent' | 'received' }) {
    this.noHistoryMsg.classList.add('hidden');
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
    this.historyList.prepend(div);

    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }
}
