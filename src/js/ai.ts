import { fetchJson, fetchApi } from './api';

export interface AIImage {
  inlineData: {
    mimeType: string;
    data: string; // Base64 representation
  };
}

export interface GenerateOptions {
  prompt: string;
  systemInstruction?: string;
  images?: AIImage[];
  responseSchema?: Record<string, any>;
  jsonMode?: boolean;
  provider?: string;
}

export class AIClient {
  /**
   * General-purpose non-streaming content generation.
   * Supports structured JSON modes natively if options.jsonMode is true.
   */
  static async generate(options: GenerateOptions): Promise<string> {
    const res = await fetchJson<{ success: boolean; text?: string; error?: string }>(
      '/ai/generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      }
    );

    if (!res.success || res.text === undefined) {
      throw new Error(res.error || 'Failed to generate content from AI');
    }

    return res.text;
  }

  /**
   * Server-Sent Events (SSE) streaming content generation.
   * Feeds raw string token chunks to the onChunk callback as they arrive.
   */
  static async stream(
    options: GenerateOptions,
    onChunk: (text: string) => void
  ): Promise<void> {
    const response = await fetchApi('/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.body) {
      throw new Error('Response body is empty or not streamable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lineEndIdx = buffer.indexOf('\n');
        while (lineEndIdx !== -1) {
          const line = buffer.substring(0, lineEndIdx).trim();
          buffer = buffer.substring(lineEndIdx + 1);
          lineEndIdx = buffer.indexOf('\n');

          if (line.startsWith('data:')) {
            const rawData = line.substring(5).trim();
            if (rawData.startsWith('{"error":')) {
              try {
                const parsed = JSON.parse(rawData);
                throw new Error(parsed.error);
              } catch {
                // Ignore parsing errors and treat as raw text
              }
            }
            if (rawData) {
              onChunk(rawData);
            }
          } else if (line.startsWith('event: error')) {
            // Read next line for the error payload
            const nextDataEndIdx = buffer.indexOf('\n');
            if (nextDataEndIdx !== -1) {
              const nextLine = buffer.substring(0, nextDataEndIdx).trim();
              buffer = buffer.substring(nextDataEndIdx + 1);
              if (nextLine.startsWith('data:')) {
                const errData = JSON.parse(nextLine.substring(5).trim());
                throw new Error(errData.error || 'Streaming error');
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
