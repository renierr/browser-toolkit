import { ChiptunePlayer } from '@js/chiptune/player';
import { parseModule } from '@js/chiptune/parser';
import type { ModuleFile } from '@js/chiptune/types';
import { downloadFile } from '@js/file-utils';
import type { SharedFilesPayload } from '@js/share-target';
import {
  ROWS_PER_PATTERN,
  noteNameToNumber,
  calculatePeriod,
  type ClipboardCell,
  type TrackerCol,
  NOTE_MAP,
} from './note-utils';
import { createEmptyModule, insertPattern } from './module-factory';
import { serializeMod } from './mod-serializer';
import { playPreview, cleanupPreview } from './instrument-preview';
import {
  renderTrackerGrid,
  highlightSelectedCell,
  highlightActiveRow,
  scrollRowIntoView,
  scrollActiveRowIntoView,
  updateEffectInputs,
} from './tracker-renderer';
import { renderPatternOrder, handleRemovePattern, type DragState } from './pattern-order-manager';

export default function init(payload?: SharedFilesPayload): () => void {
  let mod: ModuleFile | null = null;
  let player: ChiptunePlayer | null = null;
  let selectedNote = 'C';
  let selectedOctave = 4;
  let selectedInstrument = 1;
  let selectedVolume = 64;
  let selectedChannel = 0;
  let selectedRow = 0;
  let selectedCol: TrackerCol = 'note';
  let clipboard: ClipboardCell | null = null;
  let isPlaying = false;
  let isLooping = true;
  let currentOrderIndex = 0;
  let activeRow = -1;
  const previewCtx = { current: null as AudioContext | null };
  const dragState: DragState = { from: null, over: null };

  const topBar = document.getElementById('top-bar') as HTMLElement;
  const viewport = document.getElementById('tracker-viewport') as HTMLElement | null;
  const trackerGrid = document.getElementById('tracker-grid') as HTMLElement;
  const trackerHeader = document.getElementById('tracker-header') as HTMLElement;
  const patternOrder = document.getElementById('pattern-order') as HTMLElement;
  const instrumentList = document.getElementById('instrument-list') as HTMLElement;
  const pianoKeys = document.getElementById('piano-keys') as HTMLElement;

  setupEventListeners();
  updateNoteSelection();
  updateOctaveSelection();
  renderPianoKeys();

  topBar.scrollIntoView({ behavior: 'auto', block: 'start' });

  if (payload?.sharedFiles?.length) {
    setTimeout(() => handleLoadMod(payload.sharedFiles![0]), 100);
  }

  return () => {
    player?.cleanup();
    cleanupPreview(previewCtx);
  };

  // ─── Module lifecycle ───

  function handleNewModule(): void {
    mod = createEmptyModule();
    currentOrderIndex = 0;
    initPlayer();
    selectedInstrument = 1;
    selectedChannel = 0;
    selectedRow = 0;
    renderAll();
    enableControls();
    topBar.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  async function handleLoadMod(file: File): Promise<void> {
    try {
      const buffer = await file.arrayBuffer();
      mod = parseModule(new Uint8Array(buffer));
      currentOrderIndex = 0;
      initPlayer();
      selectedInstrument = 1;
      selectedChannel = 0;
      selectedRow = 0;
      renderAll();
      enableControls();
      topBar.scrollIntoView({ behavior: 'auto', block: 'start' });
    } catch (err) {
      console.error('[ChiptuneTracker] Failed to parse module:', err);
    }
  }

  function initPlayer(): void {
    player?.cleanup();
    player = new ChiptunePlayer();
    player.loadModule(mod!);
    player.setLooping(isLooping);
    setupPlayerCallbacks();
  }

  function setupPlayerCallbacks(): void {
    if (!player) return;
    player.onPositionChange = (patternId: number, row: number) => {
      const display = document.getElementById('position-display');
      if (display)
        display.textContent = `${String(patternId).padStart(2, '0')}:${String(row).padStart(2, '0')}`;
      if (!mod) return;

      const seq = mod.sequence;
      let newIdx = currentOrderIndex;
      for (let i = 0; i < seq.length; i++) {
        const idx = (currentOrderIndex + i) % seq.length;
        if (seq[idx] === patternId) {
          newIdx = idx;
          break;
        }
      }
      if (newIdx !== currentOrderIndex) {
        currentOrderIndex = newIdx;
        renderTrackerGrid(
          trackerGrid,
          trackerHeader,
          mod,
          getCurrentPatternIdx(),
          selectedRow,
          activeRow,
          isPlaying,
          handleCellClick
        );
        renderPatternOrder(
          patternOrder,
          mod,
          currentOrderIndex,
          dragState,
          onOrderChange,
          onPatternSelect
        );
      }
      activeRow = row;
      highlightActiveRow(row);
      scrollActiveRowIntoView(viewport, row);
    };
    player.onChannelActivity = () => {};
  }

  // ─── Playback ───

  function togglePlay(): void {
    if (!player || !mod) return;
    if (isPlaying) {
      player.pause();
      isPlaying = false;
    } else {
      player.play();
      isPlaying = true;
      topBar.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    updatePlayButton();
  }

  function stopPlayback(): void {
    if (!player) return;
    player.stop();
    isPlaying = false;
    activeRow = -1;
    updatePlayButton();
    const display = document.getElementById('position-display');
    if (display) display.textContent = '00:00';
    currentOrderIndex = 0;
    if (!mod) return;
    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    renderPatternOrder(
      patternOrder,
      mod,
      currentOrderIndex,
      dragState,
      onOrderChange,
      onPatternSelect
    );
    highlightActiveRow(-1);
  }

  function toggleLoop(): void {
    isLooping = !isLooping;
    player?.setLooping(isLooping);
    const btn = document.getElementById('btn-loop');
    btn?.classList.toggle('btn-active', isLooping);
  }

  function updatePlayButton(): void {
    const btn = document.getElementById('btn-play');
    if (btn) {
      btn.innerHTML = isPlaying
        ? '<i data-lucide="pause" class="w-3.5 h-3.5"></i>'
        : '<i data-lucide="play" class="w-3.5 h-3.5"></i>';
    }
  }

  // ─── Cell operations ───

  function placeNoteInCell(): void {
    if (!mod) return;
    const pattern = mod.patterns[getCurrentPatternIdx()];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const noteNum = noteNameToNumber(selectedNote, selectedOctave);
    if (noteNum < 1 || noteNum > 96) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    cell.note = noteNum;
    cell.instrument = selectedInstrument;
    cell.volume = selectedVolume > 0 ? selectedVolume : null;
    cell.period = calculatePeriod(noteNum);

    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    highlightSelectedCell(selectedChannel, selectedRow, selectedCol);

    playPreview(mod, selectedInstrument - 1, selectedNote, selectedOctave, previewCtx);

    selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
    highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
    scrollRowIntoView(viewport, selectedRow);
  }

  function clearCell(): void {
    if (!mod) return;
    const cell = mod.patterns[getCurrentPatternIdx()]?.rows[selectedRow]?.[selectedChannel];
    if (!cell) return;

    cell.note = null;
    cell.period = null;
    cell.instrument = 0;
    cell.volume = null;
    cell.effect = 0;
    cell.effectParam = 0;

    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
  }

  function copyCell(): void {
    if (!mod) return;
    const cell = mod.patterns[getCurrentPatternIdx()]?.rows[selectedRow]?.[selectedChannel];
    if (!cell) return;

    clipboard = {
      note: cell.note,
      instrument: cell.instrument,
      volume: cell.volume,
      effect: cell.effect,
      effectParam: cell.effectParam,
    };
  }

  function pasteCell(): void {
    if (!mod || !clipboard) return;
    const cell = mod.patterns[getCurrentPatternIdx()]?.rows[selectedRow]?.[selectedChannel];
    if (!cell) return;

    cell.note = clipboard.note;
    cell.instrument = clipboard.instrument;
    cell.volume = clipboard.volume;
    cell.effect = clipboard.effect;
    cell.effectParam = clipboard.effectParam;

    if (clipboard.note && clipboard.note > 0) {
      cell.period = calculatePeriod(clipboard.note);
    }

    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
  }

  function applyEffect(): void {
    if (!mod) return;
    const effectInput = document.getElementById('effect-input') as HTMLInputElement;
    const paramInput = document.getElementById('effect-param-input') as HTMLInputElement;

    const effectHex = parseInt(effectInput.value || '0', 16);
    const paramHex = parseInt(paramInput.value || '0', 16);
    if (isNaN(effectHex) || isNaN(paramHex)) return;

    const cell = mod.patterns[getCurrentPatternIdx()]?.rows[selectedRow]?.[selectedChannel];
    if (!cell) return;

    cell.effect = effectHex & 0x0f;
    cell.effectParam = paramHex & 0xff;

    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
  }

  function handleCellClick(channel: number, row: number, col: TrackerCol): void {
    if (!mod) return;
    selectedChannel = channel;
    selectedRow = row;
    selectedCol = col;

    // Place the currently selected note into the clicked cell
    placeNoteInCell();

    if ((col === 'effect' || col === 'param') && mod) {
      updateEffectInputs(mod, getCurrentPatternIdx(), row, channel);
    }
  }

  // ─── Pattern operations ───

  function getCurrentPatternIdx(): number {
    if (!mod) return 0;
    return mod.sequence[currentOrderIndex] ?? 0;
  }

  function onPatternSelect(index: number): void {
    currentOrderIndex = index;
    if (!mod) return;
    renderPatternOrder(
      patternOrder,
      mod,
      currentOrderIndex,
      dragState,
      onOrderChange,
      onPatternSelect
    );
    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
  }

  function onOrderChange(): void {
    if (!mod) return;
    renderPatternOrder(
      patternOrder,
      mod,
      currentOrderIndex,
      dragState,
      onOrderChange,
      onPatternSelect
    );
    renderModuleInfo();
    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
  }

  function handleExportMod(): void {
    if (!mod) return;
    const blob = serializeMod(mod);
    const ext = mod.type === 'XM' ? 'xm' : mod.type === 'IT' ? 'it' : 'mod';
    downloadFile(blob, `${mod.title || 'untitled'}.${ext}`);
  }

  // ─── Rendering ───

  function renderAll(): void {
    if (!mod) return;
    renderModuleInfo();
    renderPatternOrder(
      patternOrder,
      mod,
      currentOrderIndex,
      dragState,
      onOrderChange,
      onPatternSelect
    );
    renderTrackerGrid(
      trackerGrid,
      trackerHeader,
      mod,
      getCurrentPatternIdx(),
      selectedRow,
      activeRow,
      isPlaying,
      handleCellClick
    );
    renderInstrumentList();
    updateBpmSpeedDisplay();
  }

  function enableControls(): void {
    ['btn-play', 'btn-stop', 'btn-loop', 'btn-export-mod'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) (el as HTMLButtonElement).disabled = false;
    });
  }

  function renderModuleInfo(): void {
    if (!mod) return;
    const info = document.getElementById('mod-info');
    info?.classList.remove('hidden');

    const set = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('mod-format', mod.type);
    set('mod-title', mod.title || 'Untitled');
    set('mod-channels', String(mod.channels));
    set('mod-patterns', String(mod.patterns.length));
    set('mod-instruments', String(mod.instruments.filter((i) => i.samples.length > 0).length));
    set('mod-bpm', String(mod.defaultBpm));
    set('mod-speed', String(mod.defaultSpeed));
  }

  function updateBpmSpeedDisplay(): void {
    if (!mod) return;
    const set = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const setVal = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = val;
    };

    set('bpm-display', String(mod.defaultBpm));
    set('speed-display', String(mod.defaultSpeed));
    setVal('bpm-slider', String(mod.defaultBpm));
    setVal('speed-slider', String(mod.defaultSpeed));
  }

  // ─── Piano Keys ───

  function renderPianoKeys(): void {
    pianoKeys.innerHTML = '';

    const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackNotes: { note: string; after: string }[] = [
      { note: 'C#', after: 'C' },
      { note: 'D#', after: 'D' },
      { note: 'F#', after: 'F' },
      { note: 'G#', after: 'G' },
      { note: 'A#', after: 'A' },
    ];

    for (const note of whiteNotes) {
      const key = document.createElement('div');
      key.className = `piano-key white ${note === selectedNote ? 'active' : ''}`;
      key.setAttribute('data-note', note);
      key.textContent = note;
      Object.assign(key.style, {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        fontSize: '8px',
        paddingBottom: '2px',
      });

      key.addEventListener('click', () => {
        selectedNote = note;
        updateNoteSelection();
        renderPianoKeys();
        if (mod) playPreview(mod, selectedInstrument - 1, selectedNote, selectedOctave, previewCtx);
      });

      pianoKeys.appendChild(key);

      const blackKey = blackNotes.find((b) => b.after === note);
      if (blackKey) {
        const bKey = document.createElement('div');
        bKey.className = `piano-key black ${blackKey.note === selectedNote ? 'active' : ''}`;
        bKey.setAttribute('data-note', blackKey.note);
        bKey.textContent = blackKey.note.replace('#', '');
        Object.assign(bKey.style, {
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          fontSize: '7px',
          paddingBottom: '1px',
          color: 'var(--color-base-100)',
        });

        bKey.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedNote = blackKey.note;
          updateNoteSelection();
          renderPianoKeys();
          if (mod)
            playPreview(mod, selectedInstrument - 1, selectedNote, selectedOctave, previewCtx);
        });

        pianoKeys.appendChild(bKey);
      }
    }
  }

  // ─── Instrument List ───

  function renderInstrumentList(): void {
    if (!mod) return;
    instrumentList.innerHTML = '';

    const activeInstruments = mod.instruments
      .map((inst, idx) => ({ inst, idx }))
      .filter(({ inst }) => inst.samples.length > 0 || inst.name);

    const countEl = document.getElementById('inst-count');
    if (countEl) countEl.textContent = `${activeInstruments.length}`;

    activeInstruments.forEach(({ inst, idx }) => {
      const num = idx + 1;
      const sample = inst.samples[0];
      const size = sample?.data?.length ? `${Math.round(sample.data.length / 1024)}K` : '-';
      const vol = sample?.volume ?? 64;
      const name = inst.name || `Sample ${num}`;

      const row = document.createElement('div');
      row.className = `inst-row flex items-center gap-2 px-1 py-0.5 rounded text-xs ${num === selectedInstrument ? 'selected' : ''}`;
      row.innerHTML = `
        <span class="font-mono w-5 text-right opacity-60">${String(num).padStart(2, ' ')}</span>
        <span class="flex-1 truncate">${name}</span>
        <span class="opacity-50 text-[10px]">${size}</span>
        <span class="opacity-50 text-[10px]">${vol}</span>
      `;
      row.addEventListener('click', () => {
        selectedInstrument = num;
        renderInstrumentList();
      });
      row.addEventListener('dblclick', () => {
        if (mod) playPreview(mod, idx, selectedNote, selectedOctave, previewCtx);
      });
      instrumentList.appendChild(row);
    });
  }

  // ─── UI selection updates ───

  function updateNoteSelection(): void {
    document.querySelectorAll('.note-btn').forEach((btn) => {
      const note = btn.getAttribute('data-note');
      if (note === selectedNote) {
        btn.classList.add('btn-active', 'btn-primary');
        btn.classList.remove('btn-ghost');
      } else {
        btn.classList.remove('btn-active', 'btn-primary');
        btn.classList.add('btn-ghost');
      }
    });
  }

  function updateOctaveSelection(): void {
    document.querySelectorAll('.octave-btn').forEach((btn) => {
      const octave = btn.getAttribute('data-octave');
      if (octave && parseInt(octave) === selectedOctave) {
        btn.classList.add('btn-active');
      } else {
        btn.classList.remove('btn-active');
      }
    });
  }

  // ─── Event setup ───

  function setupEventListeners(): () => void {
    const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
    const btnLoadMod = document.getElementById('btn-load-mod') as HTMLButtonElement;
    const btnExportMod = document.getElementById('btn-export-mod') as HTMLButtonElement;
    const fileLoadMod = document.getElementById('file-load-mod') as HTMLInputElement;
    const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    const btnLoop = document.getElementById('btn-loop') as HTMLButtonElement;
    const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement;
    const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
    const btnAddPattern = document.getElementById('btn-add-pattern') as HTMLButtonElement;
    const btnRemovePattern = document.getElementById('btn-remove-pattern') as HTMLButtonElement;
    const btnClearCell = document.getElementById('btn-clear-cell') as HTMLButtonElement;
    const btnCopyCell = document.getElementById('btn-copy-cell') as HTMLButtonElement;
    const btnPasteCell = document.getElementById('btn-paste-cell') as HTMLButtonElement;
    const btnPreviewInst = document.getElementById('btn-preview-inst') as HTMLButtonElement;
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    const btnApplyEffect = document.getElementById('btn-apply-effect') as HTMLButtonElement;
    const effectInput = document.getElementById('effect-input') as HTMLInputElement;
    const effectParamInput = document.getElementById('effect-param-input') as HTMLInputElement;

    btnNew.addEventListener('click', handleNewModule);
    btnLoadMod.addEventListener('click', () => fileLoadMod.click());
    fileLoadMod.addEventListener('change', () => {
      const file = fileLoadMod.files?.[0];
      if (file) handleLoadMod(file);
      fileLoadMod.value = '';
    });
    btnExportMod.addEventListener('click', handleExportMod);
    btnPlay.addEventListener('click', togglePlay);
    btnStop.addEventListener('click', stopPlayback);
    btnLoop.addEventListener('click', toggleLoop);

    bpmSlider.addEventListener('input', () => {
      if (!mod) return;
      mod.defaultBpm = parseInt(bpmSlider.value);
      const display = document.getElementById('bpm-display');
      if (display) display.textContent = String(mod.defaultBpm);
      player?.setBpm(mod.defaultBpm);
    });

    speedSlider.addEventListener('input', () => {
      if (!mod) return;
      mod.defaultSpeed = parseInt(speedSlider.value);
      const display = document.getElementById('speed-display');
      if (display) display.textContent = String(mod.defaultSpeed);
      player?.setSpeed(mod.defaultSpeed);
    });

    btnAddPattern.addEventListener('click', () => {
      if (!mod) return;
      insertPattern(mod, currentOrderIndex + 1);
      currentOrderIndex++;
      onOrderChange();
    });
    btnRemovePattern.addEventListener('click', () => {
      if (!mod) return;
      if (handleRemovePattern(mod, currentOrderIndex)) {
        if (currentOrderIndex >= mod.sequence.length) currentOrderIndex = mod.sequence.length - 1;
        onOrderChange();
      }
    });
    btnClearCell.addEventListener('click', clearCell);
    btnCopyCell.addEventListener('click', copyCell);
    btnPasteCell.addEventListener('click', pasteCell);
    btnPreviewInst.addEventListener('click', () => {
      if (mod) playPreview(mod, selectedInstrument - 1, selectedNote, selectedOctave, previewCtx);
    });
    btnApplyEffect.addEventListener('click', applyEffect);

    volumeSlider.addEventListener('input', () => {
      selectedVolume = parseInt(volumeSlider.value);
      const display = document.getElementById('volume-display');
      if (display) display.textContent = String(selectedVolume);
    });

    effectInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyEffect();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        if (!mod) return;
        renderTrackerGrid(
          trackerGrid,
          trackerHeader,
          mod,
          getCurrentPatternIdx(),
          selectedRow,
          activeRow,
          isPlaying,
          handleCellClick
        );
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
      }
    });

    effectParamInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyEffect();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        if (!mod) return;
        renderTrackerGrid(
          trackerGrid,
          trackerHeader,
          mod,
          getCurrentPatternIdx(),
          selectedRow,
          activeRow,
          isPlaying,
          handleCellClick
        );
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
      }
    });

    document.querySelectorAll('.note-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const note = btn.getAttribute('data-note');
        if (note) {
          selectedNote = note;
          updateNoteSelection();
          renderPianoKeys();
          if (mod)
            playPreview(mod, selectedInstrument - 1, selectedNote, selectedOctave, previewCtx);
        }
      });
    });

    document.querySelectorAll('.octave-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const octave = btn.getAttribute('data-octave');
        if (octave) {
          selectedOctave = parseInt(octave);
          updateOctaveSelection();
        }
      });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!mod) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target.id !== 'volume-slider') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedRow = Math.max(0, selectedRow - 1);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (selectedCol === 'param') selectedCol = 'effect';
        else if (selectedCol === 'effect') selectedCol = 'vol';
        else if (selectedCol === 'vol') selectedCol = 'ins';
        else if (selectedCol === 'ins') selectedCol = 'note';
        else if (selectedCol === 'note') selectedChannel = Math.max(0, selectedChannel - 1);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (selectedCol === 'note') selectedCol = 'ins';
        else if (selectedCol === 'ins') selectedCol = 'vol';
        else if (selectedCol === 'vol') selectedCol = 'effect';
        else if (selectedCol === 'effect') selectedCol = 'param';
        else if (selectedCol === 'param')
          selectedChannel = Math.min(mod.channels - 1, selectedChannel + 1);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const cols: TrackerCol[] = ['note', 'ins', 'vol', 'effect', 'param'];
        const currentIdx = cols.indexOf(selectedCol);
        selectedCol = e.shiftKey
          ? cols[(currentIdx - 1 + cols.length) % cols.length]
          : cols[(currentIdx + 1) % cols.length];
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        return;
      }

      const key = e.key.toLowerCase();
      if (NOTE_MAP[key]) {
        e.preventDefault();
        selectedNote = NOTE_MAP[key];
        updateNoteSelection();
        renderPianoKeys();
        placeNoteInCell();
        return;
      }

      if (e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        selectedOctave = parseInt(e.key);
        updateOctaveSelection();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        clearCell();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }

      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        selectedOctave = Math.min(6, selectedOctave + 1);
        updateOctaveSelection();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        selectedRow = 0;
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        selectedRow = ROWS_PER_PATTERN - 1;
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
      if (e.key === 'PageUp') {
        e.preventDefault();
        selectedRow = Math.max(0, selectedRow - 8);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 8);
        highlightSelectedCell(selectedChannel, selectedRow, selectedCol);
        scrollRowIntoView(viewport, selectedRow);
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }
}
