import { ChiptunePlayer } from '../../js/chiptune/player';
import { parseModule } from '../../js/chiptune/parser';
import { SidParser } from '../../js/chiptune/sid-parser';
import { SidPlayer } from '../../js/chiptune/sid-player';
import type { ModuleFile } from '../../js/chiptune/types';

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
  };
}

import type { SharedFilesPayload } from '../../js/share-target';

export default function init(payload?: SharedFilesPayload): () => void {
  let player: ChiptunePlayer | any = null;
  let animationId: number | null = null;

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

  const dropzone = elements['dropzone'];
  const fileInput = elements['file-input'] as HTMLInputElement | null;
  const btnPlay = elements['btn-play'] as HTMLButtonElement | null;
  const btnStop = elements['btn-stop'] as HTMLButtonElement | null;
  const loopToggle = elements['loop-toggle'] as HTMLInputElement | null;
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

  const oscCanvas = document.getElementById('oscilloscope') as HTMLCanvasElement;
  const specCanvas = document.getElementById('spectrum') as HTMLCanvasElement;

  const oscCtx = oscCanvas.getContext('2d');
  const specCtx = specCanvas.getContext('2d');

  if (dropzone && fileInput) {
    const onFile = async (fileList: FileList): Promise<void> => {
      if (fileList.length === 0) return;
      const file = fileList[0];
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'sid') {
        try {
          if (player) {
            player.stop();
            player = null as any;
          }
          const sidMod = new SidParser(data).parse();

          if (!(window as any).sidAudioCtx) {
            (window as any).sidAudioCtx = new AudioContext();
          }
          const actx = (window as any).sidAudioCtx as AudioContext;
          if (actx.state === 'suspended') actx.resume();

          const sidPlayer = new SidPlayer();
          sidPlayer.loadModule(sidMod, actx.sampleRate);

          const scriptNode = actx.createScriptProcessor(4096, 0, 1);
          scriptNode.onaudioprocess = (e) => {
            try {
              sidPlayer.renderStream(e.outputBuffer.getChannelData(0), 4096);
            } catch (e) {
              console.error('SID render error', e);
            }
          };
          const analyser = actx.createAnalyser();
          analyser.fftSize = 2048;

          scriptNode.connect(analyser);
          analyser.connect(actx.destination);

          let isPlaying = true;

          // Map cleanup and UI controls to SidPlayer
          (player as any) = {
            stop: () => {
              scriptNode.disconnect();
              analyser.disconnect();
            },
            getIsPlaying: () => isPlaying,
            play: () => {
              actx.resume();
              isPlaying = true;
            },
            pause: () => {
              actx.suspend();
              isPlaying = false;
            },
            setSpeed: () => {},
            getTotalRows: () => 1,
            getModule: () => ({ rowsPerPattern: 64, defaultSpeed: 1 }),
            getAnalyser: () => analyser,
          };

          const elements = getElements();
          if (elements['format-badge']) elements['format-badge'].textContent = 'SID';
          if (elements['song-title'])
            elements['song-title'].textContent = sidMod.title + ' by ' + sidMod.author;
          if (elements['default-bpm']) elements['default-bpm'].textContent = 'N/A';
          if (elements['file-info']) elements['file-info'].classList.remove('hidden');
          enableControls(elements);
          dropzone?.classList.add('hidden');
        } catch (e) {
          console.error('SID parse error', e);
        }
        return;
      }

      const mod = parseModule(data);
      if (!player || !(player instanceof ChiptunePlayer)) {
        if (player && (player as any).stop) (player as any).stop();
        player = new ChiptunePlayer();
        setupPlayerCallbacks(player, elements);
      }
      player.loadModule(mod);
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

    dropzone.addEventListener('click', () => fileInput?.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('hover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('hover');
      const files = e.dataTransfer?.files;
      if (files) await onFile(files);
    });
    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) await onFile(files);
    });
  }

  btnPlay?.addEventListener('click', () => {
    if (!player) return;
    if (player.getIsPlaying()) {
      player.pause();
      btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
    } else {
      player.play();
      btnPlay.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
    }
  });

  btnStop?.addEventListener('click', () => {
    if (!player) return;
    player.stop();
    if (btnPlay) btnPlay.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
  });

  btnClear?.addEventListener('click', () => {
    if (player) {
      player.stop();
    }
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
    const rect = oscCanvas.parentElement?.getBoundingClientRect();
    if (rect) {
      oscCanvas.width = rect.width;
      oscCanvas.height = Math.max(rect.height - 20, 100);
      specCanvas.width = rect.width;
      specCanvas.height = Math.max(rect.height - 20, 100);
    }
  }

  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);

  function drawVisualization(): void {
    if (!oscCtx || !specCtx || !player) {
      animationId = requestAnimationFrame(drawVisualization);
      return;
    }

    const analyser = player.getAnalyser();
    if (!analyser) {
      animationId = requestAnimationFrame(drawVisualization);
      return;
    }

    const width = oscCanvas.width;
    const height = oscCanvas.height;
    const specWidth = specCanvas.width;
    const specHeight = specCanvas.height;

    oscCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    oscCtx.fillRect(0, 0, width, height);

    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);

    oscCtx.lineWidth = 2;
    oscCtx.strokeStyle = '#00ff88';
    oscCtx.beginPath();

    const sliceWidth = width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) oscCtx.moveTo(x, y);
      else oscCtx.lineTo(x, y);
      x += sliceWidth;
    }

    oscCtx.lineTo(width, height / 2);
    oscCtx.stroke();

    specCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    specCtx.fillRect(0, 0, specWidth, specHeight);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const barWidth = specWidth / 64;
    const barGap = 1;

    for (let i = 0; i < 64; i++) {
      const value = freqData[i * 4];
      const barHeight = (value / 255) * specHeight;
      const bx = i * barWidth;
      const by = specHeight - barHeight;

      const hue = 180 + (i / 64) * 60;
      specCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      specCtx.fillRect(bx, by, barWidth - barGap, barHeight);
    }

    animationId = requestAnimationFrame(drawVisualization);
  }

  drawVisualization();

  return () => {
    if (animationId) cancelAnimationFrame(animationId);
    player?.cleanup();
  };
}
