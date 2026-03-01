import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { showMessage, showProgress, hideProgress, yieldToUI } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';
import type { SharedFilesPayload } from '../../js/share-target.ts';

import coreURL from '@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url';

import workerURL from '@ffmpeg/ffmpeg/worker?url';

// noinspection JSUnusedGlobalSymbols
export default function init(payload?: SharedFilesPayload) {
  const ffmpeg = new FFmpeg();
  let ffmpegLoaded = false;

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
  const resultVideo = document.getElementById('result-video') as HTMLVideoElement;
  const resultImage = document.getElementById('result-image') as HTMLImageElement;
  const resultAudio = document.getElementById('result-audio') as HTMLAudioElement;

  let selectedFile: File | null = null;
  let resultBlob: Blob | null = null;
  let hasAudio = false;

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    showProgress('Loading FFmpeg core...');
    await yieldToUI(true);

    try {
      console.log('Attempting to load FFmpeg...', { coreURL, wasmURL, workerURL });

      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
        workerURL: workerURL
      });

      ffmpegLoaded = true;
      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      showMessage('Failed to load video transcoder core. Check console for details.', {
        type: 'alert',
      });
      hideProgress();
      throw error;
    }
  };

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
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
    hideProgress();
    resultVideo.src = '';
    resultImage.src = '';
    resultAudio.src = '';
    resultVideo.classList.add('hidden');
    resultImage.classList.add('hidden');
    resultAudio.classList.add('hidden');
    if (resultBlob) {
      resultBlob = null;
    }
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
      showProgress('Preparing FFmpeg...');
      await yieldToUI(true);

      await loadFFmpeg();

      const inputName = 'input' + selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
      const format = outputFormat.value;
      const outputName = `output.${format}`;
      const preset = qualityPreset.value;

      showProgress('Writing file to memory...', { visible: true });
      await yieldToUI(true);
      await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

      showProgress('Probing file streams...');
      hasAudio = false; // reset
      await ffmpeg.exec(['-i', inputName, '-f', 'null', '-']);

      showProgress('Transcoding video...', { visible: true });

      let args = ['-i', inputName];

      if (format === 'mp4') {
        args.push(
          '-c:v',
          'libx264',
          '-preset',
          preset,
          '-crf',
          '23'
        );
        if (hasAudio) {
          args.push('-c:a', 'aac', '-b:a', '128k', '-map', '0:v?', '-map', '0:a?');
        } else {
          args.push('-an', '-map', '0:v?');
        }
        args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
      } else if (format === 'webm') {
        args.push(
          '-c:v',
          'libvpx-vp9',
          '-crf',
          '30',
          '-b:v',
          '0'
        );
        if (hasAudio) {
          args.push('-c:a', 'libopus', '-map', '0:v?', '-map', '0:a?');
        } else {
          args.push('-an', '-map', '0:v?');
        }
        args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
      } else if (format === 'gif') {
        args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-f', 'gif');
      } else if (format === 'webp') {
        args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '4', '-q:v', '50', '-loop', '0', '-an', '-f', 'webp');
      } else if (format === 'mp3') {
        if (!hasAudio) throw new Error('Source file contains no audio stream to convert.');
        args.push('-vn', '-ab', '192k', '-ar', '44100', '-f', 'mp3');
      }

      const customArgsRaw = advancedArgs.value.trim();
      if (customArgsRaw) {
        // very rudimentary argument string splitter
        const customArgs = customArgsRaw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        for (const carg of customArgs) {
          args.push(carg.replace(/^"|"$/g, ''));
        }
      }

      args.push(outputName);

      const exitCode = await ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with non-zero code: ${exitCode}`);
      }

      showProgress('Reading result file...', { visible: true });
      const data = await ffmpeg.readFile(outputName);
      let mimeType = `video/${format}`;
      if (format === 'mp3') mimeType = 'audio/mpeg';
      else if (format === 'gif') mimeType = 'image/gif';
      else if (format === 'webp') mimeType = 'image/webp';

      resultBlob = new Blob([data as any], { type: mimeType });

      if (resultBlob.size === 0) {
        throw new Error('Transcoded file is 0 bytes.');
      }

      const url = URL.createObjectURL(resultBlob);

      // Hide all result media elements first
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
    } catch (error) {
      console.error('Transcoding failed:', error);
      showMessage('Transcoding failed. See console for details.', { type: 'alert' });
      resultSection.classList.add('hidden');
    } finally {
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

  const onProgress = ({ progress }: { progress: number }) => {
    const percent = Math.round(progress * 100);
    showProgress(`Transcoding video... ${percent}%`);
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
