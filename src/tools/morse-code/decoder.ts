import { REVERSE_MORSE_CODE } from './morsecode.ts';

export async function decodeAudioFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  // We only need one channel
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // 1. Calculate RMS envelope
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
  const envelope = [];
  for (let i = 0; i < data.length; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize && i + j < data.length; j++) {
      sum += data[i + j] * data[i + j];
    }
    envelope.push(Math.sqrt(sum / windowSize));
  }

  // 2. Thresholding
  const maxVal = Math.max(...envelope);
  const threshold = maxVal * 0.25; // 25% of max volume
  const states = envelope.map((v) => v > threshold);

  // 3. Run Length Encoding
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

  // 4. Analyze durations to find unit length (dot)
  // Filter out very short glitches
  const significantOn = durations.filter((d) => d.state && d.count > 2).map((d) => d.count);
  if (significantOn.length === 0) return '';

  // Simple clustering: sort and find gaps
  significantOn.sort((a, b) => a - b);

  // Assume the smallest cluster is dots
  // We can take the median of the lower half as a rough estimate for dot length
  const medianDot = significantOn[Math.floor(significantOn.length / 4)]; // rough guess

  // Refine: anything < 2 * medianDot is a dot, anything > 2 * medianDot is a dash
  // Re-calculate unit length based on identified dots
  const dots = significantOn.filter((d) => d < medianDot * 2);
  const unitLength = dots.reduce((a, b) => a + b, 0) / dots.length;

  // 5. Decode
  let result = '';

  for (const d of durations) {
    const units = d.count / unitLength;

    if (d.state) {
      // ON
      if (units < 2.0) {
        result += '.';
      } else {
        result += '-';
      }
    } else {
      // OFF
      if (units < 2.0) {
        // Inter-element gap (1 unit), ignore
      } else if (units < 5.0) {
        // Inter-character gap (3 units)
        result += ' ';
      } else {
        // Word gap (7 units)
        result += ' / ';
      }
    }
  }

  // 6. Convert Morse to Text
  return result
    .trim()
    .split(' / ')
    .map((word) => {
      return word
        .split(' ')
        .map((char) => REVERSE_MORSE_CODE[char] || '')
        .join('');
    })
    .join(' ');
}
