export interface TranscodeOptions {
  format: string;
  preset: string;
  advancedArgs: string;
  cutStart?: number;
  cutEnd?: number;
  copyCodec?: boolean;
}

/**
 * Generates the FFmpeg arguments based on user input and detected streams.
 */
export function getFFmpegArgs(inputName: string, outputName: string, options: TranscodeOptions): string[] {
  const { format, preset, advancedArgs, cutStart, cutEnd, copyCodec } = options;
  let args: string[] = [];

  // Add seek argument before input for fast seeking
  if (cutStart !== undefined && cutStart > 0) {
    args.push('-ss', cutStart.toString());
  }

  args.push('-i', inputName);

  // Add duration argument
  if (cutEnd !== undefined && cutEnd > 0 && cutStart !== undefined) {
    const duration = cutEnd - cutStart;
    if (duration > 0) {
      args.push('-t', duration.toString());
    }
  }

  if (copyCodec) {
    args.push('-c', 'copy');
  } else {
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k');
      args.push('-map', '0:v?', '-map', '0:a?');
      args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
      args.push('-c:a', 'libopus');
      args.push('-map', '0:v?', '-map', '0:a?');
      args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
    } else if (format === 'gif') {
      args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-f', 'gif');
    } else if (format === 'webp') {
      args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '4', '-q:v', '50', '-loop', '0', '-an', '-f', 'webp');
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
    // Duration
    const dMatch = message.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (dMatch) {
      const hours = parseInt(dMatch[1], 10);
      const minutes = parseInt(dMatch[2], 10);
      const seconds = parseInt(dMatch[3], 10);
      const hundredths = parseInt(dMatch[4], 10);
      duration = hours * 3600 + minutes * 60 + seconds + hundredths / 100;
    }

    // Video stream info: "Video: h264 (Main) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2297 kb/s, 23.98 fps, 23.98 tbr, 24k tbn (default)"
    const vMatch = message.match(/Video: ([^,]+), [^,]+, (\d{2,})x(\d{2,}).*?, ([\d.]+) fps/);
    if (vMatch) {
      vcodec = vMatch[1];
      width = parseInt(vMatch[2], 10);
      height = parseInt(vMatch[3], 10);
      fps = vMatch[4];
    } else {
      // Fallback for resolution if FPS match fails
      const resMatch = message.match(/Video: .*? (\d{2,})x(\d{2,})/);
      if (resMatch && !width) {
        width = parseInt(resMatch[1], 10);
        height = parseInt(resMatch[2], 10);
      }
    }

    // Audio stream info: "Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)"
    const aMatch = message.match(/Audio: ([^,]+), (\d+ Hz)/);
    if (aMatch) {
      acodec = aMatch[1];
      sampleRate = aMatch[2];
      hasAudio = true;
    } else if (message.includes('Audio:')) {
      hasAudio = true;
    }

    // Bitrate
    const bMatch = message.match(/bitrate: (\d+ kb\/s)/);
    if (bMatch) {
      bitrate = bMatch[1];
    }
  };

  ffmpeg.on('log', handler);
  try {
    await ffmpeg.exec(['-i', inputName]);
  } catch (e) {
    // FFmpeg returns error 1 because no output is specified
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
  private maxLines = 20;

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
