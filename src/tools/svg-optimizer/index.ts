import { optimize } from 'svgo';
import { downloadFile, setupFileDropzone } from '../../js/file-utils';
import { showMessage } from '../../js/ui';

// noinspection JSUnusedGlobalSymbols
export default function init() {
  const inputText = document.getElementById('svg-input') as HTMLTextAreaElement;
  const outputText = document.getElementById('svg-output') as HTMLTextAreaElement;
  const btnOptimize = document.getElementById('btn-optimize') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
  const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const inputStats = document.getElementById('input-stats') as HTMLSpanElement;
  const outputStats = document.getElementById('output-stats') as HTMLSpanElement;
  const previewSection = document.getElementById('preview-section') as HTMLDivElement;
  const previewOriginal = document.getElementById('preview-original') as HTMLDivElement;
  const previewOptimized = document.getElementById('preview-optimized') as HTMLDivElement;
  const savingsInfo = document.getElementById('savings-info') as HTMLDivElement;
  const savingsText = document.getElementById('savings-text') as HTMLSpanElement;
  const keepXmlnsCheckbox = document.getElementById('keep-xmlns') as HTMLInputElement;

  let currentFileName = 'optimized.svg';

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 bytes';
    if (bytes === 1) return '1 byte';
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const updateStats = () => {
    const inputBytes = new TextEncoder().encode(inputText.value).length;
    const outputBytes = new TextEncoder().encode(outputText.value).length;
    inputStats.textContent = formatBytes(inputBytes);
    outputStats.textContent = formatBytes(outputBytes);
  };

  const updatePreview = (original: string, optimized: string) => {
    if (!original && !optimized) {
      previewSection.classList.add('hidden');
      return;
    }

    previewSection.classList.remove('hidden');

    // Render original preview
    if (original) {
      previewOriginal.innerHTML = '';
      const div = document.createElement('div');
      div.innerHTML = original;
      const svg = div.querySelector('svg');
      if (svg) {
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '200px';
        svg.style.height = 'auto';
        previewOriginal.appendChild(svg);
      }
    }

    // Render optimized preview
    if (optimized) {
      previewOptimized.innerHTML = '';
      const div = document.createElement('div');
      div.innerHTML = optimized;
      const svg = div.querySelector('svg');
      if (svg) {
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '200px';
        svg.style.height = 'auto';
        previewOptimized.appendChild(svg);
      }
    }
  };

  const showSavings = (originalSize: number, optimizedSize: number) => {
    if (originalSize === 0 || optimizedSize === 0) {
      savingsInfo.classList.add('hidden');
      return;
    }

    const saved = originalSize - optimizedSize;
    const percent = ((saved / originalSize) * 100).toFixed(1);

    if (saved > 0) {
      savingsInfo.classList.remove('hidden');
      savingsText.textContent = `Saved ${formatBytes(saved)} (${percent}% reduction)`;
    } else if (saved === 0) {
      savingsInfo.classList.remove('hidden');
      savingsText.textContent = 'SVG is already optimized!';
    } else {
      savingsInfo.classList.add('hidden');
    }
  };

  const handleOptimize = () => {
    const input = inputText.value.trim();
    if (!input) {
      showMessage('Please enter or upload SVG content', { type: 'warning' });
      return;
    }

    // Validate that it's SVG content
    if (!input.includes('<svg') || !input.includes('</svg>')) {
      showMessage('Invalid SVG content. Make sure it contains valid SVG markup.', { type: 'alert' });
      return;
    }

    try {
      const originalSize = new TextEncoder().encode(input).length;
      const keepXmlns = keepXmlnsCheckbox?.checked ?? false;

      const plugins: any[] = [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: false,
            },
          },
        },
        'removeDimensions',
      ];

      // Only add removeXMLNS plugin if user doesn't want to keep xmlns
      if (!keepXmlns) {
        plugins.push('removeXMLNS');
      }

      const result = optimize(input, {
        multipass: true,
        plugins,
      });

      outputText.value = result.data;
      const optimizedSize = new TextEncoder().encode(result.data).length;

      updateStats();
      updatePreview(input, result.data);
      showSavings(originalSize, optimizedSize);
    } catch (e: any) {
      showMessage(`Optimization failed: ${e.message}`, { type: 'alert' });
      console.error(e);
    }
  };

  const handleCopy = async () => {
    if (!outputText.value) {
      showMessage('Nothing to copy. Optimize an SVG first.', { type: 'warning' });
      return;
    }

    try {
      await navigator.clipboard.writeText(outputText.value);
      const originalText = btnCopy.innerHTML;
      btnCopy.innerHTML = '<i data-lucide="check" class="w-4 h-4 mr-2"></i>Copied!';
      btnCopy.classList.add('btn-success');
      setTimeout(() => {
        btnCopy.innerHTML = originalText;
        btnCopy.classList.remove('btn-success');
      }, 2000);
    } catch (err) {
      showMessage('Failed to copy to clipboard', { type: 'alert' });
    }
  };

  const handleDownload = async () => {
    if (!outputText.value) {
      showMessage('Nothing to download. Optimize an SVG first.', { type: 'warning' });
      return;
    }

    try {
      const blob = new Blob([outputText.value], { type: 'image/svg+xml' });
      await downloadFile(blob, currentFileName, 'image/svg+xml');
    } catch (err) {
      showMessage('Failed to download file', { type: 'alert' });
    }
  };

  const handleClear = () => {
    inputText.value = '';
    outputText.value = '';
    previewSection.classList.add('hidden');
    savingsInfo.classList.add('hidden');
    previewOriginal.innerHTML = '';
    previewOptimized.innerHTML = '';
    currentFileName = 'optimized.svg';
    updateStats();
    inputText.focus();
  };

  const handleFileUpload = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    currentFileName = file.name.replace(/\.svg$/i, '-optimized.svg');

    try {
      inputText.value = await file.text();
      updateStats();
      // Auto-optimize on file upload
      handleOptimize();
    } catch (err) {
      showMessage('Failed to read file', { type: 'alert' });
    }
  };

  // Setup file dropzone
  setupFileDropzone('dropzone', 'file-input', handleFileUpload);

  // Event Listeners
  btnOptimize.addEventListener('click', handleOptimize);
  btnCopy.addEventListener('click', handleCopy);
  btnDownload.addEventListener('click', handleDownload);
  btnClear.addEventListener('click', handleClear);
  inputText.addEventListener('input', updateStats);

  // Re-optimize when namespace option changes
  keepXmlnsCheckbox.addEventListener('change', () => {
    if (inputText.value.trim()) {
      handleOptimize();
    }
  });

  // Auto-optimize on paste
  inputText.addEventListener('paste', () => {
    setTimeout(handleOptimize, 0);
  });

  // Initial stats
  updateStats();
}

