export function startLevelSensor(
  onUpdate: (xPos: number, yPos: number, isLevel: boolean) => void,
  onActive: () => void
) {
  const handleOrientation = (event: DeviceOrientationEvent) => {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta === null || gamma === null) return;

    onActive();

    let xTilt = gamma;
    let yTilt = beta;

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
