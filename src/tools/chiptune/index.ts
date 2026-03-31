import { ChiptunePlayer } from '../../js/chiptune/player';
import { parseModule } from '../../js/chiptune/parser';
import type { ModuleFile } from '../../js/chiptune/types';
import { getAllModules, saveModule, deleteModule } from '../../js/chiptune/archive';
import { showMessage } from '../../js/ui';

// good mod file for testing: https://api.modarchive.org/downloads.php?moduleid=86357#ba1.mod

function updateModuleInfo(mod: ModuleFile, elements: Record<string, HTMLElement | null>): void {
  const formatBadge = elements['format-badge'];
  const songTitle = elements['song-title'];
  const channelCount = elements['channel-count'];
  const patternCount = elements['pattern-count'];
  const orderCount = elements['order-count'];
  const instrumentCount = elements['instrument-count'];
  const defaultBpm = elements['default-bpm'];
  const fileInfo = elements['file-info'];
  const samplesContainer = elements['samples-container'];
  const speedSlider = elements['speed-slider'] as HTMLInputElement | null;
  const speedDisplay = elements['speed-display'];

  if (formatBadge) formatBadge.textContent = mod.type;
  if (songTitle) songTitle.textContent = mod.title || 'Untitled';
  if (channelCount) channelCount.textContent = String(mod.channels);
  if (patternCount) patternCount.textContent = String(mod.patterns.length);
  if (orderCount) orderCount.textContent = String(mod.sequence.length);
  if (instrumentCount)
    instrumentCount.textContent = String(
      mod.instruments.filter((i) => i.samples.length > 0).length
    );
  if (defaultBpm) defaultBpm.textContent = String(mod.defaultBpm);
  if (fileInfo) fileInfo.classList.remove('hidden');
  if (speedSlider) speedSlider.value = String(mod.defaultSpeed);
  if (speedDisplay) speedDisplay.textContent = String(mod.defaultSpeed);

  if (samplesContainer) {
    samplesContainer.innerHTML =
      mod.instruments
        .filter((i) => i.samples.length > 0)
        .map(
          (ins, i) => `
      <div class="sample-row">
        <span class="font-semibold w-6">${i + 1}</span>
        <span class="name">${ins.name}</span>
        <span class="info">${Math.round(ins.samples[0].length / 1024)}KB${ins.samples[0].loopLength > 0 ? ` L:${Math.round(ins.samples[0].loopStart / 1024)}K` : ''}</span>
      </div>
    `
        )
        .join('') || '<span class="text-xs opacity-50">No instruments</span>';
  }
}

function updateChannelActivity(
  elements: Record<string, HTMLElement | null>,
  numChannels: number
): void {
  const channelActivity = elements['channel-activity'];
  if (channelActivity) {
    channelActivity.innerHTML = Array(numChannels)
      .fill(0)
      .map(
        (_, i) => `
      <div class="channel-led" data-channel="${i}" title="Channel ${i + 1}"></div>
    `
      )
      .join('');
  }
}

function enableControls(elements: Record<string, HTMLElement | null>): void {
  const btnPlay = elements['btn-play'] as HTMLButtonElement | null;
  const btnStop = elements['btn-stop'] as HTMLButtonElement | null;
  if (btnPlay) {
    btnPlay.disabled = false;
    btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
  }
  if (btnStop) btnStop.disabled = false;
}

function getElements(): Record<string, HTMLElement | null> {
  return {
    dropzone: document.getElementById('dropzone'),
    'file-input': document.getElementById('file-input'),
    'btn-play': document.getElementById('btn-play'),
    'btn-stop': document.getElementById('btn-stop'),
    'loop-toggle': document.getElementById('loop-toggle'),
    'worklet-toggle': document.getElementById('worklet-toggle'),
    'volume-slider': document.getElementById('volume-slider'),
    'volume-display': document.getElementById('volume-display'),
    'speed-slider': document.getElementById('speed-slider'),
    'speed-display': document.getElementById('speed-display'),
    'position-display': document.getElementById('position-display'),
    'seek-slider': document.getElementById('seek-slider'),
    'time-display': document.getElementById('time-display'),
    'format-badge': document.getElementById('format-badge'),
    'song-title': document.getElementById('song-title'),
    'channel-count': document.getElementById('channel-count'),
    'pattern-count': document.getElementById('pattern-count'),
    'order-count': document.getElementById('order-count'),
    'instrument-count': document.getElementById('instrument-count'),
    'default-bpm': document.getElementById('default-bpm'),
    'file-info': document.getElementById('file-info'),
    'channel-activity': document.getElementById('channel-activity'),
    'toggle-samples': document.getElementById('toggle-samples'),
    'sample-list': document.getElementById('sample-list'),
    'samples-container': document.getElementById('samples-container'),
    'samples-chevron': document.getElementById('samples-chevron'),
    'btn-clear': document.getElementById('btn-clear'),
    'btn-archive': document.getElementById('btn-archive'),
    'archive-count': document.getElementById('archive-count'),
    'archive-list': document.getElementById('archive-list'),
  };
}

import type { SharedFilesPayload } from '../../js/share-target';
import { setupFileDropzone } from '../../js/file-utils';

export default function init(payload?: SharedFilesPayload): () => void {
  let player: ChiptunePlayer | null = null;
  let animationId: number | null = null;
  let shouldVisualize = false;
  let currentFile: File | null = null;
  let currentFormat: string = '';

  const container = document.getElementById('chiptune-player');
  if (!container) return () => {};

  const elements = getElements();
  player = new ChiptunePlayer();

  let workletInitialized = false;

  function setupPlayerCallbacks(p: ChiptunePlayer, els: any) {
    p.onPositionChange = (pattern: number, row: number) => {
      const positionDisplay = els['position-display'];
      const seekSlider = els['seek-slider'];
      if (positionDisplay)
        positionDisplay.textContent = `Pat: ${String(pattern).padStart(2, '0')} Row: ${String(row).padStart(2, '0')}`;
      if (seekSlider) {
        const totalRows = p.getTotalRows();
        const currentRow = pattern * (p.getModule()?.rowsPerPattern || 64) + row;
        seekSlider.value = String(Math.round((currentRow / totalRows) * 100));
      }
    };

    p.onChannelActivity = (activeChannels: boolean[]) => {
      const channelActivity = els['channel-activity'];
      if (!channelActivity) return;
      const leds = channelActivity.querySelectorAll('.channel-led');
      leds.forEach((led: Element, i: number) => {
        led.classList.toggle('active', activeChannels[i]);
      });
    };
  }

  setupPlayerCallbacks(player, elements);

  const dropzone = elements['dropzone'] as HTMLElement;
  const btnPlay = elements['btn-play'] as HTMLButtonElement | null;
  const btnStop = elements['btn-stop'] as HTMLButtonElement | null;
  const loopToggle = elements['loop-toggle'] as HTMLInputElement | null;
  const workletToggle = elements['worklet-toggle'] as HTMLInputElement | null;
  const volumeSlider = elements['volume-slider'] as HTMLInputElement | null;
  const volumeDisplay = elements['volume-display'];
  const speedSlider = elements['speed-slider'] as HTMLInputElement | null;
  const speedDisplay = elements['speed-display'];
  const positionDisplay = elements['position-display'];
  const seekSlider = elements['seek-slider'] as HTMLInputElement | null;
  const timeDisplay = elements['time-display'];
  const channelActivity = elements['channel-activity'];
  const toggleSamples = elements['toggle-samples'];
  const sampleList = elements['sample-list'];
  const samplesChevron = elements['samples-chevron'];
  const btnClear = elements['btn-clear'] as HTMLButtonElement | null;
  const btnArchive = elements['btn-archive'] as HTMLButtonElement | null;
  const archiveCount = elements['archive-count'];
  const archiveList = elements['archive-list'];

  const visualizerCanvas = document.getElementById('visualizer') as HTMLCanvasElement;
  const visualizerCtx = visualizerCanvas.getContext('2d');

  const onFile = async (fileList: FileList): Promise<void> => {
    if (fileList.length === 0) return;
    const file = fileList[0];
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const mod = parseModule(data);
    player!.stop();
    player!.loadModule(mod);
    currentFile = file;
    currentFormat = mod.type;
    updateModuleInfo(mod, elements);
    updateChannelActivity(elements, mod.channels);
    enableControls(elements);
    player!.setSpeed(mod.defaultSpeed);
    dropzone?.classList.add('hidden');
  };

  if (payload && payload.sharedFiles && payload.sharedFiles.length > 0) {
    setTimeout(() => {
      const fileList = new DataTransfer();
      fileList.items.add(payload.sharedFiles[0]);
      onFile(fileList.files);
    }, 100);
  }

  setupFileDropzone('dropzone', 'file-input', onFile);

  async function loadArchiveList(): Promise<void> {
    if (!archiveCount || !archiveList) return;
    const modules = await getAllModules();
    archiveCount.textContent = String(modules.length);
    if (modules.length === 0) {
      archiveList.innerHTML = '<span class="text-xs opacity-50">No archived modules</span>';
      return;
    }
    archiveList.innerHTML = modules
      .map(
        (m) => `
      <div class="flex items-center gap-2 p-2 bg-base-300 rounded-lg cursor-pointer hover:bg-base-100 transition-colors archive-item" data-id="${m.id}">
        <span class="badge badge-xs badge-primary">${m.format}</span>
        <span class="flex-1 text-xs truncate">${m.title || m.fileName}</span>
        <span class="text-xs opacity-50">${new Date(m.archivedAt).toLocaleDateString()}</span>
        <button class="btn btn-xs btn-ghost btn-square archive-delete" data-id="${m.id}">
          <i data-lucide="trash-2" class="w-3 h-3"></i>
        </button>
      </div>
    `
      )
      .join('');
  }

  btnArchive?.addEventListener('click', async () => {
    if (!currentFile || !currentFormat) return;
    const titleEl = elements['song-title'];
    const title = titleEl?.textContent || currentFile.name;
    const channelsEl = elements['channel-count'];
    const channels = channelsEl ? parseInt(channelsEl.textContent || '4') : 4;
    const result = await saveModule(currentFile, currentFormat, title, channels);
    if (result.success) {
      showMessage('Module archived!', { type: 'info', timeoutMs: 3000 });
      loadArchiveList();
    } else if (result.exists) {
      showMessage('Already in archive', { type: 'warning', timeoutMs: 3000 });
    } else {
      showMessage('Failed to archive', { type: 'alert', timeoutMs: 5000 });
    }
  });

  archiveList?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('.archive-delete');
    if (deleteBtn) {
      const id = (deleteBtn as HTMLElement).dataset.id;
      if (id && confirm('Delete this archived module?')) {
        await deleteModule(id);
        loadArchiveList();
      }
      return;
    }
    const item = target.closest('.archive-item');
    if (item) {
      const id = (item as HTMLElement).dataset.id;
      if (!id) return;
      const modules = await getAllModules();
      const module = modules.find((m) => m.id === id);
      if (module) {
        const file = new File([module.fileData], module.fileName);
        setTimeout(() => {
          const fileList = new DataTransfer();
          fileList.items.add(file);
          onFile(fileList.files);
          setTimeout(() => btnPlay?.click(), 500);
        }, 100);
      }
    }
  });

  loadArchiveList();

  btnPlay?.addEventListener('click', async () => {
    if (!player) return;

    if (!workletInitialized) {
      const success = await player.initWorklet();
      if (success) {
        workletInitialized = true;
      } else {
        console.log('[Chiptune] Using buffer-based playback');
      }
    }

    if (player.getIsPlaying()) {
      player.pause();
      btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
      shouldVisualize = false;
    } else {
      await player.play();
      btnPlay.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
      // Sync toggle with current player state
      if (workletToggle) workletToggle.checked = player.getIsPlaying() && player.getIsWorkletEnabled();
      shouldVisualize = true;
      drawVisualization();
    }
  });

  btnStop?.addEventListener('click', () => {
    if (!player) return;
    player.stop();
    if (btnPlay) btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
    shouldVisualize = false;
  });

  btnClear?.addEventListener('click', () => {
    if (player) {
      player.stop();
    }
    if (workletToggle) workletToggle.checked = false;
    elements['file-info']?.classList.add('hidden');
    dropzone?.classList.remove('hidden');
    if (btnPlay) btnPlay.disabled = true;
    if (btnStop) btnStop.disabled = true;
    if (seekSlider) seekSlider.value = '0';
    if (positionDisplay) positionDisplay.textContent = 'Pat: -- Row: --';
    if (timeDisplay) timeDisplay.textContent = '00:00 / --';
    if (elements['channel-activity']) {
      elements['channel-activity'].innerHTML =
        '<span class="text-xs opacity-50 italic">No file loaded</span>';
    }
  });

  loopToggle?.addEventListener('change', () => {
    if (!player) return;
    player.setLooping(loopToggle.checked);
  });
  
  workletToggle?.addEventListener('change', async () => {
    if (!player) return;
    const success = await player.setUseWorklet(workletToggle.checked);
    if (!success && workletToggle.checked) {
      workletToggle.checked = false;
      showMessage('Failed to initialize AudioWorklet. Using standard playback.', { type: 'warning' });
    }
  });

  volumeSlider?.addEventListener('input', () => {
    if (!player) return;
    const vol = parseInt(volumeSlider.value) / 100;
    player.setVolume(vol);
    if (volumeDisplay) volumeDisplay.textContent = `${volumeSlider.value}%`;
  });

  speedSlider?.addEventListener('input', () => {
    if (!player) return;
    const spd = parseInt(speedSlider.value);
    player.setSpeed(spd);
    if (speedDisplay) speedDisplay.textContent = String(spd);
  });

  player.onPositionChange = (pattern: number, row: number) => {
    if (positionDisplay)
      positionDisplay.textContent = `Pat: ${String(pattern).padStart(2, '0')} Row: ${String(row).padStart(2, '0')}`;
    if (player && seekSlider) {
      const totalRows = player.getTotalRows();
      const currentRow = pattern * (player.getModule()?.rowsPerPattern || 64) + row;
      seekSlider.value = String(Math.round((currentRow / totalRows) * 100));
    }
    if (player && timeDisplay) {
      const currentTime = player.getCurrentTime();
      const totalTime = player.getDuration();
      const formatTime = (t: number) => {
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(totalTime)}`;
    }
  };

  player.onChannelActivity = (activeChannels: boolean[]) => {
    if (!channelActivity) return;
    const leds = channelActivity.querySelectorAll('.channel-led');
    leds.forEach((led, i) => {
      led.classList.toggle('active', activeChannels[i]);
    });
  };

  toggleSamples?.addEventListener('click', () => {
    sampleList?.classList.toggle('hidden');
    samplesChevron?.classList.toggle('rotate-180');
  });

  seekSlider?.addEventListener('input', () => {
    if (!player || !player.seek) return;
    const totalRows = player.getTotalRows();
    const targetRow = Math.floor((parseInt(seekSlider.value) / 100) * totalRows);
    const rowsPerPattern = player.getModule()?.rowsPerPattern || 64;
    const targetPattern = Math.floor(targetRow / rowsPerPattern);
    const targetRowInPattern = targetRow % rowsPerPattern;
    player.seek(targetPattern, targetRowInPattern);
  });

  function resizeCanvases(): void {
    const rect = visualizerCanvas.parentElement?.getBoundingClientRect();
    if (rect) {
      visualizerCanvas.width = rect.width;
      visualizerCanvas.height = Math.max(rect.height, 100);
    }
  }

  resizeCanvases();
  visualizerCanvas.addEventListener('resize', resizeCanvases);

  function drawVisualization(): void {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    if (!shouldVisualize) {
      if (visualizerCtx) {
        visualizerCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        visualizerCtx.fillRect(0, 0, width, height);
      }
      if (animationId) cancelAnimationFrame(animationId);
      return;
    }
    if (!visualizerCtx || !player) {
      return;
    }

    const analyser = player.getAnalyser();
    if (!analyser) {
      return;
    }

    const waveHeight = Math.floor(height * 0.8);
    const specTop = 0;
    const specHeight = height - specTop;

    visualizerCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    visualizerCtx.fillRect(0, 0, width, height);

    // spectrum
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const barWidth = width / 64;
    const barGap = 1;

    for (let i = 0; i < 64; i++) {
      const value = freqData[i * 4];
      const barHeight = (value / 255) * specHeight;
      const bx = i * barWidth;
      const by = specTop + specHeight - barHeight;

      const intensity = value / 255;
      let hue: number, sat: number, light: number;

      if (i < 16) {
        hue = 0 + (i / 16) * 30;
        sat = 100;
        light = 50 + intensity * 10;
      } else if (i < 32) {
        hue = 30 + ((i - 16) / 16) * 60;
        sat = 100;
        light = 50 + intensity * 10;
      } else if (i < 48) {
        hue = 90 + ((i - 32) / 16) * 60;
        sat = 90 - intensity * 20;
        light = 50 + intensity * 5;
      } else {
        hue = 180 + ((i - 48) / 16) * 120;
        sat = 100;
        light = 55 + intensity * 10;
      }

      visualizerCtx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;

      visualizerCtx.shadowBlur = intensity * 10;
      visualizerCtx.shadowColor = `hsl(${hue}, 100%, 50%)`;

      visualizerCtx.fillRect(bx, by, barWidth - barGap, barHeight);

      visualizerCtx.shadowBlur = 0;
    }

    // waveform
    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);

    visualizerCtx.lineWidth = 2;
    visualizerCtx.strokeStyle = '#00ff88';
    visualizerCtx.beginPath();

    const sliceWidth = width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * waveHeight) / 2;
      if (i === 0) visualizerCtx.moveTo(x, y);
      else visualizerCtx.lineTo(x, y);
      x += sliceWidth;
    }

    visualizerCtx.lineTo(width, waveHeight / 2);
    visualizerCtx.stroke();

    animationId = requestAnimationFrame(drawVisualization);
  }

  return () => {
    if (animationId) cancelAnimationFrame(animationId);
    player?.cleanup();
  };
}
