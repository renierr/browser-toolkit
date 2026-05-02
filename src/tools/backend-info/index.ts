export default function init(): void | (() => void) {
  const container = document.getElementById('backend-info-tool');
  if (!container) return;

  const loadingEl = container.querySelector('#info-loading') as HTMLElement;
  const errorEl = container.querySelector('#info-error') as HTMLElement;
  const contentEl = container.querySelector('#info-content') as HTMLElement;
  const refreshBtn = container.querySelector('#refresh-btn') as HTMLButtonElement;

  const updateUI = (data: Record<string, any>) => {
    const setText = (id: string, text: string) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };

    setText('val-status', data.status ? data.status.toUpperCase() : 'UNKNOWN');
    setText('val-runtime', data.runtime || '-');
    setText('val-version', data.version ? `v${data.version}` : '');
    setText('val-time', data.time ? new Date(data.time).toLocaleTimeString() : '-');
    setText('val-os', data.os || '-');
    setText('val-arch', data.arch || '-');
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
