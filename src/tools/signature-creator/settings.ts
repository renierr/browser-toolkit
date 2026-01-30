import { getDomElements } from './dom.ts';
import type { SignatureSettings } from './signature-types.ts';

const SETTINGS_KEY = 'bt-signature-settings';

export const DEFAULT_SIGNATURE_SETTINGS: SignatureSettings = {
  penColor: '#0B3D91',
  penWidth: 2,
  curveMode: 'natural',
  rdpMode: 'none',
  dpi: 96,
  widthSmoothing: 0.25,
  moveTolerance: 2,
  minWidthFactor: 0.15,
  maxWidthFactor: 2.0,
  velocitySensitivity: 0.85,
  pressureInfluence: 0.5,
  velocityInfluence: 0.9,
};

export function loadSettings(): Record<string, any> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    console.warn('Failed to load signature settings', e);
    return {};
  }
}

export function saveSettings(partial: Record<string, any>) {
  try {
    const cur = loadSettings();
    const next = Object.assign({}, cur, partial);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to save signature settings', e);
  }
}

export function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {
    console.warn('Failed to reset signature settings', e);
  }
}

export function resetToDefaults() {
  applySettings(DEFAULT_SIGNATURE_SETTINGS);
  saveSettings(DEFAULT_SIGNATURE_SETTINGS);
}

export function getEffectiveSettings(): SignatureSettings {
  const loaded = loadSettings();
  return Object.assign({}, DEFAULT_SIGNATURE_SETTINGS, loaded);
}

export function applySettings(partial: Partial<SignatureSettings>) {
  // Merge partial settings with defaults
  const settings: SignatureSettings = Object.assign({}, DEFAULT_SIGNATURE_SETTINGS, partial);

  const dom = getDomElements(document);

  // Apply values to inputs/selects
  if (dom.penColorInput) dom.penColorInput.value = String(settings.penColor);
  if (dom.penWidthInput) dom.penWidthInput.value = String(settings.penWidth);
  if (dom.curveModeSelect) dom.curveModeSelect.value = settings.curveMode;
  if (dom.rdpModeSelect) dom.rdpModeSelect.value = settings.rdpMode;
  if (dom.dpiInput) dom.dpiInput.value = String(settings.dpi);

  if (dom.moveToleranceInput) dom.moveToleranceInput.value = String(settings.moveTolerance);
  if (dom.moveToleranceValue) dom.moveToleranceValue.textContent = String(settings.moveTolerance);

  if (dom.minWidthFactorInput) dom.minWidthFactorInput.value = String(settings.minWidthFactor);
  if (dom.minWidthFactorValue)
    dom.minWidthFactorValue.textContent = String(settings.minWidthFactor);

  if (dom.maxWidthFactorInput) dom.maxWidthFactorInput.value = String(settings.maxWidthFactor);
  if (dom.maxWidthFactorValue)
    dom.maxWidthFactorValue.textContent = String(settings.maxWidthFactor);

  if (dom.velocitySensitivityInput)
    dom.velocitySensitivityInput.value = String(settings.velocitySensitivity);
  if (dom.velocitySensitivityValue)
    dom.velocitySensitivityValue.textContent = String(settings.velocitySensitivity);

  if (dom.pressureInfluenceInput)
    dom.pressureInfluenceInput.value = String(settings.pressureInfluence);
  if (dom.pressureInfluenceValue)
    dom.pressureInfluenceValue.textContent = String(settings.pressureInfluence);

  if (dom.velocityInfluenceInput)
    dom.velocityInfluenceInput.value = String(settings.velocityInfluence);
  if (dom.velocityInfluenceValue)
    dom.velocityInfluenceValue.textContent = String(settings.velocityInfluence);

  if (dom.widthSmoothingInput) dom.widthSmoothingInput.value = String(settings.widthSmoothing);
  if (dom.widthSmoothingValue)
    dom.widthSmoothingValue.textContent = String(settings.widthSmoothing);
}
