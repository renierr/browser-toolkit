import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { showMessage, showProgress, hideProgress, yieldToUI } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';
import { getFFmpegArgs, FFmpegLogCollector } from './video-utils.ts';

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

  let selectedFile: File | null = null;
  let resultBlob: Blob | null = null;
  let isTranscodingPhase = false;
  let hasAudio = false;

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

  const updateFileInfo = (file: File) => {
    selectedFile = file;
    fileName.innerText = file.name;
    fileSize.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    btnConvert.disabled = false;
    btnClear.disabled = false;
    resultSection.classList.add('hidden');
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

      // Conditional probe for MP3
      if (format === 'mp3') {
        showProgress('Analyzing audio streams...');
        hasAudio = false;
        isTranscodingPhase = false;
        await yieldToUI(true);
        await ffmpeg.exec(['-i', inputName, '-f', 'null', '-']);
        if (!hasAudio) {
          throw new Error('This video file contains no audio streams to convert to MP3.');
        }
      }

      showProgress('Converting...', { visible: true });
      isTranscodingPhase = true;
      await yieldToUI(true);

      const args = getFFmpegArgs(inputName, outputName, {
        format,
        preset: qualityPreset.value,
        advancedArgs: advancedArgs.value,
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
