let wakeLockSentinel: WakeLockSentinel | null = null;
let wakeLockCount = 0;
let wakeLockManualDisabled = false;

function updateWakeLockIndicatorState() {
  try {
    const indicator = document.getElementById('wake-lock-indicator');
    const activeIcon = document.getElementById('wake-lock-icon-active');
    const disabledIcon = document.getElementById('wake-lock-icon-disabled');
    const label = document.getElementById('wake-lock-indicator-label');

    if (!indicator) return;

    indicator.classList.toggle('bg-accent', !wakeLockManualDisabled);
    indicator.classList.toggle('text-accent-content', !wakeLockManualDisabled);
    indicator.classList.toggle('bg-warning', wakeLockManualDisabled);
    indicator.classList.toggle('text-warning-content', wakeLockManualDisabled);

    activeIcon?.classList.toggle('hidden', wakeLockManualDisabled);
    disabledIcon?.classList.toggle('hidden', !wakeLockManualDisabled);

    const indicatorTitle = wakeLockManualDisabled
      ? 'Wake lock manually disabled'
      : 'Wake lock active';
    const indicatorLabel = wakeLockManualDisabled
      ? 'Screen wake lock manually disabled'
      : 'Screen wake lock active';

    indicator.setAttribute('title', indicatorTitle);
    indicator.setAttribute('aria-label', indicatorLabel);
    indicator.setAttribute('aria-pressed', wakeLockManualDisabled ? 'false' : 'true');

    if (label) {
      label.textContent = indicatorLabel;
    }
  } catch (error) {
    console.warn('[WakeLock] Failed to update indicator:', error);
  }
}

async function setWakeLockManualDisabled(nextDisabled: boolean) {
  wakeLockManualDisabled = nextDisabled;
  updateWakeLockIndicatorState();

  if (wakeLockManualDisabled) {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
    return;
  }

  requestWakeLockInternal();
}

function handleWakeLockIndicatorClick() {
  if (wakeLockCount === 0) return;
  setWakeLockManualDisabled(!wakeLockManualDisabled).catch((error) => {
    console.error('[WakeLock] Failed toggling manual override', error);
  });
}

function showWakeLockIndicator() {
  try {
    const el = document.getElementById('wake-lock-indicator');
    if (el) {
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
      el.addEventListener('click', handleWakeLockIndicatorClick);
      updateWakeLockIndicatorState();
    }
  } catch (error) {
    console.warn('[WakeLock] Failed to show indicator:', error);
  }
}

function hideWakeLockIndicator() {
  try {
    const el = document.getElementById('wake-lock-indicator');
    if (el) {
      el.removeEventListener('click', handleWakeLockIndicatorClick);
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  } catch (error) {
    console.warn('[WakeLock] Failed to hide indicator:', error);
  }
}

async function requestWakeLockInternal() {
  if (
    !('wakeLock' in navigator) ||
    wakeLockCount === 0 ||
    wakeLockSentinel ||
    wakeLockManualDisabled
  )
    return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (wakeLockCount === 0) {
      lock.release();
      return;
    }
    wakeLockSentinel = lock;
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    console.log('[WakeLock] Acquired');
  } catch (err: any) {
    console.warn(`[WakeLock] Failed: ${err.name}, ${err.message}`);
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && wakeLockCount > 0 && !wakeLockManualDisabled) {
    requestWakeLockInternal();
  }
};

/**
 * Acquires a screen wake lock, preventing the device from sleeping.
 * Returns a function to release the wake lock.
 * Safe to call multiple times; the lock is only released when all callers have released it.
 */
export function acquireWakeLock(): () => void {
  wakeLockCount++;

  if (wakeLockCount === 1) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLockInternal();
    showWakeLockIndicator();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    wakeLockCount--;

    if (wakeLockCount === 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockManualDisabled = false;
      if (wakeLockSentinel) {
        wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
      console.log('[WakeLock] Fully released');
      hideWakeLockIndicator();
    }
  };
}
