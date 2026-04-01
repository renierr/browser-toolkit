import { ChiptunePlayer } from '@js/chiptune/player';
import { parseModule } from '@js/chiptune/parser';
import type { ModuleFile } from '@js/chiptune/types';
import { getAllModules, saveModule, deleteModule } from '@js/chiptune/archive';
import { showMessage } from '@js/ui';
import { downloadFile } from '@js/file-utils';
import { ClassicVisualizer } from './visualizers/classic-visualizer';
import { PulseGridVisualizer } from './visualizers/pulse-grid-visualizer';
import { NeonNexusVisualizer } from './visualizers/neon-nexus-visualizer';
import { Grid3DVisualizer } from './visualizers/grid3d-visualizer';
import { ScrollerVisualizer } from './visualizers/scroller-visualizer';
import { SpectrogramVisualizer } from './visualizers/spectrogram-visualizer';
import { TerrainVisualizer } from './visualizers/terrain-visualizer';
import { ParticleConstellationVisualizer } from './visualizers/particle-constellation-visualizer';
import { VUMeterVisualizer } from './visualizers/vu-meter-visualizer';
import type { Visualizer } from './visualizers/base';

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
  if (speedSlider) speedSlider.value = String(33 - mod.defaultSpeed);
  if (speedDisplay) speedDisplay.textContent = String(33 - mod.defaultSpeed);

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
    'vis-selector': document.getElementById('vis-selector'),
  };
}

import type { SharedFilesPayload } from '@js/share-target';
import { setupFileDropzone } from '@js/file-utils';

export default function init(payload?: SharedFilesPayload): () => void {
  let player: ChiptunePlayer | null = null;
  let animationId: number | null = null;
  let shouldVisualize = false;
  let currentFile: File | null = null;
  let currentFormat: string = '';
  let lastFrameTime = 0;
  const frameInterval = 1000 / 60;

  const container = document.getElementById('chiptune-player');
  if (!container) return () => {};

  const elements = getElements();
  player = new ChiptunePlayer();

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
  const visSelector = elements['vis-selector'] as HTMLSelectElement | null;
  const visualizers: Record<string, Visualizer> = {
    'grid-3d': new Grid3DVisualizer(),
    'neon-nexus': new NeonNexusVisualizer(),
    'pulse-grid': new PulseGridVisualizer(),
    classic: new ClassicVisualizer(),
    scroller: new ScrollerVisualizer(),
    spectrogram: new SpectrogramVisualizer(),
    terrain: new TerrainVisualizer(),
    'particle-constellation': new ParticleConstellationVisualizer(),
    'vu-meter': new VUMeterVisualizer(),
  };

  // Apply restored volume from settings
  if (volumeSlider && player) {
    const vol = parseInt(volumeSlider.value) / 100;
    player.setVolume(vol);
    if (volumeDisplay) volumeDisplay.textContent = `${volumeSlider.value}%`;
  }

  let currentVis = localStorage.getItem('chiptune-vis') || 'grid-3d';
  if (visSelector) {
    visSelector.value = currentVis;
    visSelector.addEventListener('change', () => {
      currentVis = visSelector.value;
      localStorage.setItem('chiptune-vis', currentVis);
    });
  }

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
    if (speedSlider) speedSlider.value = String(33 - mod.defaultSpeed);
    if (speedDisplay) speedDisplay.textContent = String(33 - mod.defaultSpeed);
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
        <div class="flex items-center gap-1">
          <button class="btn btn-xs btn-ghost btn-square archive-download" data-id="${m.id}" title="Download module">
            <i data-lucide="download" class="w-3 h-3"></i>
          </button>
          <button class="btn btn-xs btn-ghost btn-square archive-delete" data-id="${m.id}" title="Delete module">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
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

  archiveList?.addEventListener('click', async (e: MouseEvent) => {
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
    const downloadBtn = target.closest('.archive-download');
    if (downloadBtn) {
      const id = (downloadBtn as HTMLElement).dataset.id;
      if (!id) return;
      const modules = await getAllModules();
      const module = modules.find((m) => m.id === id);
      if (module) {
        await downloadFile(module.fileData, module.fileName);
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

    if (player.getIsPlaying()) {
      player.pause();
      btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
      shouldVisualize = false;
    } else {
      await player.play();
      btnPlay.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
      // Sync toggle with current player state
      if (workletToggle) workletToggle.checked = player.getIsWorkletEnabled();
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
      showMessage('Failed to initialize AudioWorklet. Using standard playback.', {
        type: 'warning',
      });
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
    const uiVal = parseInt(speedSlider.value);
    const actualSpd = 33 - uiVal;
    player.setSpeed(actualSpd);
    if (speedDisplay) speedDisplay.textContent = String(uiVal);
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
    const parent = visualizerCanvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      visualizerCanvas.width = rect.width;
      visualizerCanvas.height = rect.height || 160;
    }
  }

  resizeCanvases();
  const resizeListener = () => resizeCanvases();
  visualizerCanvas.addEventListener('resize', resizeListener);

  function drawVisualization(): void {
    const now = performance.now();
    const elapsed = now - lastFrameTime;

    if (elapsed < frameInterval) {
      animationId = requestAnimationFrame(drawVisualization);
      return;
    }

    lastFrameTime = now - (elapsed % frameInterval);
    const deltaTime = elapsed / 1000;

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    if (!shouldVisualize) {
      if (visualizerCtx) {
        visualizerCtx.fillStyle = '#000000';
        visualizerCtx.fillRect(0, 0, width, height);
      }
      if (animationId) cancelAnimationFrame(animationId);
      return;
    }
    if (!visualizerCtx || !player) return;

    const analyser = player.getAnalyser();
    if (!analyser) return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);

    let bass = 0;
    for (let i = 0; i < 8; i++) bass += freqData[i];
    bass /= 8 * 255;

    const vis = visualizers[currentVis] || visualizers['pulse-grid'];
    vis.draw(visualizerCtx, width, height, { freqData, timeData, bass, deltaTime });

    animationId = requestAnimationFrame(drawVisualization);
  }

  return () => {
    if (animationId) cancelAnimationFrame(animationId);
    visualizerCanvas.removeEventListener('resize', resizeListener);
    const vis = visualizers[currentVis];
    vis?.reset?.();
    player?.cleanup();
  };
}
