export interface TranscodeOptions {
  format: string;
  preset: string;
  advancedArgs: string;
  cutStart?: number;
  cutEnd?: number;
  copyCodec?: boolean;
  maxResolution?: number;
}

/**
 * Generates the FFmpeg arguments based on user input and detected streams.
 */
export function getFFmpegArgs(inputName: string, outputName: string, options: TranscodeOptions): string[] {
  const { format, preset, advancedArgs, cutStart, cutEnd, copyCodec, maxResolution } = options;
  let args: string[] = ['-y'];

  // Place -ss BEFORE -i for fast input seeking (skips decoding prior frames → less memory)
  if (cutStart !== undefined && cutStart > 0) {
    args.push('-ss', cutStart.toFixed(3));
  }

  args.push('-i', inputName);

  if (cutEnd !== undefined && cutEnd > 0) {
    const duration = cutEnd - (cutStart || 0);
    if (duration > 0) {
      args.push('-t', duration.toFixed(3));
    }
  }

  // Build a scale filter that caps resolution while keeping even dimensions (required by most codecs).
  // Uses min() so it only downscales — never upscales.
  // Note: the \\, escapes the comma in FFmpeg's filter expression parser (not shell escaping).
  // Do NOT add shell-style quotes – args are passed directly via ffmpeg.exec().
  const maxW = maxResolution || 1280;
  const scaleFilter = `scale=min(iw\\,${maxW}):-2:flags=lanczos`;

  if (copyCodec) {
    args.push('-c', 'copy', '-map', '0');
  } else {
    if (format === 'mp4') {
      args.push('-threads', '1');
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', '23', '-pix_fmt', 'yuv420p');
      args.push('-c:a', 'aac', '-b:a', '128k');
      args.push('-map', '0:v?', '-map', '0:a?');
      args.push('-vf', scaleFilter);
    } else if (format === 'webm') {
      args.push('-threads', '1');
      // Memory-critical flags for WASM single-threaded build:
      // -lag-in-frames 0  → disables lookahead (huge memory saver)
      // -auto-alt-ref 0   → disables alternate reference frames
      // -row-mt 0         → disables row-based multi-threading
      // -tile-columns 0 -frame-parallel 0 → minimal tiling
      args.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0');
      args.push('-lag-in-frames', '0', '-auto-alt-ref', '0');
      args.push('-row-mt', '0', '-tile-columns', '0', '-frame-parallel', '0');
      args.push('-speed', '4', '-deadline', 'realtime');
      args.push('-c:a', 'libopus');
      args.push('-map', '0:v?', '-map', '0:a?');
      args.push('-vf', scaleFilter);
    } else if (format === 'gif') {
      args.push('-vf', `fps=10,scale=min(iw\\,${maxW}):-2:flags=lanczos`, '-f', 'gif');
    } else if (format === 'webp') {
      args.push('-vf', `fps=10,scale=min(iw\\,${maxW}):-2:flags=lanczos`, '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '4', '-q:v', '50', '-loop', '0', '-an', '-f', 'webp');
    } else if (format === 'mp3') {
      args.push('-vn', '-ab', '192k', '-ar', '44100', '-f', 'mp3');
    }
  }

  if (advancedArgs.trim()) {
    const customArgs = advancedArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    for (const carg of customArgs) {
      args.push(carg.replace(/^"|"$/g, ''));
    }
  }

  args.push(outputName);
  return args;
}

/**
 * Extract video duration and metadata from FFmpeg logs.
 */
export async function getVideoMetadata(ffmpeg: any, inputName: string): Promise<{
  duration: number,
  width?: number,
  height?: number,
  vcodec?: string,
  acodec?: string,
  bitrate?: string,
  fps?: string,
  sampleRate?: string,
  hasAudio: boolean
}> {
  let duration = 0;
  let width: number | undefined;
  let height: number | undefined;
  let vcodec: string | undefined;
  let acodec: string | undefined;
  let bitrate: string | undefined;
  let fps: string | undefined;
  let sampleRate: string | undefined;
  let hasAudio = false;

  const handler = ({ message }: { message: string }) => {
    const dMatch = message.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (dMatch) {
      const hours = parseInt(dMatch[1], 10);
      const minutes = parseInt(dMatch[2], 10);
      const seconds = parseInt(dMatch[3], 10);
      const hundredths = parseInt(dMatch[4], 10);
      duration = hours * 3600 + minutes * 60 + seconds + hundredths / 100;
    }

    if (message.includes('Video:')) {
      const codecMatch = message.match(/Video:\s+([^, (]+)/);
      if (codecMatch) vcodec = codecMatch[1];

      const resMatch = message.match(/(\d{3,})x(\d{2,})/);
      if (resMatch) {
        width = parseInt(resMatch[1], 10);
        height = parseInt(resMatch[2], 10);
      }

      const fpsMatch = message.match(/([\d.]+)\s+fps/);
      if (fpsMatch) fps = fpsMatch[1];
    }

    const aMatch = message.match(/Audio: ([^,]+), (\d+ Hz)/);
    if (aMatch) {
      acodec = aMatch[1];
      sampleRate = aMatch[2];
      hasAudio = true;
    } else if (message.includes('Audio:')) {
      hasAudio = true;
    }

    const bMatch = message.match(/bitrate: (\d+ kb\/s)/) || message.match(/, (\d+ kb\/s)/);
    if (bMatch) {
      bitrate = bMatch[1];
    }
  };

  ffmpeg.on('log', handler);
  try {
    await ffmpeg.exec(['-i', inputName]);
  } finally {
    ffmpeg.off('log', handler);
  }

  return { duration, width, height, vcodec, acodec, bitrate, fps, sampleRate, hasAudio };
}

/**
 * Manages a small buffer of FFmpeg logs to provide context on errors.
 */
export class FFmpegLogCollector {
  private logs: string[] = [];
  private maxLines = 200;

  add(message: string) {
    this.logs.push(message);
    if (this.logs.length > this.maxLines) {
      this.logs.shift();
    }
  }

  getSummary(): string {
    return this.logs.join('\n');
  }

  clear() {
    this.logs = [];
  }
}
