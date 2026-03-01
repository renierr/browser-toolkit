export interface TranscodeOptions {
  format: string;
  preset: string;
  advancedArgs: string;
}

/**
 * Generates the FFmpeg arguments based on user input and detected streams.
 */
export function getFFmpegArgs(inputName: string, outputName: string, options: TranscodeOptions): string[] {
  const { format, preset, advancedArgs } = options;
  let args = ['-i', inputName];

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
