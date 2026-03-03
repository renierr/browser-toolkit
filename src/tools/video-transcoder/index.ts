import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { showMessage, showProgress, hideProgress, yieldToUI } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';
import { getFFmpegArgs, FFmpegLogCollector, getVideoMetadata } from './video-utils.ts';

import coreURL from '@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  let ffmpeg: FFmpeg = null!;
  let ffmpegLoaded = false;
  const logCollector = new FFmpegLogCollector();

  const onLog = ({ message }: { message: string }) => {
    console.log('[FFmpeg]', message);
    logCollector.add(message);
    if (message.includes('Audio:')) hasAudio = true;
    if (message.startsWith('ffmpeg version')) ffmpegVersion = message.split('Copyright')[0].trim();
  };

  const onProgress = ({ progress }: { progress: number }) => {
    if (!isTranscodingPhase) return;
    showProgress(`Converting... ${Math.round(progress * 100)}%`);
    yieldToUI(true);
  };


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
  const maxResolution = document.getElementById('max-resolution') as HTMLSelectElement;
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
  const cutPreview = document.getElementById('cut-preview') as HTMLVideoElement;
  const toggleCuttingSettings = document.getElementById('toggle-cutting-settings') as HTMLInputElement;
  const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
  const metaDuration = document.getElementById('meta-duration') as HTMLSpanElement;
  const metaResolution = document.getElementById('meta-resolution') as HTMLSpanElement;
  const metaVCodec = document.getElementById('meta-vcodec') as HTMLSpanElement;
  const metaACodec = document.getElementById('meta-acodec') as HTMLSpanElement;
  const metaBitrate = document.getElementById('meta-bitrate') as HTMLSpanElement;
  const metaFPS = document.getElementById('meta-fps') as HTMLSpanElement;
  const metaSampleRate = document.getElementById('meta-samplerate') as HTMLSpanElement;
  const videoMetadata = document.getElementById('video-metadata') as HTMLDivElement;
  const resultMetaSummary = document.getElementById('result-meta-summary') as HTMLDivElement;
  const resultDetails = document.getElementById('result-details') as HTMLDivElement;
  const settingsSection = document.getElementById('settings-section') as HTMLDivElement;
  const sliderBefore = document.getElementById('slider-before') as HTMLDivElement;
  const sliderAfter = document.getElementById('slider-after') as HTMLDivElement;
  const sliderContainer = document.getElementById('slider-container') as HTMLDivElement;
  const sliderSelection = document.getElementById('slider-selection') as HTMLDivElement;
  const handleStart = document.getElementById('handle-start') as HTMLDivElement;
  const handleEnd = document.getElementById('handle-end') as HTMLDivElement;

  let selectedFile: File | null = null;
  let resultBlob: Blob | null = null;
  let resultUrl: string | null = null;
  let isTranscodingPhase = false;
  let hasAudio = false;
  let ffmpegVersion = '';
  let videoDuration = 0;
  let previewUrl: string | null = null;
  let currentMetadata: any = null;
  let startVal = 0;
  let endVal = 0;
  let activeHandle: 'start' | 'end' | null = null;

  const updateSliderUI = () => {
    if (videoDuration <= 0) return;
    const startPercent = (startVal / videoDuration) * 100;
    const endPercent = (endVal / videoDuration) * 100;

    handleStart.style.left = `${startPercent}%`;
    handleEnd.style.left = `${endPercent}%`;
    sliderSelection.style.left = `${startPercent}%`;
    sliderSelection.style.width = `${endPercent - startPercent}%`;

    sliderBefore.style.left = '0';
    sliderBefore.style.width = `${startPercent}%`;
    sliderAfter.style.left = `${endPercent}%`;
    sliderAfter.style.width = `${100 - endPercent}%`;

    cutStartInput.value = startVal.toFixed(2);
    cutEndInput.value = endVal.toFixed(2);
  };

  const syncCuttingUI = (source: 'input' | 'slider', event?: PointerEvent) => {
    if (source === 'input') {
      let start = parseFloat(cutStartInput.value) || 0;
      let end = parseFloat(cutEndInput.value) || videoDuration;
      if (start < 0) start = 0;
      if (end > videoDuration && videoDuration > 0) end = videoDuration;
      if (start > end) start = end;
      startVal = start;
      endVal = end;
      updateSliderUI();
    } else if (event) {
      const rect = sliderContainer.getBoundingClientRect();
      let position = (event.clientX - rect.left) / rect.width;
      if (position < 0) position = 0;
      if (position > 1) position = 1;
      const time = position * videoDuration;
      if (activeHandle === 'start') {
        startVal = Math.min(time, endVal);
      } else if (activeHandle === 'end') {
        endVal = Math.max(time, startVal);
      }
      updateSliderUI();
    }

    if (activeHandle === 'start' || source === 'input') {
      cutPreview.currentTime = startVal;
    } else if (activeHandle === 'end') {
      cutPreview.currentTime = endVal;
    }
  };

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    await yieldToUI(true);

    try {
      showProgress('Preparing FFmpeg...');
      ffmpeg = new FFmpeg();
      ffmpeg.on('log', onLog);
      ffmpeg.on('progress', onProgress);
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegLoaded = true;
      console.log('[FFmpeg] ✓ Core loaded');
    } catch (error) {
      console.error('[FFmpeg] Failed to load core:', error);
      showMessage('Failed to load transcoder core.', { type: 'alert' });
      hideProgress();
      throw error;
    }
  };

  /** Safely delete a file from FFmpeg's virtual filesystem, ignoring errors. */
  const safeDeleteFile = async (name: string) => {
    try { await ffmpeg.deleteFile(name); } catch { /* file may not exist */ }
  };

  const updateFileInfo = async (file: File) => {
    selectedFile = file;
    fileName.innerText = file.name;
    fileSize.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    btnConvert.disabled = false;
    btnClear.disabled = false;
    resultSection.classList.add('hidden');

    enableCutting.checked = false;
    cuttingControls.classList.add('hidden');
    cutStartInput.value = '0';
    cutEndInput.value = '0';
    videoDuration = 0;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    cutPreview.src = previewUrl;
    previewContainer.classList.remove('hidden');

    cutPreview.onloadedmetadata = () => {
      videoDuration = cutPreview.duration;
      const width = cutPreview.videoWidth;
      const height = cutPreview.videoHeight;
      metaDuration.innerText = `Duration: ${videoDuration.toFixed(2)}s`;
      metaResolution.innerText = `Resolution: ${width}x${height}`;
      metaVCodec.innerText = '';
      metaACodec.innerText = '';
      metaBitrate.innerText = '';
      metaFPS.innerText = '';
      metaSampleRate.innerText = '';
      videoMetadata.classList.remove('hidden');

      startVal = 0;
      endVal = videoDuration;
      updateSliderUI();
      cutStartInput.max = videoDuration.toString();
      settingsSection.classList.remove('hidden');
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
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
    resultBlob = null;
    logCollector.clear();

    startVal = 0;
    endVal = 0;
    videoDuration = 0;
    updateSliderUI();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    cutPreview.src = '';
    previewContainer.classList.add('hidden');
    videoMetadata.classList.add('hidden');
    resultMetaSummary.innerText = '';
    resultDetails.innerHTML = '';
    settingsSection.classList.add('hidden');
    currentMetadata = null;
    hasAudio = false;
  };

  const onConvertClick = async () => {
    if (!selectedFile) return;
    let inputName = '';
    let outputName = '';
    let format = outputFormat.value;

    try {
      btnConvert.disabled = true;
      btnClear.disabled = true;
      btnRemove.disabled = true;
      logCollector.clear();
      errorSection.classList.add('hidden');

      showProgress('Preparing FFmpeg...');
      await yieldToUI(true);
      await loadFFmpeg();
      if (ffmpegVersion) showProgress(`${ffmpegVersion} ready – preparing...`);

      const inputExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
      inputName = 'input' + inputExt;
      outputName = `output.${format}`;

      // Clean up any leftover files from previous (possibly crashed) runs
      await safeDeleteFile(inputName);
      await safeDeleteFile(outputName);

      showProgress('Writing file...', { visible: true });
      await yieldToUI(true);
      let fileData: Uint8Array | null = await fetchFile(selectedFile);
      await ffmpeg.writeFile(inputName, fileData);
      // Release the JS-side copy immediately — the data is now in the WASM VFS
      fileData = null;

      if (!currentMetadata) {
        showProgress('Probing metadata...');
        currentMetadata = await getVideoMetadata(ffmpeg, inputName);
        videoDuration = currentMetadata.duration;
        hasAudio = currentMetadata.hasAudio;
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
      }

      if (format === 'mp3' && !hasAudio) {
        await safeDeleteFile(inputName);
        inputName = ''; // prevent double-delete in finally
        showMessage('This file contains no audio streams — cannot convert to MP3.', { type: 'alert' });
        return;
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
        maxResolution: parseInt(maxResolution.value, 10) || undefined,
      });

      console.log('FFmpeg Args:', args.join(' '));
      const exitCode = await ffmpeg.exec(args);

      // Free input file from VFS immediately — we no longer need it and this
      // reclaims WASM memory before we allocate for reading the output.
      await safeDeleteFile(inputName);
      inputName = ''; // prevent double-delete in finally

      if (exitCode !== 0) throw new Error(`FFmpeg error (Exit ${exitCode})`);

      showProgress('Reading result...', { visible: true });
      await yieldToUI(true);
      const data = await ffmpeg.readFile(outputName);
      let mimeType = `video/${format}`;
      if (format === 'mp3') mimeType = 'audio/mpeg';
      else if (format === 'gif') mimeType = 'image/gif';
      else if (format === 'webp') mimeType = 'image/webp';

      resultBlob = new Blob([data as any], { type: mimeType });
      if (resultBlob.size === 0) throw new Error('Result file is empty.');

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);

      resultVideo.classList.add('hidden');
      resultImage.classList.add('hidden');
      resultAudio.classList.add('hidden');

      if (format === 'gif' || format === 'webp') {
        resultImage.src = resultUrl;
        resultImage.classList.remove('hidden');
      } else {
        resultVideo.src = resultUrl;
        resultVideo.classList.remove('hidden');
        resultVideo.load();
      }

      if (currentMetadata) {
        const resStr = (currentMetadata.width && currentMetadata.height) ? `${currentMetadata.width}x${currentMetadata.height}` : 'N/A';
        resultMetaSummary.innerText = `${currentMetadata.vcodec || 'Video'} | ${resStr} | ${currentMetadata.duration.toFixed(2)}s`;
        let detailsHtml = `<div><strong>Source:</strong> ${selectedFile.name}</div><div><strong>Format:</strong> ${resStr} (${currentMetadata.vcodec || 'N/A'}) @ ${currentMetadata.fps || 'N/A'} fps</div>`;
        if (currentMetadata.acodec) detailsHtml += `<div><strong>Audio:</strong> ${currentMetadata.acodec} @ ${currentMetadata.sampleRate || 'N/A'}</div>`;
        if (currentMetadata.bitrate) detailsHtml += `<div><strong>Bitrate:</strong> ${currentMetadata.bitrate}</div>`;
        if (enableCutting.checked) detailsHtml += `<div class="text-primary font-bold"><strong>Cut:</strong> ${parseFloat(cutStartInput.value).toFixed(2)}s - ${parseFloat(cutEndInput.value).toFixed(2)}s</div>`;
        resultDetails.innerHTML = detailsHtml;
      }
      resultSection.classList.remove('hidden');
    } catch (error: any) {
      console.error('Transcoding failed:', error);
      let errorMsg = 'Unknown error';
      if (typeof error === 'string') {
        errorMsg = error;
      } else if (error instanceof Error) {
        errorMsg = error.message || error.toString();
      } else if (error && typeof error.toString === 'function') {
        errorMsg = error.toString();
      }

      // If the WASM instance crashed (memory access out of bounds, etc.),
      // the FFmpeg instance is corrupted and must be re-created on next use.
      const isCrash = errorMsg.includes('memory access out of bounds')
        || errorMsg.includes('RuntimeError')
        || errorMsg.includes('unreachable')
        || errorMsg.includes('abort');
      if (isCrash) {
        console.warn('WASM crash detected – FFmpeg instance will be re-created on next run.');
        try { ffmpeg.terminate(); } catch { /* ignore */ }
        ffmpegLoaded = false;
        errorMsg += '\n\nThe FFmpeg instance has been reset. You can try again (consider using a lower max resolution).';
      }

      // Show version in the error section
      const coreInfo = `${ffmpegVersion || 'FFmpeg (version unknown)'}${isCrash ? ' (crashed)' : ''}`;
      errorMessage.innerText = `[${coreInfo}] ${errorMsg}`;
      errorLogs.innerText = `[${coreInfo}]\n\n${logCollector.getSummary()}`;
      errorSection.classList.remove('hidden');
      resultSection.classList.add('hidden');
      const logToggle = errorSection.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (logToggle) logToggle.checked = true;
      showMessage('Transcoding failed: ' + (errorMsg.length > 60 ? errorMsg.substring(0, 60) + '...' : errorMsg), { type: 'alert' });
    } finally {
      // Only attempt VFS cleanup if FFmpeg is still alive (not crashed)
      if (ffmpegLoaded) {
        await safeDeleteFile(inputName);
        await safeDeleteFile(outputName);
      }
      isTranscodingPhase = false;
      hideProgress();
      btnConvert.disabled = false;
      btnClear.disabled = false;
      btnRemove.disabled = false;
    }
  };

  const onDownloadClick = async () => {
    if (!resultBlob) return;
    await downloadFile(resultBlob, `transcoded-${selectedFile?.name.split('.')[0]}.${outputFormat.value}`, resultBlob.type);
  };


  const onPointerDown = (e: PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    activeHandle = handle;
    handleStart.classList.toggle('active', handle === 'start');
    handleEnd.classList.toggle('active', handle === 'end');
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!activeHandle) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    activeHandle = null;
    handleStart.classList.remove('active');
    handleEnd.classList.remove('active');
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!activeHandle) return;
    syncCuttingUI('slider', e);
  };


  setupFileDropzone('drop-zone', 'file-input', (files) => {
    if (files.length) updateFileInfo(files[0]);
  });

  if (payload?.sharedFiles?.length) {
    const videoFiles = payload.sharedFiles.filter(f => f.type.startsWith('video/') || f.name?.toLowerCase().match(/\.(mp4|webm|mov|avi|mkv)$/));
    if (videoFiles.length > 0) updateFileInfo(videoFiles[0]);
  }

  enableCutting.addEventListener('change', () => {
    const isEnabled = enableCutting.checked;
    cuttingControls.classList.toggle('hidden', !isEnabled);
    if (isEnabled) {
      copyCodec.checked = true;
      if (videoDuration === 0 && selectedFile) toggleCuttingSettings.checked = true;
    }
  });

  cutStartInput.addEventListener('input', () => syncCuttingUI('input'));
  cutEndInput.addEventListener('input', () => syncCuttingUI('input'));
  handleStart.addEventListener('pointerdown', (e) => onPointerDown(e, 'start'));
  handleEnd.addEventListener('pointerdown', (e) => onPointerDown(e, 'end'));
  handleStart.addEventListener('pointermove', onPointerMove);
  handleEnd.addEventListener('pointermove', onPointerMove);
  handleStart.addEventListener('pointerup', onPointerUp);
  handleEnd.addEventListener('pointerup', onPointerUp);
  handleStart.addEventListener('pointercancel', onPointerUp);
  handleEnd.addEventListener('pointercancel', onPointerUp);

  sliderContainer.addEventListener('pointerdown', (e) => {
    if (e.target !== handleStart && e.target !== handleEnd) {
      const rect = sliderContainer.getBoundingClientRect();
      const position = (e.clientX - rect.left) / rect.width;
      const time = position * videoDuration;
      const handle = Math.abs(time - startVal) < Math.abs(time - endVal) ? 'start' : 'end';
      activeHandle = handle;
      syncCuttingUI('slider', e);
      onPointerDown(e, handle);
    }
  });

  btnRemove.addEventListener('click', resetUI);
  btnClear.addEventListener('click', resetUI);
  btnConvert.addEventListener('click', onConvertClick);
  btnDownload.addEventListener('click', onDownloadClick);

  return () => {
    btnRemove.removeEventListener('click', resetUI);
    btnClear.removeEventListener('click', resetUI);
    btnConvert.removeEventListener('click', onConvertClick);
    btnDownload.removeEventListener('click', onDownloadClick);
    try { ffmpeg.terminate(); } catch { /* ignore if already terminated */ }
  };
}
