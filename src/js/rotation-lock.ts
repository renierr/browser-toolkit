/**
 * Acquires a screen orientation lock, preventing the device from rotating.
 * Returns a function to release the lock.
 * Returns null if the Screen Orientation API is not supported.
 */
export function acquireRotationLock(): (() => void) | null {
  if (!('orientation' in screen) || !('lock' in screen.orientation)) {
    return null;
  }

  let released = false;

  const tryLock = async () => {
    try {
      // Lock to current orientation type
      await screen.orientation.lock(screen.orientation.type);
      console.log(`[RotationLock] Acquired: ${screen.orientation.type}`);
    } catch (err: any) {
      console.warn(`[RotationLock] Failed: ${err.name}, ${err.message}`);
    }
  };

  tryLock();

  return () => {
    if (released) return;
    released = true;
    try {
      screen.orientation.unlock();
      console.log('[RotationLock] Released');
    } catch (err: any) {
      console.warn(`[RotationLock] Release failed: ${err.name}, ${err.message}`);
    }
  };
}
