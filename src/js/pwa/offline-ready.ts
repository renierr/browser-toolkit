import { showMessage } from '../ui.ts';
import { startBackgroundPrefetch } from './prefetch.ts';

export function setupOfflineReadyNotification(): void {
  if (!('serviceWorker' in navigator)) return;

  const notifyReady = (): void => {
    showMessage('App is ready for offline use!', { type: 'info', timeoutMs: 4000 });
  };

  const monitorRegistration = (reg: ServiceWorkerRegistration): void => {
    reg.update().catch(() => {});

    const checkState = (sw: ServiceWorker): void => {
      if (sw.state === 'activated') notifyReady();
    };

    if (reg.installing) {
      reg.installing.addEventListener('statechange', (event) => {
        checkState(event.target as ServiceWorker);
      });
      return;
    }

    if (reg.waiting) {
      reg.waiting.addEventListener('statechange', (event) => {
        checkState(event.target as ServiceWorker);
      });
    }
  };

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) monitorRegistration(reg);
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    notifyReady();
  });

  // Start background caching of heavy assets on idle
  startBackgroundPrefetch();
}
