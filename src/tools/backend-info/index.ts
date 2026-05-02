export default function init(): void | (() => void) {
  const container = document.getElementById('backend-info-tool');
  if (!container) return;

  const loadingEl = container.querySelector('#info-loading') as HTMLElement;
  const errorEl = container.querySelector('#info-error') as HTMLElement;
  const contentEl = container.querySelector('#info-content') as HTMLElement;
  const refreshBtn = container.querySelector('#refresh-btn') as HTMLButtonElement;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
  };

  const updateUI = (data: Record<string, any>) => {
    const setText = (id: string, text: string) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };

    const setProgress = (id: string, value: number) => {
      const el = container.querySelector(`#${id}`) as HTMLProgressElement;
      if (el) el.value = value;
    };

    setText('val-status', data.status ? data.status.toUpperCase() : 'UNKNOWN');
    setText('val-hostname', data.hostname || 'unknown-host');
    setText('val-uptime', data.uptime !== undefined ? formatUptime(data.uptime) : '-');
    setText('val-runtime-uptime', data.runtimeUptime !== undefined ? formatUptime(data.runtimeUptime) : '-');
    setText('val-runtime', data.runtime || '-');
    setText('val-version', data.version ? `v${data.version}` : '');
    setText('val-os', data.os || '-');
    setText('val-arch', data.arch || '-');
    setText('val-time', data.time ? new Date(data.time).toLocaleTimeString() : '-');

    if (data.memory) {
      setText('val-mem-text', `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`);
      setText('val-mem-percent', `${data.memory.percent}%`);
      setProgress('val-mem-progress', data.memory.percent);
    }

    if (data.disk) {
      setText('val-disk-text', `${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)}`);
      setText('val-disk-percent', `${data.disk.percent}%`);
      setProgress('val-disk-progress', data.disk.percent);
    }

    if (data.load) {
      setText('val-load', data.load.map((l: number) => l.toFixed(2)).join(' / '));
    }
  };

  const fetchInfo = async () => {
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const res = await fetch('/api/info');
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      updateUI(data);
      contentEl.classList.remove('hidden');
    } catch (err) {
      console.error('[BackendInfo] Failed to fetch info:', err);
      errorEl.classList.remove('hidden');
    } finally {
      loadingEl.classList.add('hidden');
      if (refreshBtn) refreshBtn.disabled = false;
    }
  };

  const onRefresh = () => {
    fetchInfo();
  };

  if (refreshBtn) {
    refreshBtn.addEventListener('click', onRefresh);
  }

  // Initial fetch
  fetchInfo();

  return () => {
    if (refreshBtn) {
      refreshBtn.removeEventListener('click', onRefresh);
    }
  };
}
