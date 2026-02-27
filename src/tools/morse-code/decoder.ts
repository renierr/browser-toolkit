import { REVERSE_MORSE_CODE } from './morsecode.ts';

/**
 * Normalize audio data using automatic gain control (AGC)
 * This helps with recordings at different volume levels
 */
function normalizeAudio(data: Float32Array): Float32Array {
  // Find peak value
  let maxAbs = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > maxAbs) maxAbs = abs;
  }

  // Avoid division by zero and don't over-amplify quiet noise
  if (maxAbs < 0.001) return data;

  // Normalize to 0.9 peak
  const normalized = new Float32Array(data.length);
  const scale = 0.9 / maxAbs;
  for (let i = 0; i < data.length; i++) {
    normalized[i] = data[i] * scale;
  }
  return normalized;
}

/**
 * Goertzel algorithm to detect a specific frequency in a signal
 * Returns the magnitude of the specified frequency component
 */
function goertzelMagnitude(data: Float32Array, targetFreq: number, sampleRate: number): number {
  const k = Math.round((data.length * targetFreq) / sampleRate);
  const w = (2 * Math.PI * k) / data.length;
  const cosW = Math.cos(w);
  const coeff = 2 * cosW;

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;

  for (let i = 0; i < data.length; i++) {
    s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }

  // Return magnitude squared
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Detect the dominant tone frequency in the audio (typical CW frequencies: 400-800 Hz)
 */
function detectToneFrequency(data: Float32Array, sampleRate: number): number {
  // Test common CW tone frequencies
  const testFreqs = [400, 500, 600, 700, 800, 1000];
  let maxMag = 0;
  let dominantFreq = 600; // default

  // Use a sample window
  const windowSize = Math.min(8192, data.length);
  const window = data.slice(0, windowSize);

  for (const freq of testFreqs) {
    const mag = goertzelMagnitude(window, freq, sampleRate);
    if (mag > maxMag) {
      maxMag = mag;
      dominantFreq = freq;
    }
  }

  return dominantFreq;
}

/**
 * Apply median filter to remove impulse noise
 */
function medianFilter(envelope: number[], windowSize: number): number[] {
  const result: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < envelope.length; i++) {
    const values: number[] = [];
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < envelope.length) {
        values.push(envelope[idx]);
      }
    }
    values.sort((a, b) => a - b);
    result.push(values[Math.floor(values.length / 2)]);
  }
  return result;
}

/**
 * Apply a simple moving average filter to smooth the signal
 */
function smoothEnvelope(envelope: number[], windowSize: number): number[] {
  const result: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < envelope.length) {
        sum += envelope[idx];
        count++;
      }
    }
    result.push(sum / count);
  }
  return result;
}

/**
 * Apply Schmitt trigger with hysteresis to avoid false transitions on noisy signals
 */
function schmittTrigger(
  envelope: number[],
  highThreshold: number,
  lowThreshold: number
): boolean[] {
  const states: boolean[] = [];
  let currentState = false;

  for (const v of envelope) {
    if (currentState) {
      // Currently ON, turn OFF only if below low threshold
      if (v < lowThreshold) {
        currentState = false;
      }
    } else {
      // Currently OFF, turn ON only if above high threshold
      if (v > highThreshold) {
        currentState = true;
      }
    }
    states.push(currentState);
  }
  return states;
}

/**
 * Debounce the states by removing very short transitions (glitches)
 */
function debounceStates(states: boolean[], minDuration: number): boolean[] {
  if (states.length === 0) return [];

  const result = [...states];

  // Build run-length encoding
  const runs: { state: boolean; start: number; length: number }[] = [];
  let runStart = 0;
  let currentState = states[0];

  for (let i = 1; i <= states.length; i++) {
    if (i === states.length || states[i] !== currentState) {
      runs.push({ state: currentState, start: runStart, length: i - runStart });
      if (i < states.length) {
        currentState = states[i];
        runStart = i;
      }
    }
  }

  // Remove short runs by merging with neighbors
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].length < minDuration) {
      // Determine what to replace with - look at surrounding runs
      const prevState = i > 0 ? runs[i - 1].state : runs[i].state;
      const nextState = i < runs.length - 1 ? runs[i + 1].state : runs[i].state;

      // If both neighbors agree, use their state; otherwise keep original
      const newState = prevState === nextState ? prevState : runs[i].state;

      for (let j = runs[i].start; j < runs[i].start + runs[i].length; j++) {
        result[j] = newState;
      }
    }
  }

  return result;
}

/**
 * Calculate adaptive threshold based on signal statistics
 */
function calculateAdaptiveThresholds(envelope: number[]): { high: number; low: number } {
  if (envelope.length === 0) return { high: 0, low: 0 };

  // Sort envelope values to find distribution
  const sorted = [...envelope].sort((a, b) => a - b);

  // Find noise floor (lower percentile) and signal level (upper percentile)
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)];
  const signalLevel = sorted[Math.floor(sorted.length * 0.9)];

  // Calculate thresholds with hysteresis
  const range = signalLevel - noiseFloor;
  const high = noiseFloor + range * 0.4; // 40% for ON threshold
  const low = noiseFloor + range * 0.2; // 20% for OFF threshold

  return { high, low };
}

/**
 * Estimate unit length using k-means clustering on ON durations
 */
function estimateUnitLength(onDurations: number[]): number {
  if (onDurations.length === 0) return 1;
  if (onDurations.length === 1) return onDurations[0];

  // Sort durations
  const sorted = [...onDurations].sort((a, b) => a - b);

  // Try to find two clusters (dots and dashes)
  // Use simple k-means with k=2
  let dotCenter = sorted[0];
  let dashCenter = sorted[sorted.length - 1];

  for (let iter = 0; iter < 10; iter++) {
    const dots: number[] = [];
    const dashes: number[] = [];

    for (const d of sorted) {
      if (Math.abs(d - dotCenter) < Math.abs(d - dashCenter)) {
        dots.push(d);
      } else {
        dashes.push(d);
      }
    }

    if (dots.length > 0) {
      dotCenter = dots.reduce((a, b) => a + b, 0) / dots.length;
    }
    if (dashes.length > 0) {
      dashCenter = dashes.reduce((a, b) => a + b, 0) / dashes.length;
    }
  }

  // The dot center is our unit length
  // Validate: dash should be approximately 3x dot
  const ratio = dashCenter / dotCenter;
  if (ratio >= 2 && ratio <= 5) {
    // Good ratio, return dot center
    return dotCenter;
  }

  // Fallback: use median of lower quartile
  const lowerQuartile = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 3)));
  return lowerQuartile.reduce((a, b) => a + b, 0) / lowerQuartile.length;
}

/**
 * Apply bandpass filter to focus on typical Morse code tone frequencies
 */
function applyBandpassFilter(data: Float32Array, sampleRate: number): Float32Array {
  // Detect the dominant tone frequency using Goertzel algorithm
  const dominantFreq = detectToneFrequency(data, sampleRate);

  // Apply a narrower filter centered around the detected tone
  const filterBandwidth = 200; // +/- 200 Hz around the detected tone

  // Apply a simple smoothing to reduce high-frequency noise
  const filtered = new Float32Array(data.length);
  const smoothSize = Math.max(1, Math.floor(sampleRate / (dominantFreq + filterBandwidth) / 2));

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -smoothSize; j <= smoothSize; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < data.length) {
        sum += data[idx];
        count++;
      }
    }
    filtered[i] = sum / count;
  }

  return filtered;
}

export async function decodeFromFloat32(dataInput: Float32Array, sampleRate: number): Promise<string> {
  let data: any = dataInput;

  // 0. Apply automatic gain control (normalize volume)
  data = normalizeAudio(data);

  // 1. Apply bandpass filter to reduce noise outside typical Morse frequencies
  const filteredData = applyBandpassFilter(data, sampleRate);

  // 2. Calculate RMS envelope with a smaller window for better resolution
  const windowSize = Math.floor(sampleRate * 0.005); // 5ms window for better resolution
  const hopSize = Math.floor(windowSize / 2); // 50% overlap for smoother envelope
  let envelope: number[] = [];

  for (let i = 0; i < filteredData.length; i += hopSize) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < windowSize && i + j < filteredData.length; j++) {
      sum += filteredData[i + j] * filteredData[i + j];
      count++;
    }
    envelope.push(Math.sqrt(sum / count));
  }

  // 2.5 Apply median filter to remove impulse noise (clicks/pops)
  const medianWindowSize = Math.max(3, Math.floor(15 / (1000 / sampleRate * hopSize))); // ~15ms median
  envelope = medianFilter(envelope, medianWindowSize);

  // 3. Smooth the envelope to reduce noise-induced fluctuations
  const smoothWindowSize = Math.max(3, Math.floor(20 / (1000 / sampleRate * hopSize))); // ~20ms smoothing
  envelope = smoothEnvelope(envelope, smoothWindowSize);

  // 4. Calculate adaptive thresholds
  const { high: highThreshold, low: lowThreshold } = calculateAdaptiveThresholds(envelope);

  // Check if signal is too weak or uniform
  if (highThreshold <= lowThreshold || highThreshold === 0) {
    return '';
  }

  // 5. Apply Schmitt trigger for robust state detection
  let states = schmittTrigger(envelope, highThreshold, lowThreshold);

  // 6. Debounce to remove short glitches (< 10ms equivalent)
  const minDebounceLength = Math.max(2, Math.floor  (10 / (1000 / sampleRate * hopSize)));
  states = debounceStates(states, minDebounceLength);

  // 7. Run Length Encoding
  const durations: { state: boolean; count: number }[] = [];
  if (states.length > 0) {
    let currentState = states[0];
    let currentCount = 0;
    for (const s of states) {
      if (s === currentState) {
        currentCount++;
      } else {
        durations.push({ state: currentState, count: currentCount });
        currentState = s;
        currentCount = 1;
      }
    }
    durations.push({ state: currentState, count: currentCount });
  }

  // 8. Filter out leading/trailing silence and very short glitches
  const filteredDurations = durations.filter((d, i) => {
    // Keep all ON states that are significant
    if (d.state) return d.count >= minDebounceLength;
    // For OFF states, keep them if they're between two ON states
    const hasPrevOn = durations.slice(0, i).some((p) => p.state);
    const hasNextOn = durations.slice(i + 1).some((n) => n.state);
    return hasPrevOn && hasNextOn;
  });

  // 9. Analyze ON durations to find unit length using clustering
  const onDurations = filteredDurations.filter((d) => d.state).map((d) => d.count);
  if (onDurations.length === 0) return '';

  const unitLength = estimateUnitLength(onDurations);
  if (unitLength <= 0) return '';

  // 10. Decode with more forgiving thresholds
  let result = '';
  const dotDashThreshold = 2.0; // Below this is dot, above is dash
  const charGapThreshold = 2.0; // Below this is inter-element, above is char gap
  const wordGapThreshold = 5.0; // Below this is char gap, above is word gap

  for (const d of filteredDurations) {
    const units = d.count / unitLength;

    if (d.state) {
      // ON - determine dot or dash
      if (units < dotDashThreshold) {
        result += '.';
      } else {
        result += '-';
      }
    } else {
      // OFF - determine gap type
      if (units < charGapThreshold) {
        // Inter-element gap (1 unit), ignore
      } else if (units < wordGapThreshold) {
        // Inter-character gap (3 units)
        result += ' ';
      } else {
        // Word gap (7 units)
        result += ' / ';
      }
    }
  }

  // 11. Clean up result - remove duplicate spaces and trim
  result = result
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();

  // 12. Convert Morse to Text
  return result
    .split(' / ')
    .map((word) => {
      return word
        .trim()
        .split(' ')
        .filter((char) => char.length > 0)
        .map((char) => REVERSE_MORSE_CODE[char] || '?')
        .join('');
    })
    .filter((word) => word.length > 0)
    .join(' ');
}

export async function decodeArrayBufferToMonoPCM(arrayBuffer: ArrayBuffer): Promise<{ audio: Float32Array; sampleRate: number }> {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    let audio: Float32Array;
    if (audioBuffer.numberOfChannels === 1) {
      audio = audioBuffer.getChannelData(0);
    } else {
      audio = new Float32Array(audioBuffer.length);
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < audioBuffer.length; i++) {
          audio[i] += channelData[i] / audioBuffer.numberOfChannels;
        }
      }
    }

    return { audio, sampleRate: audioBuffer.sampleRate };
  } finally {
    try {
      if (typeof ctx.close === 'function') await ctx.close();
    } catch (e) {
      // ignore
    }
  }
}
