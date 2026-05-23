// Background Timer Service Worker - Generic, reusable across tools
// Runs countdown independently of page lifecycle.
// - Persists state in IndexedDB (survives SW restart)
// - Shows notification on completion (wakes screen on most phones)
// - Uses waitUntil() to extend SW lifetime
// - Sends tick/finished messages to all clients

(() => {
  const DB_NAME = 'bg-timer-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'timers';

  let bgTimers = {};

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function saveTimer(timer) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(timer);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    );
  }

  function loadTimer(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function deleteTimer(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    );
  }

  function broadcastToClients(type, payload) {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type, payload }));
    });
  }

  function focusClients() {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes('index.html') || !c.url.includes('sw-')) {
          c.focus();
          break;
        }
      }
    });
  }

  function showTimerNotification(timer) {
    const mins = Math.floor(timer.duration / 60);
    const secs = timer.duration % 60;
    const body =
      mins > 0 ? `Your ${mins}m ${secs}s timer has ended.` : `Your ${secs}s timer has ended.`;

    self.registration
      .showNotification('Timer Complete', {
        body,
        icon: './favicon-192.png',
        badge: './favicon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'bg-timer-' + timer.id,
        requireInteraction: true,
        data: { timerId: timer.id },
        actions: [{ action: 'dismiss', title: 'Dismiss' }],
      })
      .catch(() => {});
  }

  function runCheckLoop(timerId, event) {
    const loop = async () => {
      const timer = await loadTimer(timerId);
      if (!timer || !timer.isRunning || !timer.endTime) return;

      const remaining = Math.max(0, timer.endTime - Date.now());

      if (remaining <= 0) {
        timer.isRunning = false;
        timer.timeLeft = 0;
        timer.endTime = 0;
        await saveTimer(timer);
        broadcastToClients('bg-timer-finished', { id: timerId });
        if (!timer.suppressNotification) {
          showTimerNotification(timer);
        }
        focusClients();
        return;
      }

      timer.timeLeft = remaining;
      await saveTimer(timer);
      broadcastToClients('bg-timer-tick', { id: timerId, remaining });

      await new Promise((r) => setTimeout(r, 1000));
      return loop();
    };

    const promise = loop().catch((err) => {
      console.error('[BG Timer SW] Loop error:', err);
    });

    if (event && event.waitUntil) {
      event.waitUntil(promise);
    }
  }

  self.addEventListener('install', () => self.skipWaiting());

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        await self.clients.claim();
        // Restore any running timers after SW restart
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const timers = req.result || [];
          timers.forEach((t) => {
            if (t.isRunning && t.endTime && t.endTime > Date.now()) {
              runCheckLoop(t.id, event);
            } else if (t.isRunning) {
              // Timer already expired while SW was dead
              t.isRunning = false;
              t.timeLeft = 0;
              t.endTime = 0;
              saveTimer(t);
              broadcastToClients('bg-timer-finished', { id: t.id });
              if (!t.suppressNotification) {
                showTimerNotification(t);
              }
              focusClients();
            }
          });
        };
      })()
    );
  });

  self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};
    if (!type || !type.startsWith('bg-timer-')) return;

    event.waitUntil(
      (async () => {
        switch (type) {
          case 'bg-timer-start': {
            const { id, duration } = payload || {};
            if (!id || !duration) return;
            const endTime = Date.now() + duration * 1000;
            const timer = {
              id,
              duration,
              isRunning: true,
              endTime,
              timeLeft: duration * 1000,
              suppressNotification: !!payload.suppressNotification,
            };
            bgTimers[id] = timer;
            await saveTimer(timer);
            broadcastToClients('bg-timer-started', { id, duration });
            runCheckLoop(id, event);
            break;
          }

          case 'bg-timer-cancel': {
            const { id } = payload || {};
            if (!id) return;
            delete bgTimers[id];
            await deleteTimer(id);
            broadcastToClients('bg-timer-cancelled', { id });
            break;
          }

          case 'bg-timer-keepalive': {
            const { id } = payload || {};
            if (!id) return;
            const timer = await loadTimer(id);
            if (!timer || !timer.isRunning) return;
            if (timer.endTime <= Date.now()) {
              timer.isRunning = false;
              timer.timeLeft = 0;
              timer.endTime = 0;
              await saveTimer(timer);
              broadcastToClients('bg-timer-finished', { id });
              if (!timer.suppressNotification) {
                showTimerNotification(timer);
              }
              focusClients();
            } else {
              runCheckLoop(id, event);
            }
            break;
          }

          case 'bg-timer-get-state': {
            const { id } = payload || {};
            if (!id) return;
            const timer = await loadTimer(id);
            if (!timer) {
              event.source.postMessage({
                type: 'bg-timer-state',
                payload: { id, isRunning: false, timeLeft: 0 },
              });
              return;
            }
            const remaining =
              timer.isRunning && timer.endTime
                ? Math.max(0, timer.endTime - Date.now())
                : timer.timeLeft;
            event.source.postMessage({
              type: 'bg-timer-state',
              payload: {
                id,
                isRunning: timer.isRunning,
                timeLeft: remaining,
                endTime: timer.endTime,
              },
            });
            break;
          }
        }
      })()
    );
  });

  self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    notification.close();

    if (event.action === 'dismiss') return;

    if (notification.data && notification.data.timerId) {
      // Clean up the completed timer
      deleteTimer(notification.data.timerId);
    }

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const c of clients) {
          if (c.url.includes('index.html') || !c.url.includes('sw-')) {
            return c.focus();
          }
        }
        return self.clients.openWindow('./');
      })
    );
  });
})();
