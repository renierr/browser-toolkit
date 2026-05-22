import type { AIProvider, GenerateContentOptions, GenerateContentResult } from './provider';

export class GeminiProvider implements AIProvider {
  private getApiKey(): string {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY environment variable is not set. Please add it to your environment or .env file.'
      );
    }
    return key;
  }

  private buildPayload(options: GenerateContentOptions) {
    const parts: any[] = [{ text: options.prompt }];

    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        parts.push({
          inlineData: {
            mimeType: img.inlineData.mimeType,
            data: img.inlineData.data,
          },
        });
      }
    }

    const payload: any = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
    };

    if (options.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    const generationConfig: any = {};
    if (options.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
      if (options.responseSchema) {
        generationConfig.responseSchema = options.responseSchema;
      }
    }

    if (Object.keys(generationConfig).length > 0) {
      payload.generationConfig = generationConfig;
    }

    return payload;
  }

  async generateContent(options: GenerateContentOptions): Promise<GenerateContentResult> {
    const apiKey = this.getApiKey();
    const payload = this.buildPayload(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[GeminiProvider] Upstream failed:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text === undefined) {
        throw new Error('Gemini API returned an empty or invalid response shape.');
      }

      return { text };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Upstream AI request timed out (30s limit exceeded).');
      }
      throw err;
    }
  }

  async streamContent(
    options: GenerateContentOptions,
    onToken: (token: string) => void
  ): Promise<void> {
    const apiKey = this.getApiKey();
    const payload = this.buildPayload(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s for streaming calls

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Gemini streaming error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty or not streamable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Gemini streaming content returns a JSON array of candidates.
        // E.g. "[{...}, {...}]". We parse elements as they become complete JSON blocks.
        let isUpdated = true;
        while (isUpdated) {
          isUpdated = false;

          // Trim starting brackets or commas
          buffer = buffer.trim();
          if (buffer.startsWith('[')) {
            buffer = buffer.substring(1).trim();
          }
          if (buffer.startsWith(',')) {
            buffer = buffer.substring(1).trim();
          }

          // Find the matching close brace for the first complete JSON object
          let braceCount = 0;
          let insideString = false;
          let escape = false;
          let endIdx = -1;

          for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];

            if (escape) {
              escape = false;
              continue;
            }

            if (char === '\\') {
              escape = true;
              continue;
            }

            if (char === '"') {
              insideString = !insideString;
              continue;
            }

            if (!insideString) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  endIdx = i;
                  break;
                }
              }
            }
          }

          if (endIdx !== -1) {
            const candidateStr = buffer.substring(0, endIdx + 1);
            buffer = buffer.substring(endIdx + 1).trim();
            isUpdated = true;

            try {
              const parsed = JSON.parse(candidateStr);
              const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (token) {
                onToken(token);
              }
            } catch (e) {
              // Fragment was not valid JSON, ignore and let buffer grow
            }
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('AI streaming request timed out.');
      }
      throw err;
    }
  }
}
