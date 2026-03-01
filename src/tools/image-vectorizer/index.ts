import ImageTracer from 'imagetracerjs';
import { showMessage } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const fileInfo = document.getElementById('file-info') as HTMLDivElement;
  const fileName = document.getElementById('file-name') as HTMLParagraphElement;
  const fileSize = document.getElementById('file-size') as HTMLParagraphElement;
  const btnRemove = document.getElementById('btn-remove') as HTMLButtonElement;
  const btnVectorize = document.getElementById('btn-vectorize') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnDownloadSvg = document.getElementById('btn-download-svg') as HTMLButtonElement;
  const btnCopySvg = document.getElementById('btn-copy-svg') as HTMLButtonElement;
  const tracingPreset = document.getElementById('tracing-preset') as HTMLSelectElement;
  const colorCount = document.getElementById('color-count') as HTMLInputElement;
  const colorCountVal = document.getElementById('color-count-val') as HTMLSpanElement;
  const resultSection = document.getElementById('result-section') as HTMLDivElement;
  const originalPreview = document.getElementById('original-preview') as HTMLImageElement;
  const svgContainer = document.getElementById('svg-container') as HTMLDivElement;

  let selectedFile: File | null = null;
  let currentSvgString: string | null = null;

  const updateFileInfo = (file: File) => {
    selectedFile = file;
    fileName.innerText = file.name;
    fileSize.innerText = `${(file.size / 1024).toFixed(2)} KB`;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    btnVectorize.disabled = false;
    resultSection.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = (e) => {
      originalPreview.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const resetUI = () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    btnVectorize.disabled = true;
    resultSection.classList.add('hidden');
    svgContainer.innerHTML = '';
    currentSvgString = null;
  };

  setupFileDropzone('drop-zone', 'file-input', (files) => {
    if (files.length) updateFileInfo(files[0]);
  });

  const onColorCountInput = () => {
    colorCountVal.innerText = colorCount.value;
  };

  const onVectorizeClick = async () => {
    if (!selectedFile) return;

    try {
      btnVectorize.disabled = true;
      btnVectorize.innerHTML =
        '<span class="loading loading-spinner loading-xs mr-2"></span> Vectorizing...';

      const options: any = {
        numberofcolors: parseInt(colorCount.value),
        viewbox: true,
      };

      switch (tracingPreset.value) {
        case 'posterized2':
          options.numberofcolors = 2;
          break;
        case 'posterized3':
          options.numberofcolors = 3;
          break;
        case 'curvy':
          options.ltres = 10;
          options.qtres = 10;
          break;
        case 'sharp':
          options.ltres = 0.1;
          options.qtres = 0.1;
          break;
        case 'detailed':
          options.ltres = 0.01;
          options.qtres = 0.01;
          options.numberofcolors = 64;
          break;
        case 'grayscale':
          options.colorsampling = 0;
          break;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          currentSvgString = ImageTracer.imagedataToSVG(imageData, options);
          svgContainer.innerHTML = currentSvgString || '';

          const svg = svgContainer.querySelector('svg');
          if (svg) {
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.classList.add('max-h-[400px]', 'object-contain');
          }

          resultSection.classList.remove('hidden');
          btnVectorize.disabled = false;
          btnVectorize.innerHTML = '<i data-lucide="zap" class="w-4 h-4 mr-2"></i> Vectorize Image';
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      console.error('Vectorization failed:', error);
      showMessage('Vectorization failed. See console for details.', { type: 'alert' });
      btnVectorize.disabled = false;
      btnVectorize.innerHTML = '<i data-lucide="zap" class="w-4 h-4 mr-2"></i> Vectorize Image';
    }
  };

  const onDownloadClick = async () => {
    if (!currentSvgString) return;
    const blob = new Blob([currentSvgString], { type: 'image/svg+xml' });
    await downloadFile(blob, `vectorized-${selectedFile?.name?.split('.')[0] || 'image'}.svg`, 'image/svg+xml');
  };

  const onCopySvgClick = () => {
    if (!currentSvgString) return;
    navigator.clipboard.writeText(currentSvgString).then(() => {
      showMessage('SVG copied to clipboard!', { type: 'info' });
    });
  };

  btnRemove.addEventListener('click', resetUI);
  btnClear.addEventListener('click', resetUI);
  colorCount.addEventListener('input', onColorCountInput);
  btnVectorize.addEventListener('click', onVectorizeClick);
  btnDownloadSvg.addEventListener('click', onDownloadClick);
  btnCopySvg.addEventListener('click', onCopySvgClick);

  return () => {
    btnRemove.removeEventListener('click', resetUI);
    btnClear.removeEventListener('click', resetUI);
    colorCount.removeEventListener('input', onColorCountInput);
    btnVectorize.removeEventListener('click', onVectorizeClick);
    btnDownloadSvg.removeEventListener('click', onDownloadClick);
    btnCopySvg.removeEventListener('click', onCopySvgClick);
  };
}
