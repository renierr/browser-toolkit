export function startLevelSensor(
  onUpdate: (xPos: number, yPos: number, isLevel: boolean) => void,
  onActive: () => void
) {
  const handleOrientation = (event: DeviceOrientationEvent) => {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta === null || gamma === null) return;

    onActive();

    // Compensate for screen orientation so the dot moves in the
    // correct visual direction regardless of how the device is held.
    // beta  = front/back tilt (-180..180), gamma = left/right tilt (-90..90)
    const angle = screen.orientation?.angle ?? (window as any).orientation ?? 0;

    let xTilt: number;
    let yTilt: number;

    switch (angle) {
      case 90: // landscape — device rotated left
        xTilt = beta;
        yTilt = -gamma;
        break;
      case -90: // landscape — device rotated right
      case 270:
        xTilt = -beta;
        yTilt = gamma;
        break;
      case 180: // upside-down portrait
        xTilt = -gamma;
        yTilt = -beta;
        break;
      default: // 0 — natural portrait
        xTilt = gamma;
        yTilt = beta;
        break;
    }

    const maxTilt = 20;
    const xPerc = Math.max(-maxTilt, Math.min(maxTilt, xTilt)) / maxTilt;
    const yPerc = Math.max(-maxTilt, Math.min(maxTilt, yTilt)) / maxTilt;

    const xPos = xPerc * 40;
    const yPos = yPerc * 40;
    const isLevel = Math.abs(xTilt) < 2 && Math.abs(yTilt) < 2;

    onUpdate(xPos, yPos, isLevel);
  };

  if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as any).requestPermission === 'function'
  ) {
    (DeviceOrientationEvent as any).requestPermission().then((response: string) => {
      if (response === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
  }

  return () => {
    window.removeEventListener('deviceorientation', handleOrientation);
  };
}
