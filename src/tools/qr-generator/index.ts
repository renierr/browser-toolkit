import QRCode from 'qrcode';
import { showMessage } from '../../js/ui.ts';
import { CanvasExporter } from '../../js/canvas-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const contentInput = document.getElementById('qr-content') as HTMLTextAreaElement;
  const sizeInput = document.getElementById('qr-size') as HTMLInputElement;
  const marginInput = document.getElementById('qr-margin') as HTMLInputElement;
  const colorDarkInput = document.getElementById('qr-color-dark') as HTMLInputElement;
  const colorLightInput = document.getElementById('qr-color-light') as HTMLInputElement;
  const canvas = document.getElementById('qr-canvas-output') as HTMLCanvasElement;
  const outputContainer = document.getElementById('qr-output-container');
  const downloadBtn = document.getElementById('download-qr') as HTMLButtonElement;
  const copyBtn = document.getElementById('copy-qr') as HTMLButtonElement;

  const generateQR = async () => {
    const text = contentInput.value.trim();
    if (!text) {
      outputContainer?.classList.add('hidden');
      downloadBtn?.classList.add('hidden');
      copyBtn?.classList.add('hidden');
      return;
    }

    try {
      await QRCode.toCanvas(canvas, text, {
        width: parseInt(sizeInput.value) || 300,
        margin: parseInt(marginInput.value) || 4,
        color: {
          dark: colorDarkInput.value,
          light: colorLightInput.value,
        },
      });
      outputContainer?.classList.remove('hidden');
      downloadBtn?.classList.remove('hidden');
      copyBtn?.classList.remove('hidden');
    } catch (err) {
      console.error('QR Generation failed', err);
    }
  };

  const inputs = [contentInput, sizeInput, marginInput, colorDarkInput, colorLightInput];
  inputs.forEach((input) => {
    input.addEventListener('input', generateQR);
  });

  downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await CanvasExporter.copyToClipboard(canvas);
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 mr-2"></i> Copied!';
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      showMessage('Failed to copy image', { type: 'alert' });
    }
  });

  if (contentInput.value) {
    generateQR();
  }
}
