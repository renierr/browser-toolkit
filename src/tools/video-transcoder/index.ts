import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { showMessage, showProgress, hideProgress, yieldToUI } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';
import { getFFmpegArgs, FFmpegLogCollector, getVideoMetadata } from './video-utils.ts';

import coreURL from '@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?url';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const ffmpeg = new FFmpeg();
  let ffmpegLoaded = false;
  const logCollector = new FFmpegLogCollector();

  const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const fileInfo = document.getElementById('file-info') as HTMLDivElement;
  const fileName = document.getElementById('file-name') as HTMLParagraphElement;
  const fileSize = document.getElementById('file-size') as HTMLParagraphElement;
  const btnRemove = document.getElementById('btn-remove') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnConvert = document.getElementById('btn-convert') as HTMLButtonElement;
  const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
  const outputFormat = document.getElementById('output-format') as HTMLSelectElement;
  const qualityPreset = document.getElementById('quality-preset') as HTMLSelectElement;
  const advancedArgs = document.getElementById('advanced-args') as HTMLInputElement;
  const resultSection = document.getElementById('result-section') as HTMLDivElement;
  const errorSection = document.getElementById('error-section') as HTMLDivElement;
  const errorMessage = document.getElementById('error-message') as HTMLDivElement;
  const errorLogs = document.getElementById('error-logs') as HTMLPreElement;
  const resultVideo = document.getElementById('result-video') as HTMLVideoElement;
  const resultImage = document.getElementById('result-image') as HTMLImageElement;
  const resultAudio = document.getElementById('result-audio') as HTMLAudioElement;

  const enableCutting = document.getElementById('enable-cutting') as HTMLInputElement;
  const copyCodec = document.getElementById('copy-codec') as HTMLInputElement;
  const cuttingControls = document.getElementById('cutting-controls') as HTMLDivElement;
  const cutStartInput = document.getElementById('cut-start') as HTMLInputElement;
  const cutEndInput = document.getElementById('cut-end') as HTMLInputElement;
  const rangeStart = document.getElementById('range-start') as HTMLInputElement;
  const rangeEnd = document.getElementById('range-end') as HTMLInputElement;
  const toggleCuttingSettings = document.getElementById('toggle-cutting-settings') as HTMLInputElement;
  const cutPreview = document.getElementById('cut-preview') as HTMLVideoElement;
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  const metaDuration = document.getElementById('meta-duration') as HTMLSpanElement;
  const metaResolution = document.getElementById('meta-resolution') as HTMLSpanElement;
  const metaVCodec = document.getElementById('meta-vcodec') as HTMLSpanElement;
  const metaACodec = document.getElementById('meta-acodec') as HTMLSpanElement;
  const metaBitrate = document.getElementById('meta-bitrate') as HTMLSpanElement;
  const metaFPS = document.getElementById('meta-fps') as HTMLSpanElement;
  const metaSampleRate = document.getElementById('meta-samplerate') as HTMLSpanElement;
  const videoMetadata = document.getElementById('video-metadata') as HTMLDivElement;
  const rangeContainer = document.getElementById('range-container') as HTMLDivElement;

  let selectedFile: File | null = null;
  let resultBlob: Blob | null = null;
  let isTranscodingPhase = false;
  let hasAudio = false;
  let videoDuration = 0;
  let previewUrl: string | null = null;
  let currentMetadata: any = null;

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    showProgress('Loading FFmpeg core...');
    await yieldToUI(true);

    try {
      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
        workerURL: workerURL,
      });
      ffmpegLoaded = true;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      showMessage('Failed to load video transcoder core.', { type: 'alert' });
      hideProgress();
      throw error;
    }
  };

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
    logCollector.add(message);
    if (message.includes('Audio:')) {
      hasAudio = true;
    }
  });

  const updateFileInfo = async (file: File) => {
    selectedFile = file;
    fileName.innerText = file.name;
    fileSize.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    btnConvert.disabled = false;
    btnClear.disabled = false;
    resultSection.classList.add('hidden');

    // Reset cutting UI
    enableCutting.checked = false;
    cuttingControls.classList.add('hidden');
    cutStartInput.value = '0';
    cutEndInput.value = '0';
    rangeStart.value = '0';
    rangeEnd.value = '100';
    videoDuration = 0;

    // Setup preview
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    cutPreview.src = previewUrl;
    previewContainer.classList.remove('hidden');

    cutPreview.onloadedmetadata = () => {
      videoDuration = cutPreview.duration;
      const width = cutPreview.videoWidth;
      const height = cutPreview.videoHeight;

      // Update UI
      metaDuration.innerText = `Duration: ${videoDuration.toFixed(2)}s`;
      metaResolution.innerText = `Resolution: ${width}x${height}`;
      metaVCodec.innerText = '';
      metaACodec.innerText = '';
      metaBitrate.innerText = '';
      metaFPS.innerText = '';
      metaSampleRate.innerText = '';
      videoMetadata.classList.remove('hidden');

      cutEndInput.value = videoDuration.toFixed(2);
      cutEndInput.max = videoDuration.toString();
      cutStartInput.max = videoDuration.toString();
      rangeStart.max = videoDuration.toString();
      rangeEnd.max = videoDuration.toString();
      rangeEnd.value = videoDuration.toString();
    };
  };

  const resetUI = () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    btnConvert.disabled = true;
    btnClear.disabled = true;
    resultSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    hideProgress();
    resultVideo.src = '';
    resultImage.src = '';
    resultAudio.src = '';
    resultVideo.classList.add('hidden');
    resultImage.classList.add('hidden');
    resultAudio.classList.add('hidden');
    resultBlob = null;
    logCollector.clear();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    cutPreview.src = '';
    previewContainer.classList.add('hidden');
    videoMetadata.classList.add('hidden');
    videoDuration = 0;
    currentMetadata = null;
    hasAudio = false;
  };

  setupFileDropzone('drop-zone', 'file-input', (files) => {
    if (files.length) updateFileInfo(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    const videoFiles = payload.sharedFiles.filter(
      (f) => f.type.startsWith('video/') || f.name?.toLowerCase().match(/\.(mp4|webm|mov|avi|mkv)$/)
    );
    if (videoFiles.length > 0) {
      updateFileInfo(videoFiles[0]);
    }
  }

  const onConvertClick = async () => {
    if (!selectedFile) return;

    try {
      btnConvert.disabled = true;
      btnClear.disabled = true;
      btnRemove.disabled = true;
      logCollector.clear();
      errorSection.classList.add('hidden');

      showProgress('Preparing FFmpeg...');
      await yieldToUI(true);
      await loadFFmpeg();

      const inputExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
      const inputName = 'input' + inputExt;
      const format = outputFormat.value;
      const outputName = `output.${format}`;

      showProgress('Writing file to memory...', { visible: true });
      await yieldToUI(true);
      await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

      // Unified probe if needed (Cutting or MP3)
      if (!currentMetadata && (enableCutting.checked || format === 'mp3')) {
        showProgress('Probing video metadata...');
        currentMetadata = await getVideoMetadata(ffmpeg, inputName);
        videoDuration = currentMetadata.duration;
        hasAudio = currentMetadata.hasAudio;

        // Update UI with probed metadata
        metaDuration.innerText = `Duration: ${videoDuration.toFixed(2)}s`;
        if (currentMetadata.width && currentMetadata.height) {
          metaResolution.innerText = `Resolution: ${currentMetadata.width}x${currentMetadata.height}`;
        }
        if (currentMetadata.vcodec) metaVCodec.innerText = `Video: ${currentMetadata.vcodec}`;
        if (currentMetadata.acodec) metaACodec.innerText = `Audio: ${currentMetadata.acodec}`;
        if (currentMetadata.bitrate) metaBitrate.innerText = `Bitrate: ${currentMetadata.bitrate}`;
        if (currentMetadata.fps) metaFPS.innerText = `FPS: ${currentMetadata.fps}`;
        if (currentMetadata.sampleRate) metaSampleRate.innerText = `Sample Rate: ${currentMetadata.sampleRate}`;
        videoMetadata.classList.remove('hidden');

        cutEndInput.value = videoDuration.toFixed(2);
        cutEndInput.max = videoDuration.toString();
        cutStartInput.max = videoDuration.toString();
        rangeStart.max = videoDuration.toString();
        rangeEnd.max = videoDuration.toString();
        rangeEnd.value = videoDuration.toString();
      }

      // Check for audio if format is MP3
      if (format === 'mp3' && !hasAudio) {
        throw new Error('This video file contains no audio streams to convert to MP3.');
      }

      showProgress('Converting...', { visible: true });
      isTranscodingPhase = true;
      await yieldToUI(true);

      const args = getFFmpegArgs(inputName, outputName, {
        format,
        preset: qualityPreset.value,
        advancedArgs: advancedArgs.value,
        cutStart: enableCutting.checked ? parseFloat(cutStartInput.value) : undefined,
        cutEnd: enableCutting.checked ? parseFloat(cutEndInput.value) : undefined,
        copyCodec: enableCutting.checked && copyCodec.checked,
      });

      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg error (Exit ${exitCode})`);
      }

      showProgress('Reading result file...', { visible: true });
      await yieldToUI(true);
      const data = await ffmpeg.readFile(outputName);
      let mimeType = `video/${format}`;
      if (format === 'mp3') mimeType = 'audio/mpeg';
      else if (format === 'gif') mimeType = 'image/gif';
      else if (format === 'webp') mimeType = 'image/webp';

      resultBlob = new Blob([data as any], { type: mimeType });
      if (resultBlob.size === 0) throw new Error('Transcoded file is empty.');

      const url = URL.createObjectURL(resultBlob);
      resultVideo.classList.add('hidden');
      resultImage.classList.add('hidden');
      resultAudio.classList.add('hidden');

      if (format === 'gif' || format === 'webp') {
        resultImage.src = url;
        resultImage.classList.remove('hidden');
      } else if (format === 'mp3') {
        resultAudio.src = url;
        resultAudio.classList.remove('hidden');
      } else {
        resultVideo.src = url;
        resultVideo.classList.remove('hidden');
      }

      resultSection.classList.remove('hidden');
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (error: any) {
      console.error('Transcoding failed:', error);
      const logSummary = logCollector.getSummary();
      const errorMsg = error.message || 'Unknown error';

      errorMessage.innerText = errorMsg;
      errorLogs.innerText = logSummary;
      errorSection.classList.remove('hidden');
      resultSection.classList.add('hidden');

      showMessage('Transcoding failed: ' + (errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg), {
        type: 'alert',
        timeoutMs: 3000,
      });
    } finally {
      isTranscodingPhase = false;
      hideProgress();
      btnConvert.disabled = false;
      btnClear.disabled = false;
      btnRemove.disabled = false;
    }
  };

  const onDownloadClick = async () => {
    if (!resultBlob) return;
    await downloadFile(
      resultBlob,
      `transcoded-${selectedFile?.name.split('.')[0]}.${outputFormat.value}`,
      resultBlob.type
    );
  };

  const onProgress = ({ progress }: { progress: number }) => {
    if (!isTranscodingPhase) return;
    const percent = Math.round(progress * 100);
    showProgress(`Converting... ${percent}%`);
    yieldToUI(true);
  };

  const syncCuttingUI = (source: 'input' | 'range', event?: Event) => {
    let start = parseFloat(rangeStart.value);
    let end = parseFloat(rangeEnd.value);

    if (source === 'input') {
      start = parseFloat(cutStartInput.value) || 0;
      end = parseFloat(cutEndInput.value) || videoDuration;

      if (start < 0) start = 0;
      if (end > videoDuration && videoDuration > 0) end = videoDuration;
      if (start > end) start = end;

      rangeStart.value = start.toString();
      rangeEnd.value = end.toString();
    } else if (event) {
      const target = event.target as HTMLInputElement;
      if (target === rangeStart) {
        if (start > end) {
          start = end;
          rangeStart.value = start.toString();
        }
        // Change order based on which one is active
        rangeStart.classList.add('z-20');
        rangeStart.classList.remove('z-10');
        rangeEnd.classList.add('z-10');
        rangeEnd.classList.remove('z-20');
      } else {
        if (end < start) {
          end = start;
          rangeEnd.value = end.toString();
        }
        // Change order based on which one is active
        rangeEnd.classList.add('z-20');
        rangeEnd.classList.remove('z-10');
        rangeStart.classList.add('z-10');
        rangeStart.classList.remove('z-20');
      }

      cutStartInput.value = start.toFixed(2);
      cutEndInput.value = end.toFixed(2);
    }

    // Seek preview
    if (event?.target === rangeStart || source === 'input' && event?.target === cutStartInput) {
      cutPreview.currentTime = start;
    } else {
      cutPreview.currentTime = end;
    }
  };

  /**
   * Proximity-based z-index switching for the dual range slider.
   */
  const handleSliderProximity = (e: MouseEvent | TouchEvent) => {
    if (videoDuration === 0) return;

    const rect = rangeContainer.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const position = (x - rect.left) / rect.width;
    const currentTime = position * videoDuration;

    const startVal = parseFloat(rangeStart.value);
    const endVal = parseFloat(rangeEnd.value);

    const distStart = Math.abs(currentTime - startVal);
    const distEnd = Math.abs(currentTime - endVal);

    if (distStart < distEnd) {
      rangeStart.style.zIndex = '40';
      rangeEnd.style.zIndex = '30';
    } else {
      rangeStart.style.zIndex = '30';
      rangeEnd.style.zIndex = '40';
    }
  };

  enableCutting.addEventListener('change', () => {
    cuttingControls.classList.toggle('hidden', !enableCutting.checked);
    if (enableCutting.checked && videoDuration === 0 && selectedFile) {
      toggleCuttingSettings.checked = true;
    }
  });

  cutStartInput.addEventListener('input', (e) => syncCuttingUI('input', e));
  cutEndInput.addEventListener('input', (e) => syncCuttingUI('input', e));
  rangeStart.addEventListener('input', (e) => syncCuttingUI('range', e));
  rangeEnd.addEventListener('input', (e) => syncCuttingUI('range', e));

  rangeContainer.addEventListener('mousedown', handleSliderProximity);
  rangeContainer.addEventListener('touchstart', handleSliderProximity, { passive: true });

  btnRemove.addEventListener('click', resetUI);
  btnClear.addEventListener('click', resetUI);
  btnConvert.addEventListener('click', onConvertClick);
  btnDownload.addEventListener('click', onDownloadClick);
  ffmpeg.on('progress', onProgress);

  return () => {
    btnRemove.removeEventListener('click', resetUI);
    btnClear.removeEventListener('click', resetUI);
    btnConvert.removeEventListener('click', onConvertClick);
    btnDownload.removeEventListener('click', onDownloadClick);
    ffmpeg.off('progress', onProgress);
    ffmpeg.terminate();
  };
}
