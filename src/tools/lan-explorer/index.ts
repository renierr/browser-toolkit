export default function init() {
  const container = document.querySelector('#lan-explorer') as HTMLElement;
  if (!container) return;

  const scanBtn = container.querySelector('#scan-btn') as HTMLButtonElement;
  const stopBtn = container.querySelector('#stop-btn') as HTMLButtonElement;
  const refreshBtn = container.querySelector('#refresh-btn') as HTMLButtonElement;
  const deviceGrid = container.querySelector('#device-grid') as HTMLElement;
  const progressContainer = container.querySelector('#scan-progress-container') as HTMLElement;
  const progressBar = container.querySelector('#scan-progress') as HTMLProgressElement;
  const progressText = container.querySelector('#scan-percentage') as HTMLElement;
  const deviceCountEl = container.querySelector('#device-count') as HTMLElement;
  const lastUpdateEl = container.querySelector('#last-update') as HTMLElement;
  const cardTemplate = container.querySelector('#device-card-template') as HTMLTemplateElement;

  let eventSource: EventSource | null = null;
  let devices: any[] = [];

  async function fetchDevices() {
    try {
      const res = await fetch('/api/network/devices');
      devices = await res.json();
      renderDevices();
    } catch (e) {
      console.error('[LANExplorer] Failed to fetch devices', e);
    }
  }

  function renderDevices() {
    if (devices.length === 0) {
      deviceGrid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-20 text-base-content/40 bg-base-200/50 rounded-xl border-2 border-dashed border-base-300">
          <i data-lucide="monitor" class="w-12 h-12 mb-4 opacity-20"></i>
          <p>No devices discovered yet. Click Scan to begin.</p>
        </div>
      `;
      if ((window as any).lucide) (window as any).lucide.createIcons({ container: deviceGrid });
      return;
    }

    deviceGrid.innerHTML = '';
    const sorted = [...devices].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));

    sorted.forEach(device => {
      const clone = cardTemplate.content.cloneNode(true) as HTMLElement;
      
      const ipEl = clone.querySelector('.device-ip') as HTMLElement;
      const hostnameEl = clone.querySelector('.device-hostname') as HTMLElement;
      const statusEl = clone.querySelector('.device-status') as HTMLElement;
      const servicesEl = clone.querySelector('.device-services') as HTMLElement;
      const macEl = clone.querySelector('.device-mac') as HTMLElement;
      const lastSeenEl = clone.querySelector('.device-last-seen') as HTMLElement;
      const iconEl = clone.querySelector('[data-lucide="monitor"]') as HTMLElement;

      ipEl.textContent = device.ip;
      hostnameEl.textContent = device.hostname || 'Unknown Hostname';
      statusEl.textContent = device.status;
      macEl.textContent = `MAC: ${device.mac || 'Unknown'}`;
      
      const lastSeenDate = new Date(device.lastSeen);
      lastSeenEl.textContent = `Seen: ${lastSeenDate.toLocaleTimeString()}`;

      if (device.services.includes('HTTP')) {
        iconEl.setAttribute('data-lucide', 'globe');
      }

      device.services.forEach((service: string) => {
        const badge = document.createElement('span');
        badge.className = 'badge badge-outline badge-xs opacity-70';
        badge.textContent = service;
        servicesEl.appendChild(badge);
      });

      deviceGrid.appendChild(clone);
    });

    if ((window as any).lucide) {
      (window as any).lucide.createIcons({
        attrs: { class: 'w-4 h-4' },
        nameAttr: 'data-lucide',
        container: deviceGrid
      });
    }

    deviceCountEl.textContent = `${devices.length} devices found`;
    lastUpdateEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }

  function setupSSE() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/api/network/events');
    
    eventSource.onmessage = (event) => {
      const { event: type, data } = JSON.parse(event.data);
      
      if (type === 'status') {
        updateUIState(data.scanning, data.progress, data.currentIp);
      } else if (type === 'device') {
        const index = devices.findIndex(d => d.ip === data.ip);
        if (index > -1) {
          devices[index] = data;
        } else {
          devices.push(data);
        }
        renderDevices();
      }
    };

    eventSource.onerror = (err) => {
      console.error('[LANExplorer] SSE Error', err);
      eventSource?.close();
    };
  }

  function updateUIState(scanning: boolean, progress: number, currentIp?: string) {
    if (scanning) {
      scanBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      progressContainer.classList.remove('hidden');
      progressBar.value = progress;
      progressText.textContent = `${progress}%`;
      
      const currentIpEl = container.querySelector('#current-scan-ip') as HTMLElement;
      if (currentIpEl) currentIpEl.textContent = currentIp || '';
    } else {
      scanBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      progressContainer.classList.add('hidden');
    }
  }

  async function startScan() {
    try {
      devices = []; // Clear current list
      renderDevices();
      await fetch('/api/network/discover', { method: 'POST' });
    } catch (e) {
      console.error('[LANExplorer] Start scan failed', e);
    }
  }

  async function stopScan() {
    try {
      await fetch('/api/network/stop', { method: 'POST' });
    } catch (e) {
      console.error('[LANExplorer] Stop scan failed', e);
    }
  }

  scanBtn.addEventListener('click', startScan);
  stopBtn.addEventListener('click', stopScan);
  refreshBtn.addEventListener('click', fetchDevices);

  setupSSE();
  fetchDevices();

  return () => {
    if (eventSource) eventSource.close();
  };
}
