// Timer Service Worker - Runs independently of page lifecycle
// Handles timer countdown in the background, survives navigation/refresh

const TIMER_STATE_KEY = 'sw-timer-state';

let timerState = {
  isRunning: false,
  endTime: null,
  originalTimeSet: 0,
  timeLeft: 0,
};

let checkIntervalId = null;

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
    console.error('Failed to save timer state:', e);
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
    console.error('Failed to load timer state:', e);
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
  } catch (e) {
    console.error('Failed to show notification:', e);
  }
}

// Check timer and handle completion
async function checkTimer() {
  if (!timerState.isRunning || !timerState.endTime) {
    stopTimerCheck();
    return;
  }

  const now = Date.now();
  const remaining = Math.round((timerState.endTime - now) / 1000);

  if (remaining <= 0) {
    // Timer finished!
    timerState.isRunning = false;
    timerState.timeLeft = 0;
    timerState.endTime = null;

    await saveTimerState();
    await broadcastState('timer-finished');
    await showTimerNotification();
    stopTimerCheck();
  } else {
    // Still running, broadcast update
    await broadcastState('timer-tick');
  }
}

function startTimerCheck() {
  if (checkIntervalId) return;

  // Check every second
  checkIntervalId = setInterval(() => {
    checkTimer();
  }, 1000);

  // Immediate check
  checkTimer();
}

function stopTimerCheck() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}

// Handle messages from pages
self.addEventListener('message', async (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case 'timer-start': {
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

