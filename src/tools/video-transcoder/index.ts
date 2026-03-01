import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { showMessage } from '../../js/ui.ts';
import { setupFileDropzone, downloadFile } from '../../js/file-utils.ts';

import coreURL from '@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url';

import workerURL from '@ffmpeg/ffmpeg/worker?url';

// noinspection JSUnusedGlobalSymbols
export default function init() {
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
  const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
  const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
  const progressPercent = document.getElementById('progress-percent') as HTMLSpanElement;
  const statusText = document.getElementById('status-text') as HTMLSpanElement;
  const resultSection = document.getElementById('result-section') as HTMLDivElement;
  const resultVideo = document.getElementById('result-video') as HTMLVideoElement;

  let selectedFile: File | null = null;
  let resultBlob: Blob | null = null;

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    statusText.innerText = 'Loading FFmpeg...';
    progressContainer.classList.remove('hidden');

    try {
      console.log('Attempting to load FFmpeg...', { coreURL, wasmURL, workerURL });

      await ffmpeg.load({
        coreURL: coreURL,
        wasmURL: wasmURL,
        workerURL: workerURL
      });

      ffmpegLoaded = true;
      console.log('FFmpeg loaded successfully');
      statusText.innerText = 'Ready';
      progressContainer.classList.add('hidden');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      statusText.innerText = 'Error loading FFmpeg';
      showMessage('Failed to load video transcoder core. Check console for details.', {
        type: 'alert',
      });
      progressContainer.classList.add('hidden');
    }
  };

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
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
    progressContainer.classList.add('hidden');
    resultVideo.src = '';
    if (resultBlob) {
      resultBlob = null;
    }
  };

  setupFileDropzone('drop-zone', 'file-input', (files) => {
    if (files.length) updateFileInfo(files[0]);
  });

  const onConvertClick = async () => {
    if (!selectedFile) return;

    try {
      btnConvert.disabled = true;
      btnClear.disabled = true;
      btnRemove.disabled = true;
      progressContainer.classList.remove('hidden');
      statusText.innerText = 'Preparing...';

      await loadFFmpeg();

      const inputName = 'input' + selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
      const format = outputFormat.value;
      const outputName = `output.${format}`;
      const preset = qualityPreset.value;

      statusText.innerText = 'Writing file to memory...';
      await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

      statusText.innerText = 'Transcoding...';

      let args = ['-i', inputName];

      if (format === 'mp4') {
        args.push(
          '-c:v',
          'libx264',
          '-preset',
          preset,
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2'
        );
      } else if (format === 'webm') {
        args.push(
          '-c:v',
          'libvpx-vp9',
          '-crf',
          '30',
          '-b:v',
          '0',
          '-c:a',
          'libopus',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2'
        );
      } else if (format === 'gif') {
        args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-f', 'gif');
      } else if (format === 'mp3') {
        args.push('-vn', '-ab', '192k', '-ar', '44100', '-f', 'mp3');
      }

      args.push(outputName);

      const exitCode = await ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with non-zero code: ${exitCode}`);
      }

      statusText.innerText = 'Reading result...';
      const data = await ffmpeg.readFile(outputName);
      resultBlob = new Blob([data as any], {
        type: format === 'mp3' ? 'audio/mpeg' : format === 'gif' ? 'image/gif' : `video/${format}`,
      });

      if (resultBlob.size === 0) {
        throw new Error('Transcoded file is 0 bytes.');
      }

      const url = URL.createObjectURL(resultBlob);
      resultVideo.src = url;
      resultSection.classList.remove('hidden');
      statusText.innerText = 'Done!';

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (error) {
      console.error('Transcoding failed:', error);
      showMessage('Transcoding failed. See console for details.', { type: 'alert' });
      resultSection.classList.add('hidden');
    } finally {
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
    progressBar.value = percent;
    progressPercent.innerText = `${percent}%`;
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
