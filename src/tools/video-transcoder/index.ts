import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { showMessage } from '../../js/ui.ts';

import coreURL from '@ffmpeg/core/dist/esm/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url';

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

    await ffmpeg.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    });

    ffmpegLoaded = true;
    statusText.innerText = 'FFmpeg Loaded';
    progressContainer.classList.add('hidden');
  };

  const updateFileInfo = (file: File) => {
    selectedFile = file;
    fileName.innerText = file.name;
    fileSize.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    btnConvert.disabled = false;
    resultSection.classList.add('hidden');
  };

  const resetUI = () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    btnConvert.disabled = true;
    resultSection.classList.add('hidden');
    progressContainer.classList.add('hidden');
    progressBar.value = 0;
    progressPercent.innerText = '0%';
  };

  const onDropZoneClick = () => fileInput.click();
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.add('border-primary');
  };
  const onDragLeave = () => {
    dropZone.classList.remove('border-primary');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.remove('border-primary');
    if (e.dataTransfer?.files.length) {
      updateFileInfo(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = () => {
    if (fileInput.files?.length) {
      updateFileInfo(fileInput.files[0]);
    }
  };

  const onConvertClick = async () => {
    if (!selectedFile) return;

    try {
      btnConvert.disabled = true;
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
          '-movflags',
          'faststart'
        );
      } else if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus');
      } else if (format === 'gif') {
        args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-f', 'gif');
      } else if (format === 'mp3') {
        args.push('-vn', '-ab', '192k', '-ar', '44100', '-f', 'mp3');
      }

      args.push(outputName);

      await ffmpeg.exec(args);

      statusText.innerText = 'Reading result...';
      const data = await ffmpeg.readFile(outputName);
      resultBlob = new Blob([data as any], {
        type: format === 'mp3' ? 'audio/mpeg' : format === 'gif' ? 'image/gif' : `video/${format}`,
      });

      const url = URL.createObjectURL(resultBlob);
      resultVideo.src = url;
      resultSection.classList.remove('hidden');
      statusText.innerText = 'Done!';

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (error) {
      console.error('Transcoding failed:', error);
      showMessage('Transcoding failed. See console for details.', { type: 'alert' });
    } finally {
      btnConvert.disabled = false;
      btnRemove.disabled = false;
    }
  };

  const onDownloadClick = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcoded-${selectedFile?.name.split('.')[0]}.${outputFormat.value}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onProgress = ({ progress }: { progress: number }) => {
    const percent = Math.round(progress * 100);
    progressBar.value = percent;
    progressPercent.innerText = `${percent}%`;
  };

  dropZone.addEventListener('click', onDropZoneClick);
  dropZone.addEventListener('dragover', onDragOver);
  dropZone.addEventListener('dragleave', onDragLeave);
  dropZone.addEventListener('drop', onDrop);
  fileInput.addEventListener('change', onFileInputChange);
  btnRemove.addEventListener('click', resetUI);
  btnConvert.addEventListener('click', onConvertClick);
  btnDownload.addEventListener('click', onDownloadClick);
  ffmpeg.on('progress', onProgress);

  return () => {
    dropZone.removeEventListener('click', onDropZoneClick);
    dropZone.removeEventListener('dragover', onDragOver);
    dropZone.removeEventListener('dragleave', onDragLeave);
    dropZone.removeEventListener('drop', onDrop);
    fileInput.removeEventListener('change', onFileInputChange);
    btnRemove.removeEventListener('click', resetUI);
    btnConvert.removeEventListener('click', onConvertClick);
    btnDownload.removeEventListener('click', onDownloadClick);
    ffmpeg.off('progress', onProgress);
    ffmpeg.terminate();
  };
}
