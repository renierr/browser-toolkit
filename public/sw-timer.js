// Timer Service Worker - Runs independently of page lifecycle
// Handles timer countdown in the background, survives navigation/refresh

const TIMER_STATE_KEY = 'sw-timer-state';

let timerState = {
  isRunning: false,
  endTime: null,
  originalTimeSet: 0,
  timeLeft: 0,
};

let checkTimeoutId = null;

// Load state from IndexedDB (more reliable than localStorage in SW)
function openTimerDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('timer-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveTimerState() {
  try {
    const db = await openTimerDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(timerState, TIMER_STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[Timer SW] Failed to save timer state:', e);
  }
}

async function loadTimerState() {
  try {
    const db = await openTimerDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const req = tx.objectStore('state').get(TIMER_STATE_KEY);
      req.onsuccess = () => {
        if (req.result) {
          timerState = req.result;
        }
        resolve(timerState);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('[Timer SW] Failed to load timer state:', e);
    return timerState;
  }
}

// Broadcast state to all clients (pages)
async function broadcastState(eventType = 'timer-update') {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const remaining = timerState.endTime ? Math.max(0, Math.round((timerState.endTime - Date.now()) / 1000)) : timerState.timeLeft;

  const message = {
    type: eventType,
    state: {
      ...timerState,
      timeLeft: remaining,
    },
  };

  clients.forEach(client => client.postMessage(message));
}

// Show notification when timer finishes
async function showTimerNotification() {
  const minute = Math.floor(timerState.originalTimeSet / 60);
  const timeoutText = `Your ${minute ? minute + ' minute' : ''} countdown has ended.`;

  console.log('[Timer SW] Showing notification');

  try {
    await self.registration.showNotification('Timer Finished!', {
      body: timeoutText,
      icon: './favicon-192.png',
      badge: './favicon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'timer-finished',
      requireInteraction: true,
      actions: [
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
    console.log('[Timer SW] Notification shown successfully');
  } catch (e) {
    console.error('[Timer SW] Failed to show notification:', e);
  }
}

// Check timer and handle completion
async function checkTimer() {
  // Reload state in case SW was restarted
  await loadTimerState();

  if (!timerState.isRunning || !timerState.endTime) {
    console.log('[Timer SW] Timer not running, stopping check');
    stopTimerCheck();
    return;
  }

  const now = Date.now();
  const remaining = Math.round((timerState.endTime - now) / 1000);

  if (remaining <= 0) {
    // Timer finished!
    console.log('[Timer SW] Timer finished!');
    timerState.isRunning = false;
    timerState.timeLeft = 0;
    timerState.endTime = null;

    await saveTimerState();
    await broadcastState('timer-finished');
    await showTimerNotification();
    stopTimerCheck();
  } else {
    // Still running, broadcast update and schedule next check
    await broadcastState('timer-tick');
    scheduleNextCheck();
  }
}

// Use recursive setTimeout instead of setInterval for better reliability
function scheduleNextCheck() {
  stopTimerCheck(); // Clear any existing timeout
  checkTimeoutId = setTimeout(() => {
    checkTimer();
  }, 1000);
}

function startTimerCheck() {
  console.log('[Timer SW] Starting timer check');
  // Immediate check, then schedule
  checkTimer();
}

function stopTimerCheck() {
  if (checkTimeoutId) {
    clearTimeout(checkTimeoutId);
    checkTimeoutId = null;
  }
}

// Handle messages from pages
self.addEventListener('message', async (event) => {
  const { type, data } = event.data || {};

  console.log('[Timer SW] Received message:', type, data);

  switch (type) {
    case 'timer-start': {
      console.log('[Timer SW] Starting timer, endTime:', data.endTime);
      timerState.isRunning = true;
      timerState.endTime = data.endTime;
      timerState.originalTimeSet = data.originalTimeSet;
      timerState.timeLeft = data.timeLeft;
      await saveTimerState();
      startTimerCheck();
      await broadcastState('timer-started');
      break;
    }

    case 'timer-pause': {
      timerState.isRunning = false;
      timerState.timeLeft = data.timeLeft;
      timerState.endTime = null;
      await saveTimerState();
      stopTimerCheck();
      await broadcastState('timer-paused');
      break;
    }

    case 'timer-reset': {
      timerState.isRunning = false;
      timerState.endTime = null;
      timerState.timeLeft = 0;
      timerState.originalTimeSet = 0;
      await saveTimerState();
      stopTimerCheck();
      await broadcastState('timer-reset');
      break;
    }

    case 'timer-set': {
      timerState.timeLeft = data.timeLeft;
      timerState.isRunning = false;
      timerState.endTime = null;
      await saveTimerState();
      await broadcastState('timer-update');
      break;
    }

    case 'timer-get-state': {
      // Client requesting current state
      event.source?.postMessage({
        type: 'timer-state',
        state: {
          ...timerState,
          timeLeft: timerState.endTime
            ? Math.max(0, Math.round((timerState.endTime - Date.now()) / 1000))
            : timerState.timeLeft,
        },
      });
      break;
    }
  }
});

// On SW activation, restore timer state
self.addEventListener('activate', async (event) => {
  event.waitUntil((async () => {
    await loadTimerState();

    // If timer was running, check if it's still valid
    if (timerState.isRunning && timerState.endTime) {
      const remaining = Math.round((timerState.endTime - Date.now()) / 1000);

      if (remaining <= 0) {
        // Timer finished while SW was inactive
        timerState.isRunning = false;
        timerState.timeLeft = 0;
        timerState.endTime = null;
        await saveTimerState();
        await showTimerNotification();
        await broadcastState('timer-finished');
      } else {
        // Timer still running, resume checking
        startTimerCheck();
      }
    }
  })());
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Open/focus the timer page
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Try to find an existing timer page
      for (const client of clients) {
        if (client.url.includes('timer') || client.url.includes('index.html')) {
          return client.focus();
        }
      }
      // No existing page, open new one
      return self.clients.openWindow('./index.html#timer');
    })
  );
});

