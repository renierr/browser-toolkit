import { getDomElements } from './dom.ts';
import type { SignatureSettings } from './signature-types.ts';
import { getSettings } from '@js/settings.ts';

const settings = getSettings('signature-creator');

export const DEFAULT_SIGNATURE_SETTINGS: SignatureSettings = {
  penColor: '#0B3D91',
  penWidth: 4,
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
Object.freeze(DEFAULT_SIGNATURE_SETTINGS);

export function loadSettings(): SignatureSettings {
  try {
    const stored = settings.get<Partial<SignatureSettings>>('config');
    if (!stored) return Object.assign({}, DEFAULT_SIGNATURE_SETTINGS);
    return Object.assign({}, DEFAULT_SIGNATURE_SETTINGS, stored);
  } catch (e) {
    console.warn('Failed to load signature settings', e);
    return Object.assign({}, DEFAULT_SIGNATURE_SETTINGS);
  }
}

export function saveSettings(partial: Partial<SignatureSettings>) {
  try {
    const stored = settings.get<Partial<SignatureSettings>>('config') || {};
    const next = Object.assign({}, stored, partial);
    settings.set('config', next);
  } catch (e) {
    console.warn('Failed to save signature settings', e);
  }
}

export function resetSettings() {
  try {
    settings.set('config', null);
  } catch (e) {
    console.warn('Failed to reset signature settings', e);
  }
}

export function resetToDefaults() {
  applySettings(DEFAULT_SIGNATURE_SETTINGS);
  saveSettings(DEFAULT_SIGNATURE_SETTINGS);
}

export function applySettings(partial: Partial<SignatureSettings>) {
  // Merge partial settings with defaults
  const settings: SignatureSettings = Object.assign({}, DEFAULT_SIGNATURE_SETTINGS, partial);

  const dom = getDomElements(document);

  // Apply values to inputs/selects
  if (dom.penColorInput) dom.penColorInput.value = String(settings.penColor);
  if (dom.penWidthInput) dom.penWidthInput.value = String(settings.penWidth);
  if (dom.penWidthValue) dom.penWidthValue.textContent = dom.penWidthInput.value;

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
