import { ChiptunePlayer } from '../../js/chiptune/player';
import { parseModule } from '../../js/chiptune/parser';
import type { ModuleFile, Instrument as ModInstrument } from '../../js/chiptune/types';
import { downloadFile } from '../../js/file-utils';
import type { SharedFilesPayload } from '../../js/share-target';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROWS_PER_PATTERN = 64;

type ClipboardCell = {
  note: number | null;
  instrument: number;
  volume: number | null;
};

export default function init(payload?: SharedFilesPayload): () => void {
  let mod: ModuleFile | null = null;
  let player: ChiptunePlayer | null = null;
  let selectedNote = 'C';
  let selectedOctave = 4;
  let selectedInstrument = 1;
  let selectedVolume = 64;
  let selectedChannel = 0;
  let selectedRow = 0;
  let clipboard: ClipboardCell | null = null;
  let isPlaying = false;
  let isLooping = true;
  let currentOrderIndex = 0;
  let previewCtx: AudioContext | null = null;

  document.getElementById('chiptune-tracker');

  setupEventListeners();
  updateNoteSelection();
  updateOctaveSelection();

  if (payload?.sharedFiles?.length) {
    setTimeout(() => handleLoadMod(payload.sharedFiles![0]), 100);
  }

  return () => {
    player?.cleanup();
    previewCtx?.close();
  };

  // ─── Note conversion ───

  function noteNumberToName(n: number): { note: string; octave: number } | null {
    if (n < 1 || n > 96) return null;
    const idx = (n - 1) % 12;
    const oct = Math.floor((n - 1) / 12) + 1;
    return { note: NOTE_NAMES[idx], octave: oct };
  }

  function noteNameToNumber(note: string, octave: number): number {
    const idx = NOTE_NAMES.indexOf(note);
    if (idx < 0) return 0;
    return octave * 12 + idx + 1;
  }

  function formatNote(noteNum: number | null): string {
    if (!noteNum || noteNum === 97) return noteNum === 97 ? '^^^' : '---';
    const info = noteNumberToName(noteNum);
    if (!info) return '---';
    return `${info.note}${info.octave}`;
  }

  function noteToFrequency(note: string, octave: number): number {
    const semitones = NOTE_NAMES.indexOf(note);
    if (semitones < 0) return 0;
    const midiNote = (octave + 1) * 12 + semitones;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  // ─── Module creation ───

  function createEmptyModule(): ModuleFile {
    const instruments: ModInstrument[] = [];
    for (let i = 0; i < 31; i++) {
      instruments.push({
        name: `Sample ${i + 1}`,
        samples: [],
        sampleMap: [],
        volumeFadeout: 0,
      });
    }

    const patterns: ModuleFile['patterns'] = [];
    for (let p = 0; p < 4; p++) {
      const rows: {
        note: number | null;
        period: number | null;
        instrument: number;
        volume: number | null;
        volumeColumn: number | null;
        effect: number;
        effectParam: number;
      }[][] = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const row: {
          note: number | null;
          period: number | null;
          instrument: number;
          volume: number | null;
          volumeColumn: number | null;
          effect: number;
          effectParam: number;
        }[] = [];
        for (let c = 0; c < 4; c++) {
          row.push({
            note: null,
            period: null,
            instrument: 0,
            volume: null,
            volumeColumn: null,
            effect: 0,
            effectParam: 0,
          });
        }
        rows.push(row);
      }
      patterns.push({ rows });
    }

    return {
      type: 'MOD',
      title: 'Untitled',
      instruments,
      patterns,
      sequence: [0, 1, 2, 3],
      channels: 4,
      defaultBpm: 125,
      defaultSpeed: 6,
      rowsPerPattern: ROWS_PER_PATTERN,
      linearFrequencies: false,
    };
  }

  function handleNewModule() {
    mod = createEmptyModule();
    currentOrderIndex = 0;
    initPlayer();
    selectedInstrument = 1;
    selectedChannel = 0;
    selectedRow = 0;
    renderAll();
    enableControls();
  }

  // ─── File loading ───

  async function handleLoadMod(file: File) {
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
    } catch (err) {
      console.error('[ChiptuneTracker] Failed to parse module:', err);
    }
  }

  function initPlayer() {
    player?.cleanup();
    player = new ChiptunePlayer();
    player.loadModule(mod!);
    player.setLooping(isLooping);
    setupPlayerCallbacks();
  }

  function setupPlayerCallbacks() {
    if (!player) return;
    player.onPositionChange = (patternId: number, row: number) => {
      const display = document.getElementById('position-display');
      if (display)
        display.textContent = `Pat: ${String(patternId).padStart(2, '0')} Row: ${String(row).padStart(2, '0')}`;
      if (!mod) return;
      const seq = mod.sequence;
      for (let i = 0; i < seq.length; i++) {
        const idx = (currentOrderIndex + i) % seq.length;
        if (seq[idx] === patternId) {
          currentOrderIndex = idx;
          break;
        }
      }
      renderPatternOrder();
      highlightActiveRow(row);
    };
    player.onChannelActivity = () => {};
  }

  // ─── MOD Export ───

  function handleExportMod() {
    if (!mod) return;
    const blob = serializeMod(mod);
    const ext = mod.type === 'XM' ? 'xm' : mod.type === 'IT' ? 'it' : 'mod';
    downloadFile(blob, `${mod.title || 'untitled'}.${ext}`);
  }

  function serializeMod(m: ModuleFile): Blob {
    if (m.type !== 'MOD') {
      console.warn('[ChiptuneTracker] Export only supports MOD format currently');
    }

    const parts: Uint8Array[] = [];

    // Title (20 bytes)
    const title = new Uint8Array(20);
    const titleBytes = new TextEncoder().encode(m.title.substring(0, 20));
    title.set(titleBytes);
    parts.push(title);

    // 31 samples (30 bytes each)
    for (let i = 0; i < 31; i++) {
      const sample = new Uint8Array(30);
      const inst = m.instruments[i];
      const sampleData = inst?.samples[0];

      if (inst) {
        const nameBytes = new TextEncoder().encode(inst.name.substring(0, 22));
        sample.set(nameBytes);
      }

      if (sampleData) {
        const len = Math.min(sampleData.length, 0xffff);
        sample[22] = (len >> 8) & 0xff;
        sample[23] = len & 0xff;
        sample[24] = sampleData.finetune & 0x0f;
        sample[25] = Math.min(sampleData.volume, 64);
        const loopStart = Math.min(sampleData.loopStart, 0xffff);
        sample[26] = (loopStart >> 8) & 0xff;
        sample[27] = loopStart & 0xff;
        const loopLen = Math.min(sampleData.loopLength, 0xffff);
        sample[28] = (loopLen >> 8) & 0xff;
        sample[29] = loopLen & 0xff;
      }

      parts.push(sample);
    }

    // Song length
    const songLen = new Uint8Array([Math.min(m.sequence.length, 128)]);
    parts.push(songLen);

    // Unused byte
    parts.push(new Uint8Array([0]));

    // Pattern table (128 bytes)
    const patternTable = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      patternTable[i] = i < m.sequence.length ? m.sequence[i] : 0;
    }
    parts.push(patternTable);

    // Format marker
    const marker = new TextEncoder().encode('M.K.');
    parts.push(marker);

    // Pattern data
    const numPatterns = Math.max(...m.sequence) + 1;
    for (let p = 0; p < numPatterns; p++) {
      const pattern = m.patterns[p];
      if (!pattern) continue;
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        for (let ch = 0; ch < m.channels; ch++) {
          const cell = pattern.rows[r]?.[ch];
          if (!cell) {
            parts.push(new Uint8Array([0, 0, 0, 0]));
            continue;
          }

          let period = cell.period || 0;
          if (!period && cell.note && cell.note > 0 && cell.note <= 96) {
            period = calculatePeriod(cell.note);
          }

          const sampleNum = Math.min(cell.instrument || 0, 0x1f);
          const effect = cell.effect || 0;
          const effectParam = cell.effectParam || 0;

          const byte0 = ((sampleNum & 0x10) << 4) | ((period >> 8) & 0x0f);
          const byte1 = period & 0xff;
          const byte2 = ((sampleNum & 0x0f) << 4) | (effect & 0x0f);
          const byte3 = effectParam & 0xff;

          parts.push(new Uint8Array([byte0, byte1, byte2, byte3]));
        }
      }
    }

    // Sample data
    for (let i = 0; i < 31; i++) {
      const inst = m.instruments[i];
      const sampleData = inst?.samples[0];
      if (sampleData && sampleData.data && sampleData.data.length > 0) {
        const len = Math.min(sampleData.length, 0xffff);
        const int8 = new Int8Array(len);
        for (let j = 0; j < len; j++) {
          int8[j] = Math.max(-128, Math.min(127, Math.round(sampleData.data[j] * 127)));
        }
        parts.push(new Uint8Array(int8.buffer));
      }
    }

    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    return new Blob([result], { type: 'audio/x-mod' });
  }

  function calculatePeriod(noteNum: number): number {
    const AMIGA_TABLE = [1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907];
    const noteIdx = (noteNum - 1) % 12;
    const octave = Math.floor((noteNum - 1) / 12);
    let period = AMIGA_TABLE[noteIdx] || 0;
    period = period / Math.pow(2, octave);
    return Math.round(period);
  }

  // ─── Instrument preview ───

  function previewInstrument(instIndex: number) {
    if (!mod || instIndex < 0 || instIndex >= mod.instruments.length) return;
    const inst = mod.instruments[instIndex];
    if (!inst || inst.samples.length === 0) return;
    const sample = inst.samples[0];
    if (!sample.data || sample.data.length === 0) return;

    if (!previewCtx) {
      previewCtx = new AudioContext();
    }
    if (previewCtx.state === 'suspended') previewCtx.resume();

    const buffer = previewCtx.createBuffer(1, sample.data.length, previewCtx.sampleRate);
    buffer.getChannelData(0).set(sample.data);

    const source = previewCtx.createBufferSource();
    source.buffer = buffer;

    if (sample.loopLength > 2) {
      source.loop = true;
      source.loopStart = sample.loopStart / previewCtx.sampleRate;
      source.loopEnd = (sample.loopStart + sample.loopLength) / previewCtx.sampleRate;
    }

    const targetFreq = noteToFrequency(selectedNote, selectedOctave);
    const baseFreq = noteToFrequency('C', 4);
    source.playbackRate.value = targetFreq / baseFreq;

    const gain = previewCtx.createGain();
    gain.gain.setValueAtTime(0.4, previewCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, previewCtx.currentTime + 0.8);

    source.connect(gain);
    gain.connect(previewCtx.destination);

    source.start();
    source.stop(previewCtx.currentTime + 0.8);
  }

  // ─── Playback ───

  function togglePlay() {
    if (!player || !mod) return;
    if (isPlaying) {
      player.pause();
      isPlaying = false;
    } else {
      player.play();
      isPlaying = true;
    }
    updatePlayButton();
  }

  function stopPlayback() {
    if (!player) return;
    player.stop();
    isPlaying = false;
    updatePlayButton();
    const display = document.getElementById('position-display');
    if (display) display.textContent = 'Pat: 00 Row: 00';
    highlightActiveRow(0);
  }

  function toggleLoop() {
    isLooping = !isLooping;
    player?.setLooping(isLooping);
    const btn = document.getElementById('btn-loop');
    btn?.classList.toggle('btn-active', isLooping);
  }

  function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    if (btn) {
      btn.innerHTML = isPlaying
        ? '<i data-lucide="pause" class="w-4 h-4"></i>'
        : '<i data-lucide="play" class="w-4 h-4"></i>';
    }
  }

  // ─── Note placement ───

  function placeNoteInCell() {
    if (!mod) return;
    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const noteNum = noteNameToNumber(selectedNote, selectedOctave);
    if (noteNum < 1 || noteNum > 96) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    cell.note = noteNum;
    cell.instrument = selectedInstrument;
    cell.volume = selectedVolume > 0 ? selectedVolume : null;
    cell.period = calculatePeriod(noteNum);

    renderTrackerGrid();
    highlightSelectedCell();

    previewInstrument(selectedInstrument - 1);

    selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
    highlightSelectedCell();
    scrollSelectedRowIntoView();
  }

  function clearCell() {
    if (!mod) return;
    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    cell.note = null;
    cell.period = null;
    cell.instrument = 0;
    cell.volume = null;
    cell.effect = 0;
    cell.effectParam = 0;

    renderTrackerGrid();
    highlightSelectedCell();
  }

  function copyCell() {
    if (!mod) return;
    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    clipboard = {
      note: cell.note,
      instrument: cell.instrument,
      volume: cell.volume,
    };
  }

  function pasteCell() {
    if (!mod || !clipboard) return;
    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    cell.note = clipboard.note;
    cell.instrument = clipboard.instrument;
    cell.volume = clipboard.volume;

    if (clipboard.note && clipboard.note > 0) {
      cell.period = calculatePeriod(clipboard.note);
    }

    renderTrackerGrid();
    highlightSelectedCell();
  }

  // ─── Pattern management ───

  function getCurrentPatternIdx(): number {
    if (!mod) return 0;
    return mod.sequence[currentOrderIndex] ?? 0;
  }

  function addPattern() {
    if (!mod) return;
    const newId = mod.patterns.length;
    const rows: {
      note: number | null;
      period: number | null;
      instrument: number;
      volume: number | null;
      volumeColumn: number | null;
      effect: number;
      effectParam: number;
    }[][] = [];
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      const row: {
        note: number | null;
        period: number | null;
        instrument: number;
        volume: number | null;
        volumeColumn: number | null;
        effect: number;
        effectParam: number;
      }[] = [];
      for (let c = 0; c < mod.channels; c++) {
        row.push({
          note: null,
          period: null,
          instrument: 0,
          volume: null,
          volumeColumn: null,
          effect: 0,
          effectParam: 0,
        });
      }
      rows.push(row);
    }
    mod.patterns.push({ rows });
    mod.sequence.push(newId);
    renderPatternOrder();
    renderModuleInfo();
  }

  function removePattern() {
    if (!mod || mod.sequence.length <= 1) return;
    mod.sequence.pop();
    renderPatternOrder();
    renderModuleInfo();
  }

  // ─── Rendering ───

  function renderAll() {
    renderModuleInfo();
    renderPatternOrder();
    renderTrackerGrid();
    renderInstrumentList();
    updateBpmSpeedDisplay();
  }

  function enableControls() {
    const ids = ['btn-play', 'btn-stop', 'btn-loop', 'btn-export-mod'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) (el as HTMLButtonElement).disabled = false;
    });
  }

  function renderModuleInfo() {
    if (!mod) return;
    const info = document.getElementById('mod-info');
    info?.classList.remove('hidden');

    const formatEl = document.getElementById('mod-format');
    const titleEl = document.getElementById('mod-title');
    const chEl = document.getElementById('mod-channels');
    const patEl = document.getElementById('mod-patterns');
    const instEl = document.getElementById('mod-instruments');
    const bpmEl = document.getElementById('mod-bpm');
    const speedEl = document.getElementById('mod-speed');

    if (formatEl) formatEl.textContent = mod.type;
    if (titleEl) titleEl.textContent = mod.title || 'Untitled';
    if (chEl) chEl.textContent = String(mod.channels);
    if (patEl) patEl.textContent = String(mod.patterns.length);
    if (instEl)
      instEl.textContent = String(mod.instruments.filter((i) => i.samples.length > 0).length);
    if (bpmEl) bpmEl.textContent = String(mod.defaultBpm);
    if (speedEl) speedEl.textContent = String(mod.defaultSpeed);
  }

  function updateBpmSpeedDisplay() {
    if (!mod) return;
    const bpmDisplay = document.getElementById('bpm-display');
    const speedDisplay = document.getElementById('speed-display');
    const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement;
    const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;

    if (bpmDisplay) bpmDisplay.textContent = String(mod.defaultBpm);
    if (speedDisplay) speedDisplay.textContent = String(mod.defaultSpeed);
    if (bpmSlider) bpmSlider.value = String(mod.defaultBpm);
    if (speedSlider) speedSlider.value = String(mod.defaultSpeed);
  }

  function renderPatternOrder() {
    if (!mod) return;
    const container = document.getElementById('pattern-order');
    if (!container) return;
    container.innerHTML = '';

    mod.sequence.forEach((patternId, idx) => {
      const btn = document.createElement('button');
      btn.className = `btn btn-xs w-auto mb-1 sm:mb-0 sm:mr-1 ${idx === currentOrderIndex ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = String(patternId).padStart(2, '0');
      btn.addEventListener('click', () => {
        currentOrderIndex = idx;
        renderPatternOrder();
        renderTrackerGrid();
      });
      container.appendChild(btn);
    });
  }

  function renderChannelHeader() {
    const thead = document.getElementById('tracker-header');
    if (!thead) return;
    thead.innerHTML = '';
    if (!mod) return;

    const tr = document.createElement('tr');
    tr.className = 'text-xs';

    const rowTh = document.createElement('th');
    rowTh.className = 'w-8 text-center sticky left-0 bg-base-200 z-10';
    rowTh.textContent = '#';
    tr.appendChild(rowTh);

    for (let ch = 0; ch < mod.channels; ch++) {
      const noteTh = document.createElement('th');
      noteTh.className = 'text-center';
      noteTh.textContent = `Ch${ch + 1}`;
      tr.appendChild(noteTh);

      const insTh = document.createElement('th');
      insTh.className = 'text-center';
      insTh.textContent = 'Ins';
      tr.appendChild(insTh);

      const volTh = document.createElement('th');
      volTh.className = 'text-center';
      volTh.textContent = 'Vol';
      tr.appendChild(volTh);
    }

    thead.appendChild(tr);
  }

  function renderTrackerGrid() {
    if (!mod) return;
    const tbody = document.getElementById('tracker-grid');
    if (!tbody) return;
    tbody.innerHTML = '';

    renderChannelHeader();

    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern) return;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-row', String(row));

      const rowNum = document.createElement('td');
      rowNum.className = 'tracker-cell row-num text-base-content/50 sticky left-0 bg-base-200 z-10';
      rowNum.textContent = String(row).padStart(2, '0');
      tr.appendChild(rowNum);

      for (let ch = 0; ch < mod.channels; ch++) {
        const cell = pattern.rows[row]?.[ch];

        // Note cell
        const noteTd = document.createElement('td');
        noteTd.className = 'tracker-cell note-cell';
        noteTd.setAttribute('data-channel', String(ch));
        noteTd.setAttribute('data-row', String(row));
        noteTd.setAttribute('data-type', 'note');
        noteTd.addEventListener('click', () => selectCell(ch, row));

        if (cell?.note && cell.note > 0 && cell.note <= 96) {
          const noteStr = formatNote(cell.note);
          noteTd.textContent = noteStr;
          noteTd.classList.remove('empty');
          if (cell.instrument > 0) {
            noteTd.classList.add('text-primary');
          }
        } else if (cell?.note === 97) {
          noteTd.textContent = '^^^';
          noteTd.classList.remove('empty');
        } else {
          noteTd.textContent = '---';
          noteTd.classList.add('empty');
        }
        tr.appendChild(noteTd);

        // Instrument cell
        const insTd = document.createElement('td');
        insTd.className = 'tracker-cell';
        insTd.setAttribute('data-channel', String(ch));
        insTd.setAttribute('data-row', String(row));
        insTd.setAttribute('data-type', 'ins');
        insTd.addEventListener('click', () => selectCell(ch, row));
        if (cell?.instrument && cell.instrument > 0) {
          insTd.textContent = String(cell.instrument).padStart(2, ' ');
          insTd.classList.remove('empty');
        } else {
          insTd.textContent = '--';
          insTd.classList.add('empty');
        }
        tr.appendChild(insTd);

        // Volume cell
        const volTd = document.createElement('td');
        volTd.className = 'tracker-cell';
        volTd.setAttribute('data-channel', String(ch));
        volTd.setAttribute('data-row', String(row));
        volTd.setAttribute('data-type', 'volume');
        volTd.addEventListener('click', () => selectCell(ch, row));
        if (cell?.volume != null && cell.volume > 0) {
          volTd.textContent = String(cell.volume).padStart(2, ' ');
          volTd.classList.remove('empty');
        } else {
          volTd.textContent = '--';
          volTd.classList.add('empty');
        }
        tr.appendChild(volTd);
      }

      tbody.appendChild(tr);
    }

    highlightSelectedCell();
  }

  function selectCell(channel: number, row: number) {
    selectedChannel = channel;
    selectedRow = row;
    highlightSelectedCell();
    scrollSelectedRowIntoView();
  }

  function scrollSelectedRowIntoView() {
    const row = document.querySelector(`#tracker-grid tr[data-row="${selectedRow}"]`);
    row?.scrollIntoView({ block: 'start' });
  }

  function highlightSelectedCell() {
    document
      .querySelectorAll('.tracker-cell.selected')
      .forEach((c) => c.classList.remove('selected'));
    document
      .querySelectorAll(
        `.tracker-cell[data-channel="${selectedChannel}"][data-row="${selectedRow}"]`
      )
      .forEach((c) => c.classList.add('selected'));
  }

  function highlightActiveRow(row: number) {
    document
      .querySelectorAll('#tracker-grid tr.active-row')
      .forEach((r) => r.classList.remove('active-row'));
    const currentRow = document.querySelector(`#tracker-grid tr[data-row="${row}"]`);
    if (currentRow) currentRow.classList.add('active-row');
  }

  function renderInstrumentList() {
    if (!mod) return;
    const container = document.getElementById('instrument-list');
    const countEl = document.getElementById('inst-count');
    if (!container) return;
    container.innerHTML = '';

    const activeInstruments = mod.instruments
      .map((inst, idx) => ({ inst, idx }))
      .filter(({ inst }) => inst.samples.length > 0 || inst.name);

    if (countEl) countEl.textContent = `${activeInstruments.length}`;

    activeInstruments.forEach(({ inst, idx }) => {
      const num = idx + 1;
      const sample = inst.samples[0];
      const size =
        sample?.data && sample.data.length > 0 ? `${Math.round(sample.data.length / 1024)}K` : '-';
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
        previewInstrument(idx);
      });
      container.appendChild(row);
    });
  }

  // ─── UI selection updates ───

  function updateNoteSelection() {
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

  function updateOctaveSelection() {
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

  function setupEventListeners() {
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

    btnAddPattern.addEventListener('click', addPattern);
    btnRemovePattern.addEventListener('click', removePattern);
    btnClearCell.addEventListener('click', clearCell);
    btnCopyCell.addEventListener('click', copyCell);
    btnPasteCell.addEventListener('click', pasteCell);
    btnPreviewInst.addEventListener('click', () => {
      previewInstrument(selectedInstrument - 1);
    });

    volumeSlider.addEventListener('input', () => {
      selectedVolume = parseInt(volumeSlider.value);
      const display = document.getElementById('volume-display');
      if (display) display.textContent = String(selectedVolume);
    });

    // Note buttons
    document.querySelectorAll('.note-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const note = btn.getAttribute('data-note');
        if (note) {
          selectedNote = note;
          updateNoteSelection();
          placeNoteInCell();
        }
      });
    });

    // Octave buttons
    document.querySelectorAll('.octave-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const octave = btn.getAttribute('data-octave');
        if (octave) {
          selectedOctave = parseInt(octave);
          updateOctaveSelection();
        }
      });
    });

    // Keyboard input
    const onKeyDown = (e: KeyboardEvent) => {
      if (!mod) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedRow = Math.max(0, selectedRow - 1);
        highlightSelectedCell();
        scrollSelectedRowIntoView();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        highlightSelectedCell();
        scrollSelectedRowIntoView();
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
        selectedChannel = Math.min(mod.channels - 1, selectedChannel + 1);
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
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }
}
