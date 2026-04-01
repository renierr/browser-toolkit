import { ChiptunePlayer } from '../../js/chiptune/player';
import { parseModule } from '../../js/chiptune/parser';
import type { ModuleFile, Instrument as ModInstrument, Note } from '../../js/chiptune/types';
import { downloadFile } from '../../js/file-utils';
import type { SharedFilesPayload } from '../../js/share-target';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROWS_PER_PATTERN = 64;

type ClipboardCell = {
  note: number | null;
  instrument: number;
  volume: number | null;
  effect: number;
  effectParam: number;
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
  let selectedCol: 'note' | 'ins' | 'vol' | 'effect' | 'param' = 'note';
  let clipboard: ClipboardCell | null = null;
  let isPlaying = false;
  let isLooping = true;
  let currentOrderIndex = 0;
  let previewCtx: AudioContext | null = null;
  let activeRow = -1;
  let orderDragIndex: number | null = null;
  let orderDragOverIndex: number | null = null;

  const viewport = document.getElementById('tracker-viewport');

  setupEventListeners();
  updateNoteSelection();
  updateOctaveSelection();
  renderPianoKeys();

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

  function formatNoteCompact(noteNum: number | null): string {
    if (!noteNum || noteNum === 97) return noteNum === 97 ? '^^^' : '---';
    const info = noteNumberToName(noteNum);
    if (!info) return '---';
    return `${info.note.padEnd(2, '-')}${info.octave}`;
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
      const rows: Note[][] = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const row: Note[] = [];
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
        renderTrackerGrid();
        renderPatternOrder();
      }
      activeRow = row;
      highlightActiveRow(row);
      scrollToActiveRow(row);
    };
    player.onChannelActivity = () => {};
  }

  // ─── MOD Export (Fixed) ───

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
        // MOD stores lengths in WORDS (2-byte units), big-endian
        const lenWords = Math.min(Math.floor(sampleData.length / 2), 0xffff);
        sample[22] = (lenWords >> 8) & 0xff;
        sample[23] = lenWords & 0xff;
        sample[24] = sampleData.finetune & 0x0f;
        sample[25] = Math.min(sampleData.volume, 64);
        // Loop start/length also in words
        const loopStartWords = Math.min(Math.floor(sampleData.loopStart / 2), 0xffff);
        sample[26] = (loopStartWords >> 8) & 0xff;
        sample[27] = loopStartWords & 0xff;
        const loopLenWords = Math.min(Math.floor(sampleData.loopLength / 2), 0xffff);
        sample[28] = (loopLenWords >> 8) & 0xff;
        sample[29] = loopLenWords & 0xff;
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

    // Sample data (must be word-aligned)
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
        // Word-align: pad to even length
        if (len % 2 !== 0) {
          parts.push(new Uint8Array([0]));
        }
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
    activeRow = -1;
    updatePlayButton();
    const display = document.getElementById('position-display');
    if (display) display.textContent = '00:00';
    currentOrderIndex = 0;
    renderTrackerGrid();
    renderPatternOrder();
    highlightActiveRow(-1);
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
        ? '<i data-lucide="pause" class="w-3.5 h-3.5"></i>'
        : '<i data-lucide="play" class="w-3.5 h-3.5"></i>';
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
      effect: cell.effect,
      effectParam: cell.effectParam,
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
    cell.effect = clipboard.effect;
    cell.effectParam = clipboard.effectParam;

    if (clipboard.note && clipboard.note > 0) {
      cell.period = calculatePeriod(clipboard.note);
    }

    renderTrackerGrid();
    highlightSelectedCell();
  }

  function applyEffect() {
    if (!mod) return;
    const effectInput = document.getElementById('effect-input') as HTMLInputElement;
    const paramInput = document.getElementById('effect-param-input') as HTMLInputElement;

    const effectHex = parseInt(effectInput.value || '0', 16);
    const paramHex = parseInt(paramInput.value || '0', 16);

    if (isNaN(effectHex) || isNaN(paramHex)) return;

    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern || !pattern.rows[selectedRow]) return;

    const cell = pattern.rows[selectedRow][selectedChannel];
    if (!cell) return;

    cell.effect = effectHex & 0x0f;
    cell.effectParam = paramHex & 0xff;

    renderTrackerGrid();
    highlightSelectedCell();
  }

  // ─── Pattern management ───

  function getCurrentPatternIdx(): number {
    if (!mod) return 0;
    return mod.sequence[currentOrderIndex] ?? 0;
  }

  function removePattern() {
    if (!mod || mod.sequence.length <= 1) return;
    mod.sequence.splice(currentOrderIndex, 1);
    if (currentOrderIndex >= mod.sequence.length) {
      currentOrderIndex = mod.sequence.length - 1;
    }
    renderPatternOrder();
    renderModuleInfo();
    renderTrackerGrid();
  }

  function insertPatternAt(index: number) {
    if (!mod) return;
    const newId = mod.patterns.length;
    const rows: Note[][] = [];
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      const row: Note[] = [];
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
    mod.sequence.splice(index, 0, newId);
    currentOrderIndex = index;
    renderPatternOrder();
    renderModuleInfo();
    renderTrackerGrid();
  }

  function duplicatePatternAt(index: number) {
    if (!mod) return;
    const srcPatternId = mod.sequence[index];
    const srcPattern = mod.patterns[srcPatternId];
    if (!srcPattern) return;

    const newId = mod.patterns.length;
    const rows: Note[][] = srcPattern.rows.map((row) => row.map((cell) => ({ ...cell })));
    mod.patterns.push({ rows });
    mod.sequence.splice(index + 1, 0, newId);
    currentOrderIndex = index + 1;
    renderPatternOrder();
    renderModuleInfo();
    renderTrackerGrid();
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

  // ─── Pattern Order with Drag-Drop ───

  function renderPatternOrder() {
    if (!mod) return;
    const container = document.getElementById('pattern-order');
    if (!container) return;
    container.innerHTML = '';

    mod.sequence.forEach((patternId, idx) => {
      const item = document.createElement('div');
      const isActive = idx === currentOrderIndex;
      const hasContent = patternHasContent(patternId);

      item.className = `order-item flex items-center justify-between px-1 py-0.5 rounded text-[10px] font-mono ${isActive ? 'active' : 'bg-base-300'} ${orderDragOverIndex === idx ? 'drag-over' : ''}`;
      item.setAttribute('data-order-idx', String(idx));
      item.setAttribute('draggable', 'true');

      item.innerHTML = `
        <span class="font-bold">${String(patternId).padStart(2, '0')}</span>
        <span class="opacity-40 text-[8px]">${hasContent ? '*' : ''}</span>
      `;

      item.addEventListener('click', () => {
        currentOrderIndex = idx;
        renderPatternOrder();
        renderTrackerGrid();
      });

      item.addEventListener('dblclick', () => {
        duplicatePatternAt(idx);
      });

      // Drag events
      item.addEventListener('dragstart', (e) => {
        orderDragIndex = idx;
        item.classList.add('dragging');
        (e as DragEvent).dataTransfer?.setData('text/plain', String(idx));
        (e as DragEvent).dataTransfer!.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        orderDragIndex = null;
        orderDragOverIndex = null;
        item.classList.remove('dragging');
        renderPatternOrder();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        (e as DragEvent).dataTransfer!.dropEffect = 'move';
        if (orderDragIndex !== null && orderDragIndex !== idx) {
          orderDragOverIndex = idx;
          renderPatternOrder();
        }
      });

      item.addEventListener('dragleave', () => {
        if (orderDragOverIndex === idx) {
          orderDragOverIndex = null;
          renderPatternOrder();
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (orderDragIndex === null || orderDragIndex === idx) return;
        if (!mod) return;

        const fromIdx = orderDragIndex;
        const toIdx = idx;
        const [moved] = mod.sequence.splice(fromIdx, 1);
        mod.sequence.splice(toIdx, 0, moved);

        if (currentOrderIndex === fromIdx) {
          currentOrderIndex = toIdx;
        } else if (fromIdx < currentOrderIndex && toIdx >= currentOrderIndex) {
          currentOrderIndex--;
        } else if (fromIdx > currentOrderIndex && toIdx <= currentOrderIndex) {
          currentOrderIndex++;
        }

        orderDragIndex = null;
        orderDragOverIndex = null;
        renderPatternOrder();
        renderTrackerGrid();
      });

      container.appendChild(item);
    });

    // Scroll active item into view
    const activeItem = container.querySelector('.order-item.active');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }

  function patternHasContent(patternId: number): boolean {
    if (!mod) return false;
    const pattern = mod.patterns[patternId];
    if (!pattern) return false;
    for (const row of pattern.rows) {
      for (const cell of row) {
        if (cell.note || cell.instrument || cell.effect) return true;
      }
    }
    return false;
  }

  // ─── Tracker Grid Header ───

  function renderChannelHeader() {
    const thead = document.getElementById('tracker-header');
    if (!thead) return;
    thead.innerHTML = '';
    if (!mod) return;

    const tr = document.createElement('tr');
    tr.className = 'text-[9px] bg-base-300';

    const rowTh = document.createElement('th');
    rowTh.className = 'row-num sticky left-0 bg-base-300 z-10';
    rowTh.textContent = '#';
    tr.appendChild(rowTh);

    for (let ch = 0; ch < mod.channels; ch++) {
      if (ch > 0) {
        const sep = document.createElement('th');
        sep.className = 'ch-sep';
        tr.appendChild(sep);
      }

      const noteTh = document.createElement('th');
      noteTh.className = 'text-center';
      noteTh.textContent = 'Note';
      tr.appendChild(noteTh);

      const insTh = document.createElement('th');
      insTh.className = 'text-center';
      insTh.textContent = 'Ins';
      tr.appendChild(insTh);

      const volTh = document.createElement('th');
      volTh.className = 'text-center';
      volTh.textContent = 'Vol';
      tr.appendChild(volTh);

      const effTh = document.createElement('th');
      effTh.className = 'text-center';
      effTh.textContent = 'Eff';
      tr.appendChild(effTh);

      const paramTh = document.createElement('th');
      paramTh.className = 'text-center';
      paramTh.textContent = 'Prm';
      tr.appendChild(paramTh);
    }

    thead.appendChild(tr);
  }

  // ─── Tracker Grid (Virtual Scrolling) ───

  function renderTrackerGrid() {
    if (!mod) return;
    const tbody = document.getElementById('tracker-grid');
    if (!tbody) return;
    tbody.innerHTML = '';

    renderChannelHeader();

    const patternIdx = getCurrentPatternIdx();
    const pattern = mod.patterns[patternIdx];
    if (!pattern) return;

    // Render all rows (64 is small enough for full render)
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-row', String(row));

      // Beat row highlighting
      if (row % 4 === 0) {
        tr.classList.add('beat-row');
      }

      // Active row (playback cursor)
      if (row === activeRow && isPlaying) {
        tr.classList.add('current-row');
      }

      // Selected row
      if (row === selectedRow) {
        tr.classList.add('active-row');
      }

      // Row number
      const rowNum = document.createElement('td');
      rowNum.className = 'row-num sticky left-0 bg-base-200 z-10';
      rowNum.textContent = String(row).padStart(2, '0');
      tr.appendChild(rowNum);

      for (let ch = 0; ch < mod.channels; ch++) {
        if (ch > 0) {
          const sep = document.createElement('td');
          sep.className = 'ch-sep';
          tr.appendChild(sep);
        }

        const cell = pattern.rows[row]?.[ch];

        // Note cell
        const noteTd = document.createElement('td');
        noteTd.className = 'tracker-cell note-cell';
        noteTd.setAttribute('data-channel', String(ch));
        noteTd.setAttribute('data-row', String(row));
        noteTd.setAttribute('data-col', 'note');
        noteTd.addEventListener('click', () => selectCell(ch, row, 'note'));

        if (cell?.note === 97) {
          noteTd.textContent = '^^^';
          noteTd.classList.add('has-off');
        } else if (cell?.note && cell.note > 0 && cell.note <= 96) {
          noteTd.textContent = formatNoteCompact(cell.note);
          noteTd.classList.add('has-note');
        } else {
          noteTd.textContent = '---';
          noteTd.classList.add('empty-cell');
        }
        tr.appendChild(noteTd);

        // Instrument cell
        const insTd = document.createElement('td');
        insTd.className = 'tracker-cell';
        insTd.setAttribute('data-channel', String(ch));
        insTd.setAttribute('data-row', String(row));
        insTd.setAttribute('data-col', 'ins');
        insTd.addEventListener('click', () => selectCell(ch, row, 'ins'));
        if (cell?.instrument && cell.instrument > 0) {
          insTd.textContent = String(cell.instrument).padStart(2, ' ');
        } else {
          insTd.textContent = '--';
          insTd.classList.add('empty-cell');
        }
        tr.appendChild(insTd);

        // Volume cell
        const volTd = document.createElement('td');
        volTd.className = 'tracker-cell';
        volTd.setAttribute('data-channel', String(ch));
        volTd.setAttribute('data-row', String(row));
        volTd.setAttribute('data-col', 'vol');
        volTd.addEventListener('click', () => selectCell(ch, row, 'vol'));
        if (cell?.volume != null && cell.volume > 0) {
          volTd.textContent = String(cell.volume).padStart(2, ' ');
        } else {
          volTd.textContent = '--';
          volTd.classList.add('empty-cell');
        }
        tr.appendChild(volTd);

        // Effect cell
        const effTd = document.createElement('td');
        effTd.className = 'tracker-cell effect-cell';
        effTd.setAttribute('data-channel', String(ch));
        effTd.setAttribute('data-row', String(row));
        effTd.setAttribute('data-col', 'effect');
        effTd.addEventListener('click', () => selectCell(ch, row, 'effect'));
        if (cell?.effect) {
          effTd.textContent = cell.effect.toString(16).toUpperCase();
        } else {
          effTd.textContent = '.';
          effTd.classList.add('empty-cell');
        }
        tr.appendChild(effTd);

        // Effect param cell
        const paramTd = document.createElement('td');
        paramTd.className = 'tracker-cell effect-cell';
        paramTd.setAttribute('data-channel', String(ch));
        paramTd.setAttribute('data-row', String(row));
        paramTd.setAttribute('data-col', 'param');
        paramTd.addEventListener('click', () => selectCell(ch, row, 'param'));
        if (cell?.effectParam) {
          paramTd.textContent = cell.effectParam.toString(16).toUpperCase().padStart(2, '0');
        } else {
          paramTd.textContent = '..';
          paramTd.classList.add('empty-cell');
        }
        tr.appendChild(paramTd);
      }

      tbody.appendChild(tr);
    }

    highlightSelectedCell();
  }

  function selectCell(
    channel: number,
    row: number,
    col: 'note' | 'ins' | 'vol' | 'effect' | 'param'
  ) {
    selectedChannel = channel;
    selectedRow = row;
    selectedCol = col;
    highlightSelectedCell();
    scrollSelectedRowIntoView();

    // Update effect input if clicking effect column
    if (col === 'effect' || col === 'param') {
      const patternIdx = getCurrentPatternIdx();
      const pattern = mod?.patterns[patternIdx];
      const cell = pattern?.rows[row]?.[channel];
      if (cell) {
        const effectInput = document.getElementById('effect-input') as HTMLInputElement;
        const paramInput = document.getElementById('effect-param-input') as HTMLInputElement;
        if (effectInput)
          effectInput.value = cell.effect ? cell.effect.toString(16).toUpperCase() : '';
        if (paramInput)
          paramInput.value = cell.effectParam
            ? cell.effectParam.toString(16).toUpperCase().padStart(2, '0')
            : '';
      }
    }
  }

  function scrollSelectedRowIntoView() {
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const rowEl = document.querySelector(
      `#tracker-grid tr[data-row="${selectedRow}"]`
    ) as HTMLElement;
    if (!rowEl) return;

    const rowRect = rowEl.getBoundingClientRect();
    const containerTop = viewportRect.top + viewport.scrollTop;
    const rowTop = rowRect.top + viewport.scrollTop;
    const centerOffset = viewportRect.height / 2;

    const targetScroll = rowTop - containerTop - centerOffset + rowRect.height / 2;
    viewport.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }

  function scrollToActiveRow(row: number) {
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const rowEl = document.querySelector(`#tracker-grid tr[data-row="${row}"]`) as HTMLElement;
    if (!rowEl) return;

    const rowRect = rowEl.getBoundingClientRect();
    const containerTop = viewportRect.top + viewport.scrollTop;
    const rowTop = rowRect.top + viewport.scrollTop;
    const centerOffset = viewportRect.height / 2;

    const targetScroll = rowTop - containerTop - centerOffset + rowRect.height / 2;

    // Only scroll if row is near edges
    const currentScroll = viewport.scrollTop;
    const diff = Math.abs(targetScroll - currentScroll);
    if (diff > viewportRect.height * 0.3) {
      viewport.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  }

  function highlightSelectedCell() {
    document
      .querySelectorAll('.tracker-cell.selected')
      .forEach((c) => c.classList.remove('selected'));

    document
      .querySelectorAll(
        `.tracker-cell[data-channel="${selectedChannel}"][data-row="${selectedRow}"][data-col="${selectedCol}"]`
      )
      .forEach((c) => c.classList.add('selected'));
  }

  function highlightActiveRow(row: number) {
    document
      .querySelectorAll('#tracker-grid tr.current-row')
      .forEach((r) => r.classList.remove('current-row'));
    if (row >= 0) {
      const currentRow = document.querySelector(`#tracker-grid tr[data-row="${row}"]`);
      if (currentRow) currentRow.classList.add('current-row');
    }
  }

  // ─── Piano Keys ───

  function renderPianoKeys() {
    const container = document.getElementById('piano-keys');
    if (!container) return;
    container.innerHTML = '';

    const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackNotes: { note: string; after: string }[] = [
      { note: 'C#', after: 'C' },
      { note: 'D#', after: 'D' },
      { note: 'F#', after: 'F' },
      { note: 'G#', after: 'G' },
      { note: 'A#', after: 'A' },
    ];

    let whiteIdx = 0;
    for (const note of whiteNotes) {
      const key = document.createElement('div');
      key.className = `piano-key white ${note === selectedNote ? 'active' : ''}`;
      key.setAttribute('data-note', note);
      key.textContent = note;
      key.style.display = 'flex';
      key.style.alignItems = 'flex-end';
      key.style.justifyContent = 'center';
      key.style.fontSize = '8px';
      key.style.paddingBottom = '2px';

      key.addEventListener('click', () => {
        selectedNote = note;
        updateNoteSelection();
        renderPianoKeys();
        previewInstrument(selectedInstrument - 1);
      });

      container.appendChild(key);
      whiteIdx++;

      // Add black key after this white key if applicable
      const blackKey = blackNotes.find((b) => b.after === note);
      if (blackKey) {
        const bKey = document.createElement('div');
        bKey.className = `piano-key black ${blackKey.note === selectedNote ? 'active' : ''}`;
        bKey.setAttribute('data-note', blackKey.note);
        bKey.textContent = blackKey.note.replace('#', '');
        bKey.style.display = 'flex';
        bKey.style.alignItems = 'flex-end';
        bKey.style.justifyContent = 'center';
        bKey.style.fontSize = '7px';
        bKey.style.paddingBottom = '1px';
        bKey.style.color = 'var(--color-base-100)';

        bKey.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedNote = blackKey.note;
          updateNoteSelection();
          renderPianoKeys();
          previewInstrument(selectedInstrument - 1);
        });

        container.appendChild(bKey);
      }
    }
  }

  // ─── Instrument List ───

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

    btnAddPattern.addEventListener('click', () => insertPatternAt(currentOrderIndex + 1));
    btnRemovePattern.addEventListener('click', removePattern);
    btnClearCell.addEventListener('click', clearCell);
    btnCopyCell.addEventListener('click', copyCell);
    btnPasteCell.addEventListener('click', pasteCell);
    btnPreviewInst.addEventListener('click', () => {
      previewInstrument(selectedInstrument - 1);
    });
    btnApplyEffect.addEventListener('click', applyEffect);

    volumeSlider.addEventListener('input', () => {
      selectedVolume = parseInt(volumeSlider.value);
      const display = document.getElementById('volume-display');
      if (display) display.textContent = String(selectedVolume);
    });

    // Effect input: auto-apply on Enter
    effectInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyEffect();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        renderTrackerGrid();
        highlightSelectedCell();
        scrollSelectedRowIntoView();
      }
    });

    effectParamInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyEffect();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 1);
        renderTrackerGrid();
        highlightSelectedCell();
        scrollSelectedRowIntoView();
      }
    });

    // Note buttons
    document.querySelectorAll('.note-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const note = btn.getAttribute('data-note');
        if (note) {
          selectedNote = note;
          updateNoteSelection();
          renderPianoKeys();
          previewInstrument(selectedInstrument - 1);
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

      // Don't intercept if typing in effect inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target.id !== 'volume-slider') return;

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
        if (selectedCol === 'param') selectedCol = 'effect';
        else if (selectedCol === 'effect') selectedCol = 'vol';
        else if (selectedCol === 'vol') selectedCol = 'ins';
        else if (selectedCol === 'ins') selectedCol = 'note';
        else if (selectedCol === 'note') selectedChannel = Math.max(0, selectedChannel - 1);
        highlightSelectedCell();
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
        highlightSelectedCell();
        return;
      }

      // Tab to move between columns
      if (e.key === 'Tab') {
        e.preventDefault();
        const cols: ('note' | 'ins' | 'vol' | 'effect' | 'param')[] = [
          'note',
          'ins',
          'vol',
          'effect',
          'param',
        ];
        const currentIdx = cols.indexOf(selectedCol);
        if (e.shiftKey) {
          selectedCol = cols[(currentIdx - 1 + cols.length) % cols.length];
        } else {
          selectedCol = cols[(currentIdx + 1) % cols.length];
        }
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

      // Q/W for octave up/down
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        selectedOctave = Math.min(6, selectedOctave + 1);
        updateOctaveSelection();
        return;
      }
      if (e.key === 'a' && !noteMap['a']) {
        // 'a' is not in noteMap, use for octave down
        e.preventDefault();
        selectedOctave = Math.max(1, selectedOctave - 1);
        updateOctaveSelection();
        return;
      }

      // Home/End for first/last row
      if (e.key === 'Home') {
        e.preventDefault();
        selectedRow = 0;
        highlightSelectedCell();
        scrollSelectedRowIntoView();
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        selectedRow = ROWS_PER_PATTERN - 1;
        highlightSelectedCell();
        scrollSelectedRowIntoView();
        return;
      }

      // Page Up/Down
      if (e.key === 'PageUp') {
        e.preventDefault();
        selectedRow = Math.max(0, selectedRow - 8);
        highlightSelectedCell();
        scrollSelectedRowIntoView();
        return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        selectedRow = Math.min(ROWS_PER_PATTERN - 1, selectedRow + 8);
        highlightSelectedCell();
        scrollSelectedRowIntoView();
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }
}
