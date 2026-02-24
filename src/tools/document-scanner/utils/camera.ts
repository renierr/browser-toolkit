/**
 * Camera utilities for the document scanner.
 * Re-exports from the shared camera-utils module.
 */
export {
  resetCameraState,
  startCamera,
  stopCamera,
  switchToNextCamera,
  getVideoDeviceCount,
  isTorchSupported,
  toggleTorch,
  getZoomCapabilities,
  setZoom,
  getFocusCapabilities,
  tapToFocus,
  capturePhoto,
  type StartCameraOptions,
  type ZoomCapabilities,
  type FocusCapabilities,
} from '../../../js/camera-utils';
