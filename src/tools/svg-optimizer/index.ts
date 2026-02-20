import { optimize, type Config } from 'svgo';
import { downloadFile, setupFileDropzone } from '../../js/file-utils';
import { showMessage } from '../../js/ui';
import type { SharedFilesPayload } from '../../js/share-target.ts';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
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

  // Option checkboxes
  const keepXmlnsCheckbox = document.getElementById('keep-xmlns') as HTMLInputElement;
  const multipassCheckbox = document.getElementById('opt-multipass') as HTMLInputElement;
  const prettyCheckbox = document.getElementById('opt-pretty') as HTMLInputElement;
  const removeCommentsCheckbox = document.getElementById('opt-removeComments') as HTMLInputElement;
  const removeMetadataCheckbox = document.getElementById('opt-removeMetadata') as HTMLInputElement;
  const removeTitleCheckbox = document.getElementById('opt-removeTitle') as HTMLInputElement;
  const removeDescCheckbox = document.getElementById('opt-removeDesc') as HTMLInputElement;
  const removeEditorsNSDataCheckbox = document.getElementById(
    'opt-removeEditorsNSData'
  ) as HTMLInputElement;
  const removeEmptyAttrsCheckbox = document.getElementById(
    'opt-removeEmptyAttrs'
  ) as HTMLInputElement;
  const removeEmptyContainersCheckbox = document.getElementById(
    'opt-removeEmptyContainers'
  ) as HTMLInputElement;
  const removeEmptyTextCheckbox = document.getElementById(
    'opt-removeEmptyText'
  ) as HTMLInputElement;
  const removeHiddenElemsCheckbox = document.getElementById(
    'opt-removeHiddenElems'
  ) as HTMLInputElement;
  const removeUselessDefsCheckbox = document.getElementById(
    'opt-removeUselessDefs'
  ) as HTMLInputElement;
  const removeUselessStrokeAndFillCheckbox = document.getElementById(
    'opt-removeUselessStrokeAndFill'
  ) as HTMLInputElement;
  const removeDoctypeCheckbox = document.getElementById('opt-removeDoctype') as HTMLInputElement;
  const removeXMLProcInstCheckbox = document.getElementById(
    'opt-removeXMLProcInst'
  ) as HTMLInputElement;
  const cleanupIdsCheckbox = document.getElementById('opt-cleanupIds') as HTMLInputElement;
  const cleanupNumericValuesCheckbox = document.getElementById(
    'opt-cleanupNumericValues'
  ) as HTMLInputElement;
  const convertColorsCheckbox = document.getElementById('opt-convertColors') as HTMLInputElement;
  const convertPathDataCheckbox = document.getElementById(
    'opt-convertPathData'
  ) as HTMLInputElement;
  const convertShapeToPathCheckbox = document.getElementById(
    'opt-convertShapeToPath'
  ) as HTMLInputElement;
  const convertTransformCheckbox = document.getElementById(
    'opt-convertTransform'
  ) as HTMLInputElement;
  const mergePathsCheckbox = document.getElementById('opt-mergePaths') as HTMLInputElement;
  const minifyStylesCheckbox = document.getElementById('opt-minifyStyles') as HTMLInputElement;
  const inlineStylesCheckbox = document.getElementById('opt-inlineStyles') as HTMLInputElement;
  const collapseGroupsCheckbox = document.getElementById('opt-collapseGroups') as HTMLInputElement;
  const sortAttrsCheckbox = document.getElementById('opt-sortAttrs') as HTMLInputElement;
  const sortDefsChildrenCheckbox = document.getElementById(
    'opt-sortDefsChildren'
  ) as HTMLInputElement;
  const removeDimensionsCheckbox = document.getElementById(
    'opt-removeDimensions'
  ) as HTMLInputElement;
  const removeViewBoxCheckbox = document.getElementById('opt-removeViewBox') as HTMLInputElement;

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

  const buildSvgoConfig = (): Config => {
    const keepXmlns = keepXmlnsCheckbox?.checked ?? true;
    const multipass = multipassCheckbox?.checked ?? true;
    const pretty = prettyCheckbox?.checked ?? false;

    // Build overrides for preset-default plugins
    const overrides: Record<string, boolean> = {
      removeViewBox: removeViewBoxCheckbox?.checked ?? false,
      removeComments: removeCommentsCheckbox?.checked ?? true,
      removeMetadata: removeMetadataCheckbox?.checked ?? true,
      removeTitle: removeTitleCheckbox?.checked ?? true,
      removeDesc: removeDescCheckbox?.checked ?? true,
      removeEditorsNSData: removeEditorsNSDataCheckbox?.checked ?? true,
      removeEmptyAttrs: removeEmptyAttrsCheckbox?.checked ?? true,
      removeEmptyContainers: removeEmptyContainersCheckbox?.checked ?? true,
      removeEmptyText: removeEmptyTextCheckbox?.checked ?? true,
      removeHiddenElems: removeHiddenElemsCheckbox?.checked ?? true,
      removeUselessDefs: removeUselessDefsCheckbox?.checked ?? true,
      removeUselessStrokeAndFill: removeUselessStrokeAndFillCheckbox?.checked ?? true,
      removeDoctype: removeDoctypeCheckbox?.checked ?? true,
      removeXMLProcInst: removeXMLProcInstCheckbox?.checked ?? true,
      cleanupIds: cleanupIdsCheckbox?.checked ?? true,
      cleanupNumericValues: cleanupNumericValuesCheckbox?.checked ?? true,
      convertColors: convertColorsCheckbox?.checked ?? true,
      convertPathData: convertPathDataCheckbox?.checked ?? true,
      convertShapeToPath: convertShapeToPathCheckbox?.checked ?? true,
      convertTransform: convertTransformCheckbox?.checked ?? true,
      mergePaths: mergePathsCheckbox?.checked ?? true,
      minifyStyles: minifyStylesCheckbox?.checked ?? true,
      inlineStyles: inlineStylesCheckbox?.checked ?? true,
      collapseGroups: collapseGroupsCheckbox?.checked ?? true,
      sortAttrs: sortAttrsCheckbox?.checked ?? true,
      sortDefsChildren: sortDefsChildrenCheckbox?.checked ?? true,
    };

    const plugins: Config['plugins'] = [
      {
        name: 'preset-default',
        params: {
          overrides,
        },
      },
    ];

    // Add removeDimensions if checked
    if (removeDimensionsCheckbox?.checked) {
      plugins.push('removeDimensions');
    }

    // Add removeXMLNS if user doesn't want to keep xmlns
    if (!keepXmlns) {
      plugins.push('removeXMLNS');
    }

    return {
      multipass,
      plugins,
      js2svg: pretty ? { indent: 2, pretty: true } : undefined,
    };
  };

  const handleOptimize = () => {
    const input = inputText.value.trim();
    if (!input) {
      showMessage('Please enter or upload SVG content', { type: 'warning' });
      return;
    }

    // Validate that it's SVG content
    if (!input.includes('<svg') || !input.includes('</svg>')) {
      showMessage('Invalid SVG content. Make sure it contains valid SVG markup.', {
        type: 'alert',
      });
      return;
    }

    try {
      const originalSize = new TextEncoder().encode(input).length;
      const config = buildSvgoConfig();
      const result = optimize(input, config);

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

  const handleFileUpload = async (files: FileList | File[]) => {
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

  if (payload?.sharedFiles?.length) {
    const svgFiles = payload.sharedFiles.filter(
      (f) => f.type === 'image/svg+xml' || f.name?.toLowerCase().endsWith('.svg')
    );
    if (svgFiles.length > 0) {
      handleFileUpload(svgFiles);
    }
  }

  // Event Listeners
  btnOptimize.addEventListener('click', handleOptimize);
  btnCopy.addEventListener('click', handleCopy);
  btnDownload.addEventListener('click', handleDownload);
  btnClear.addEventListener('click', handleClear);
  inputText.addEventListener('input', updateStats);

  // Re-optimize when any option changes (live update)
  const optionCheckboxes = document.querySelectorAll('[data-option]');
  optionCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (inputText.value.trim()) {
        handleOptimize();
      }
    });
  });

  // Auto-optimize on paste
  inputText.addEventListener('paste', () => {
    setTimeout(handleOptimize, 0);
  });

  // Initial stats
  updateStats();
}
