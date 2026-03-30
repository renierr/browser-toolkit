import { TrackerAudio } from './tracker-audio';
import {
  createInitialState,
  serializeState,
  deserializeState,
  type TrackerState,
  type Instrument,
  type CellData,
  type Pattern,
} from './tracker-state';
import { exportToWav } from './wav-exporter';
import { downloadFile } from '../../js/file-utils';
import { parseModFile } from './mod-parser';
import { BUILTIN_SAMPLES } from './builtin-samples';

const ROWS = 64;

type ClipboardData = {
  note: string | null;
  octave: number | null;
  instrument: number;
  volume: number;
};

export default function init(): () => void {
  let state: TrackerState;
  let audio: TrackerAudio;
  let selectedNote = 'C';
  let selectedOctave = 4;
  let selectedInstrument = 1;
  let selectedVolume = 32;
  let selectedChannel = 0;
  let selectedRow = 0;
  let clipboard: ClipboardData | null = null;

  let cleanupKeyboard: (() => void) | null = null;

  state = createInitialState();
  audio = new TrackerAudio();
  audio.setState(state);

  setupEventListeners();
  setupAudioCallbacks();
  renderAll();

  return () => {
    audio.cleanup();
    if (cleanupKeyboard) {
      cleanupKeyboard();
    }
  };

  function setupEventListeners() {
    const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    const btnLoop = document.getElementById('btn-loop') as HTMLButtonElement;
    const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement;
    const btnExportWav = document.getElementById('btn-export-wav') as HTMLButtonElement;
    const btnSaveProject = document.getElementById('btn-save-project') as HTMLButtonElement;
    const btnLoadProject = document.getElementById('btn-load-project') as HTMLButtonElement;
    const fileLoad = document.getElementById('file-load') as HTMLInputElement;
    const btnLoadMod = document.getElementById('btn-load-mod') as HTMLButtonElement;
    const fileLoadMod = document.getElementById('file-load-mod') as HTMLInputElement;
    const btnAddPattern = document.getElementById('btn-add-pattern') as HTMLButtonElement;
    const btnRemovePattern = document.getElementById('btn-remove-pattern') as HTMLButtonElement;
    const btnClearCell = document.getElementById('btn-clear-cell') as HTMLButtonElement;
    const btnCopyCell = document.getElementById('btn-copy-cell') as HTMLButtonElement;
    const btnPasteCell = document.getElementById('btn-paste-cell') as HTMLButtonElement;

    btnPlay.addEventListener('click', togglePlay);
    btnStop.addEventListener('click', stopPlayback);
    btnLoop.addEventListener('click', toggleLoop);
    bpmSlider.addEventListener('input', () => {
      state.bpm = parseInt(bpmSlider.value);
      (document.getElementById('bpm-display') as HTMLElement).textContent = state.bpm.toString();
    });
    btnExportWav.addEventListener('click', handleExportWav);
    btnSaveProject.addEventListener('click', handleSaveProject);
    btnLoadProject.addEventListener('click', () => fileLoad.click());
    fileLoad.addEventListener('change', handleLoadProject);
    btnLoadMod.addEventListener('click', () => fileLoadMod.click());
    fileLoadMod.addEventListener('change', handleLoadMod);
    btnAddPattern.addEventListener('click', handleAddPattern);
    btnRemovePattern.addEventListener('click', handleRemovePattern);
    btnClearCell.addEventListener('click', handleClearCell);
    btnCopyCell.addEventListener('click', handleCopyCell);
    btnPasteCell.addEventListener('click', handlePasteCell);

    setupNoteButtons();
    cleanupKeyboard = setupKeyboardInput();
    setupInstrumentControls();
    setupVolumeControl();
  }

  function setupKeyboardInput(): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedRow = Math.max(0, selectedRow - 1);
        highlightSelectedCell();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedRow = Math.min(ROWS - 1, selectedRow + 1);
        highlightSelectedCell();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectedChannel = Math.max(0, selectedChannel - 1);
        highlightSelectedCell();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectedChannel = Math.min(state.channels - 1, selectedChannel + 1);
        highlightSelectedCell();
        return;
      }

      const noteMap: Record<string, string> = {
        z: 'C',
        s: 'C#',
        x: 'D',
        d: 'D#',
        c: 'E',
        v: 'F',
        g: 'F#',
        b: 'G',
        h: 'G#',
        n: 'A',
        j: 'A#',
        m: 'B',
      };

      const key = e.key.toLowerCase();
      if (noteMap[key]) {
        e.preventDefault();
        selectedNote = noteMap[key];
        updateNoteSelection();
        placeNoteInCell();
        previewCurrentNote();
        return;
      }

      if (e.key >= '1' && e.key <= '6') {
        selectedOctave = parseInt(e.key);
        updateOctaveSelection();
        placeNoteInCell();
        previewCurrentNote();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleClearCell();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }

  function placeNoteInCell() {
    const pattern = state.patterns[state.currentPattern];
    const cell = pattern.rows[selectedRow][selectedChannel];
    cell.note = selectedNote;
    cell.octave = selectedOctave;
    cell.instrument = selectedInstrument;
    renderTrackerGrid();
    highlightSelectedCell();
  }

  function setupNoteButtons() {
    const noteBtns = document.querySelectorAll('.note-btn');
    noteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const note = btn.getAttribute('data-note');
        if (note) {
          selectedNote = note;
          updateNoteSelection();
          previewCurrentNote();
        }
      });
    });

    const octaveBtns = document.querySelectorAll('.octave-btn');
    octaveBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const octave = btn.getAttribute('data-octave');
        if (octave) {
          selectedOctave = parseInt(octave);
          updateOctaveSelection();
          previewCurrentNote();
        }
      });
    });
  }

  function updateNoteSelection() {
    const noteBtns = document.querySelectorAll('.note-btn');
    noteBtns.forEach((btn) => {
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

  function updateOctaveSelection() {
    const octaveBtns = document.querySelectorAll('.octave-btn');
    octaveBtns.forEach((btn) => {
      const octave = btn.getAttribute('data-octave');
      if (octave && parseInt(octave) === selectedOctave) {
        btn.classList.add('btn-active');
      } else {
        btn.classList.remove('btn-active');
      }
    });
  }

  function setupInstrumentControls() {
    const waveform = document.getElementById('inst-waveform') as HTMLSelectElement;
    const atk = document.getElementById('inst-atk') as HTMLInputElement;
    const dec = document.getElementById('inst-dec') as HTMLInputElement;
    const sus = document.getElementById('inst-sus') as HTMLInputElement;
    const rel = document.getElementById('inst-rel') as HTMLInputElement;
    const duty = document.getElementById('inst-duty') as HTMLInputElement;

    waveform.addEventListener('change', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.waveform = waveform.value as Instrument['waveform'];
        renderInstrumentTabs();
      }
    });

    atk.addEventListener('input', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.attack = parseFloat(atk.value);
        (document.getElementById('atk-display') as HTMLElement).textContent =
          inst.attack.toFixed(2);
      }
    });

    dec.addEventListener('input', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.decay = parseFloat(dec.value);
        (document.getElementById('dec-display') as HTMLElement).textContent = inst.decay.toFixed(2);
      }
    });

    sus.addEventListener('input', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.sustain = parseFloat(sus.value);
        (document.getElementById('sus-display') as HTMLElement).textContent =
          inst.sustain.toFixed(2);
      }
    });

    rel.addEventListener('input', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.release = parseFloat(rel.value);
        (document.getElementById('rel-display') as HTMLElement).textContent =
          inst.release.toFixed(2);
      }
    });

    duty.addEventListener('input', () => {
      const inst = getCurrentInstrument();
      if (inst) {
        inst.duty = parseInt(duty.value);
        (document.getElementById('duty-display') as HTMLElement).textContent = `${inst.duty}%`;
      }
    });

    renderInstrumentTabs();
    updateInstrumentControls();
  }

  function getCurrentInstrument(): Instrument | null {
    return state.instruments.find((i) => i.id === selectedInstrument) ?? null;
  }

  function renderInstrumentTabs() {
    const container = document.getElementById('instrument-tabs') as HTMLElement;
    container.innerHTML = '';

    for (const inst of state.instruments) {
      const btn = document.createElement('button');
      btn.className = `btn btn-xs ${inst.id === selectedInstrument ? 'btn-primary' : 'btn-outline'}`;
      btn.textContent = inst.name;
      btn.title = `Instrument ${inst.id}`;
      btn.addEventListener('click', () => {
        selectedInstrument = inst.id;
        renderInstrumentTabs();
        updateInstrumentControls();
      });
      container.appendChild(btn);
    }
  }

  function updateInstrumentControls() {
    const inst = getCurrentInstrument();
    if (!inst) return;

    (document.getElementById('inst-waveform') as HTMLSelectElement).value = inst.waveform;
    (document.getElementById('inst-atk') as HTMLInputElement).value = inst.attack.toString();
    (document.getElementById('atk-display') as HTMLElement).textContent = inst.attack.toFixed(2);
    (document.getElementById('inst-dec') as HTMLInputElement).value = inst.decay.toString();
    (document.getElementById('dec-display') as HTMLElement).textContent = inst.decay.toFixed(2);
    (document.getElementById('inst-sus') as HTMLInputElement).value = inst.sustain.toString();
    (document.getElementById('sus-display') as HTMLElement).textContent = inst.sustain.toFixed(2);
    (document.getElementById('inst-rel') as HTMLInputElement).value = inst.release.toString();
    (document.getElementById('rel-display') as HTMLElement).textContent = inst.release.toFixed(2);
    (document.getElementById('inst-duty') as HTMLInputElement).value = inst.duty.toString();
    (document.getElementById('duty-display') as HTMLElement).textContent = `${inst.duty}%`;
  }

  function setupVolumeControl() {
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    const volumeDisplay = document.getElementById('volume-display') as HTMLElement;

    volumeSlider.addEventListener('input', () => {
      selectedVolume = parseInt(volumeSlider.value);
      volumeDisplay.textContent = selectedVolume.toString();
    });
  }

  function previewCurrentNote() {
    const inst = getCurrentInstrument();
    if (inst) {
      audio.previewNote(inst, selectedNote, selectedOctave);
    }
  }

  function setupAudioCallbacks() {
    audio.setOnPositionChange((pattern, row) => {
      state.currentPattern = pattern;
      state.currentRow = row;
      updatePositionDisplay();
      highlightCurrentRow();
      renderPatternOrder();
    });

    audio.setOnStop(() => {
      state.isPlaying = false;
      updatePlayButton();
    });
  }

  function togglePlay() {
    if (state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
    } else {
      state.currentPattern = 0;
      state.currentRow = 0;
      audio.play();
      state.isPlaying = true;
    }
    updatePlayButton();
    renderPatternOrder();
    renderTrackerGrid();
    updatePositionDisplay();
    highlightCurrentRow();
  }

  function stopPlayback() {
    audio.stop();
    state.isPlaying = false;
    state.currentRow = 0;
    updatePlayButton();
    updatePositionDisplay();
    highlightCurrentRow();
  }

  function toggleLoop() {
    state.isLooping = !state.isLooping;
    const btn = document.getElementById('btn-loop') as HTMLButtonElement;
    btn.classList.toggle('btn-outline', state.isLooping);
  }

  function updatePlayButton() {
    const btn = document.getElementById('btn-play') as HTMLButtonElement;
    btn.innerHTML = state.isPlaying
      ? '<i data-lucide="pause" class="w-4 h-4"></i>'
      : '<i data-lucide="play" class="w-4 h-4"></i>';
  }

  function updatePositionDisplay() {
    const display = document.getElementById('position-display') as HTMLElement;
    display.textContent = `Pat: ${String(state.currentPattern).padStart(2, '0')} Row: ${String(state.currentRow).padStart(2, '0')}`;
  }

  function renderAll() {
    renderPatternOrder();
    renderTrackerGrid();
    updatePositionDisplay();
    updateNoteSelection();
    updateOctaveSelection();
  }

  function renderPatternOrder() {
    const container = document.getElementById('pattern-order') as HTMLElement;
    container.innerHTML = '';

    state.order.forEach((patternId) => {
      const btn = document.createElement('button');
      btn.className = `btn btn-xs w-auto mb-1 sm:mb-0 sm:mr-1 ${patternId === state.currentPattern ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = `P${patternId}`;
      btn.addEventListener('click', () => {
        state.currentPattern = patternId;
        renderPatternOrder();
        renderTrackerGrid();
      });
      container.appendChild(btn);
    });
  }

  function renderChannelHeader() {
    const thead = document.getElementById('tracker-header') as HTMLElement;
    thead.innerHTML = '';

    const tr = document.createElement('tr');
    tr.className = 'text-xs';

    const rowTh = document.createElement('th');
    rowTh.className = 'w-8 text-center';
    rowTh.textContent = 'Row';
    tr.appendChild(rowTh);

    for (let ch = 0; ch < state.channels; ch++) {
      const chTh = document.createElement('th');
      chTh.className = 'w-20 text-center';
      chTh.textContent = `Ch${ch + 1}`;
      tr.appendChild(chTh);

      const insTh = document.createElement('th');
      insTh.className = 'w-16 text-center';
      insTh.textContent = `Ins${ch + 1}`;
      tr.appendChild(insTh);

      const volTh = document.createElement('th');
      volTh.className = 'w-16 text-center';
      volTh.textContent = `Vol${ch + 1}`;
      tr.appendChild(volTh);
    }

    thead.appendChild(tr);
  }

  function renderTrackerGrid() {
    const tbody = document.getElementById('tracker-grid') as HTMLElement;
    tbody.innerHTML = '';

    renderChannelHeader();

    const pattern = state.patterns[state.currentPattern];
    if (!pattern) return;

    for (let row = 0; row < ROWS; row++) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-row', row.toString());

      const rowNum = document.createElement('td');
      rowNum.className = 'tracker-cell row-num text-base-content/50';
      rowNum.textContent = row.toString().padStart(2, '0');
      tr.appendChild(rowNum);

      for (let ch = 0; ch < state.channels; ch++) {
        const cell = pattern.rows[row][ch];

        const noteTd = document.createElement('td');
        noteTd.className = 'tracker-cell note-cell';
        noteTd.setAttribute('data-channel', ch.toString());
        noteTd.setAttribute('data-row', row.toString());
        noteTd.setAttribute('data-type', 'note');
        noteTd.addEventListener('click', () => handleCellClick(ch, row, 'note'));
        if (cell.note) {
          noteTd.textContent = `${cell.note}${cell.octave ?? ''}`;
          noteTd.classList.remove('empty');
        } else {
          noteTd.textContent = '---';
          noteTd.classList.add('empty');
        }
        tr.appendChild(noteTd);

        const insTd = document.createElement('td');
        insTd.className = 'tracker-cell';
        insTd.setAttribute('data-channel', ch.toString());
        insTd.setAttribute('data-row', row.toString());
        insTd.setAttribute('data-type', 'ins');
        insTd.addEventListener('click', () => handleCellClick(ch, row, 'ins'));
        if (cell.instrument !== null) {
          insTd.textContent = cell.instrument.toString();
          insTd.classList.remove('empty');
        } else {
          insTd.textContent = '--';
          insTd.classList.add('empty');
        }
        tr.appendChild(insTd);

        const volTd = document.createElement('td');
        volTd.className = 'tracker-cell';
        volTd.setAttribute('data-channel', ch.toString());
        volTd.setAttribute('data-row', row.toString());
        volTd.setAttribute('data-type', 'volume');
        volTd.addEventListener('click', () => handleCellClick(ch, row, 'volume'));
        if (cell.volume !== null) {
          volTd.textContent = cell.volume.toString();
          volTd.classList.remove('empty');
        } else {
          volTd.textContent = '--';
          volTd.classList.add('empty');
        }
        tr.appendChild(volTd);
      }

      tbody.appendChild(tr);
    }

    highlightCurrentRow();
  }

  function handleCellClick(channel: number, row: number, type?: string) {
    selectedChannel = channel;
    selectedRow = row;
    highlightSelectedCell();

    const pattern = state.patterns[state.currentPattern];
    const cell = pattern.rows[row][channel];

    if (type === 'volume') {
      cell.volume = selectedVolume;
    } else {
      cell.note = selectedNote;
      cell.octave = selectedOctave;
      cell.instrument = selectedInstrument;
      previewCurrentNote();
    }

    renderTrackerGrid();
    highlightSelectedCell();
  }

  function highlightSelectedCell() {
    const cells = document.querySelectorAll('.tracker-cell.selected');
    cells.forEach((c) => c.classList.remove('selected'));

    const newCells = document.querySelectorAll(
      `.tracker-cell[data-channel="${selectedChannel}"][data-row="${selectedRow}"]`
    );
    newCells.forEach((c) => c.classList.add('selected'));
  }

  function highlightCurrentRow() {
    const rows = document.querySelectorAll('#tracker-grid tr.active-row');
    rows.forEach((r) => r.classList.remove('active-row'));

    const currentRow = document.querySelector(`#tracker-grid tr[data-row="${state.currentRow}"]`);
    if (currentRow) {
      currentRow.classList.add('active-row');
    }
  }

  function handleClearCell() {
    const pattern = state.patterns[state.currentPattern];
    const cell = pattern.rows[selectedRow][selectedChannel];
    cell.note = null;
    cell.octave = null;
    cell.instrument = 0;
    cell.volume = 0;
    renderTrackerGrid();
  }

  function handleCopyCell() {
    const pattern = state.patterns[state.currentPattern];
    const cell = pattern.rows[selectedRow][selectedChannel];
    clipboard = {
      note: cell.note,
      octave: cell.octave,
      instrument: cell.instrument,
      volume: cell.volume,
    };
  }

  function handlePasteCell() {
    if (!clipboard) return;
    const pattern = state.patterns[state.currentPattern];
    const cell = pattern.rows[selectedRow][selectedChannel];
    cell.note = clipboard.note;
    cell.octave = clipboard.octave;
    cell.instrument = clipboard.instrument ?? 0;
    cell.volume = clipboard.volume ?? 0;
    renderTrackerGrid();
  }

  function handleAddPattern() {
    const newId = state.patterns.length;
    const channels = state.channels;
    const rows = ROWS;

    const newPatternRows: (typeof state.patterns)[0]['rows'] = [];
    for (let r = 0; r < rows; r++) {
      const row: (typeof state.patterns)[0]['rows'][0] = [];
      for (let c = 0; c < channels; c++) {
        row.push({ note: null, octave: null, instrument: 0, volume: 0 });
      }
      newPatternRows.push(row);
    }

    state.patterns.push({ id: newId, rows: newPatternRows });
    state.order.push(newId);
    renderPatternOrder();
  }

  function handleRemovePattern() {
    if (state.order.length <= 1) return;
    state.order.pop();
    renderPatternOrder();
  }

  async function handleExportWav() {
    const btn = document.getElementById('btn-export-wav') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 mr-1 animate-spin"></i> Rendering...';

    try {
      const blob = await exportToWav(state);
      downloadFile(blob, 'chiptune.wav');
    } catch (e) {
      console.error('[Tracker] Export failed:', e);
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download" class="w-4 h-4 mr-1"></i> Export WAV';
  }

  function handleSaveProject() {
    const json = serializeState(state);
    const blob = new Blob([json], { type: 'application/json' });
    downloadFile(blob, 'tracker-project.json');
  }

  function handleLoadProject(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const json = reader.result as string;
      const loadedState = deserializeState(json);
      if (loadedState) {
        state = loadedState;
        audio.setState(state);
        renderAll();
        updateModInfoDisplay();
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  function handleLoadMod(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      try {
        const modFile = parseModFile(buffer);
        const loadedState = convertModToState(modFile);
        state = loadedState;
        audio.setState(state);
        renderAll();
        updateModInfoDisplay();
      } catch (err) {
        console.error('[Tracker] Failed to parse MOD file:', err);
      }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  function updateModInfoDisplay() {
    const modInfo = document.getElementById('mod-info');
    if (!modInfo) return;

    if (state.modTitle) {
      modInfo.classList.remove('hidden');
      const titleEl = document.getElementById('mod-title');
      const channelsEl = document.getElementById('mod-channels');
      const samplesEl = document.getElementById('mod-samples');
      const patternsEl = document.getElementById('mod-patterns');

      if (titleEl) titleEl.textContent = state.modTitle;
      if (channelsEl) channelsEl.textContent = state.modChannels?.toString() ?? '-';
      if (samplesEl) samplesEl.textContent = state.modSampleCount?.toString() ?? '-';
      if (patternsEl) patternsEl.textContent = state.modPatternCount?.toString() ?? '-';
    } else {
      modInfo.classList.add('hidden');
    }
  }

  function convertModToState(modFile: ReturnType<typeof parseModFile>): TrackerState {
    const channels = modFile.channels;
    const rowsPerPattern = 64;
    const maxInstruments = 31;

    const instruments: Instrument[] = [];
    for (let i = 0; i < maxInstruments; i++) {
      const sample = modFile.samples[i];
      instruments.push({
        id: i + 1,
        name: sample?.name || `Sample ${i + 1}`,
        waveform: 'square',
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.2,
        duty: 50,
        sampleIndex: i,
        sampleVolume: sample?.volume || 64,
        sampleData: sample?.data,
        sampleLoopStart: sample?.loopStart,
        sampleLoopLength: sample?.loopLength,
      });
    }

    const patterns: Pattern[] = [];
    for (const modPattern of modFile.patterns) {
      const rows: CellData[][] = [];
      for (let row = 0; row < 64; row++) {
        const rowData: CellData[] = [];
        for (let ch = 0; ch < channels; ch++) {
          const modNote = modPattern.rows[row]?.[ch];
          const modInstr = modNote?.instrument ?? 0;
          const modVol = modNote?.volume ?? 64;
          rowData.push({
            note: modNote?.note ?? null,
            octave: modNote?.octave ?? null,
            instrument: modInstr,
            volume: modVol,
          });
        }
        while (rowData.length < 4) {
          rowData.push({ note: null, octave: null, instrument: 0, volume: 0 });
        }
        rows.push(rowData);
      }
      patterns.push({ id: patterns.length, rows });
    }

    while (patterns.length < 8) {
      const rows: CellData[][] = [];
      for (let row = 0; row < rowsPerPattern; row++) {
        const rowData: CellData[] = [];
        for (let ch = 0; ch < 4; ch++) {
          rowData.push({ note: null, octave: null, instrument: 0, volume: 0 });
        }
        rows.push(rowData);
      }
      patterns.push({ id: patterns.length, rows });
    }

    const modSamples = modFile.samples.map((s) => s.data);

    for (let i = 0; i < BUILTIN_SAMPLES.length; i++) {
      const builtin = BUILTIN_SAMPLES[i];
      if (instruments.length <= 31 + i) {
        instruments.push({
          id: 32 + i,
          name: builtin.name,
          waveform: 'square',
          attack: 0.01,
          decay: 0.1,
          sustain: 0.7,
          release: 0.2,
          duty: 50,
          sampleIndex: 31 + i,
          sampleVolume: builtin.volume,
          sampleData: builtin.data,
        });
      }
      modSamples.push(builtin.data);
    }

    const order = modFile.sequence.slice(0, 128);
    while (order.length < 8) {
      order.push(order.length);
    }

    const sampleCount = modFile.samples.filter((s) => s.length > 0).length;

    return {
      bpm: modFile.defaultBpm,
      speed: modFile.defaultSpeed,
      channels,
      rowsPerPattern,
      instruments,
      patterns,
      order,
      currentPattern: 0,
      currentRow: 0,
      isPlaying: false,
      isLooping: true,
      modSamples,
      modTitle: modFile.title,
      modChannels: modFile.channels,
      modSampleCount: sampleCount,
      modPatternCount: modFile.patterns.length,
    };
  }
}
