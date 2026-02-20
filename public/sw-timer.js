// Timer Service Worker - Runs independently of page lifecycle
// Handles timer countdown in the background, survives navigation/refresh
//
// IMPORTANT: Service Workers can be terminated at any time by the browser.
// We use multiple strategies to ensure reliable timer completion:
// 1. Persistent state in IndexedDB (survives SW restart)
// 2. self.registration.showNotification() for completion notification
// 3. event.waitUntil() with promise chains to extend SW lifetime
// 4. Client-side SW keepalive messages every 20s
// 5. Silent audio keep-alive on mobile (client-side) to prevent suspension

const TIMER_STATE_KEY = 'sw-timer-state';

let timerState = {
  isRunning: false,
  endTime: null,
  originalTimeSet: 0,
  timeLeft: 0,
};

// We track active promise chains to extend SW lifetime
let activeCheckPromise = null;

// Skip waiting to activate new SW immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

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
    return false; // Not running
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
    return false; // Done
  } else {
    // Still running, broadcast update
    await broadcastState('timer-tick');
    return true; // Continue
  }
}

// Schedule next check using a self-extending promise chain
// This keeps the SW alive while the timer is running
function scheduleNextCheck(extendWith = null) {
  const checkAndReschedule = async () => {
    const shouldContinue = await checkTimer();
    if (shouldContinue) {
      // Schedule next check with a small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      return checkAndReschedule();
    }
  };

  // Create the promise chain
  activeCheckPromise = checkAndReschedule().catch(err => {
    console.error('[Timer SW] Check loop error:', err);
  });

  // If we have an event to extend, use waitUntil
  if (extendWith && extendWith.waitUntil) {
    extendWith.waitUntil(activeCheckPromise);
  }
}

function startTimerCheck(extendWith = null) {
  console.log('[Timer SW] Starting timer check');
  scheduleNextCheck(extendWith);
}

// No need for stopTimerCheck - the loop self-terminates when timer stops

// Handle messages from pages
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  console.log('[Timer SW] Received message:', type, data);

  // Use waitUntil to keep SW alive during message processing
  event.waitUntil((async () => {
    switch (type) {
      case 'timer-start': {
        console.log('[Timer SW] Starting timer, endTime:', data.endTime);
        timerState.isRunning = true;
        timerState.endTime = data.endTime;
        timerState.originalTimeSet = data.originalTimeSet;
        timerState.timeLeft = data.timeLeft;
        await saveTimerState();
        await broadcastState('timer-started');
        // Start the check loop - pass event so waitUntil extends lifetime
        startTimerCheck(event);
        break;
      }

      case 'timer-pause': {
        timerState.isRunning = false;
        timerState.timeLeft = data.timeLeft;
        timerState.endTime = null;
        await saveTimerState();
        // Loop will self-terminate since isRunning is false
        await broadcastState('timer-paused');
        break;
      }

      case 'timer-reset': {
        timerState.isRunning = false;
        timerState.endTime = null;
        timerState.timeLeft = 0;
        timerState.originalTimeSet = 0;
        await saveTimerState();
        // Loop will self-terminate since isRunning is false
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

      case 'timer-keepalive': {
        // Client is keeping us alive - check if timer should still be running
        await loadTimerState();
        if (timerState.isRunning && timerState.endTime) {
          const remaining = Math.round((timerState.endTime - Date.now()) / 1000);
          if (remaining <= 0) {
            // Timer finished!
            timerState.isRunning = false;
            timerState.timeLeft = 0;
            timerState.endTime = null;
            await saveTimerState();
            await broadcastState('timer-finished');
            await showTimerNotification();
          } else {
            // Restart the check loop
            startTimerCheck(event);
          }
        }
        break;
      }
    }
  })());
});

// On SW activation, restore timer state and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Claim all clients immediately so controller is available on refresh
    await self.clients.claim();

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

