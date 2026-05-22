import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getAIProvider } from '../lib/ai/factory';

const ai = new Hono();

// Generate Content (single-shot call)
ai.post('/generate', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ success: false, error: 'Request body must be a valid JSON object.' }, 400);
    }

    const { prompt, systemInstruction, images, responseSchema, jsonMode, provider } = body;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return c.json({ success: false, error: 'A non-empty "prompt" string is required.' }, 400);
    }

    // Basic images validation
    if (images !== undefined) {
      if (!Array.isArray(images)) {
        return c.json({ success: false, error: '"images" must be an array of image objects.' }, 400);
      }
      for (const img of images) {
        if (!img.inlineData?.mimeType || typeof img.inlineData?.data !== 'string') {
          return c.json(
            {
              success: false,
              error: 'Each image must contain inlineData with a valid "mimeType" and base64 "data".',
            },
            400
          );
        }
      }
    }

    const aiProvider = getAIProvider(provider || 'gemini');
    const result = await aiProvider.generateContent({
      prompt,
      systemInstruction,
      images,
      responseSchema,
      jsonMode: jsonMode === true,
    });

    return c.json({
      success: true,
      text: result.text,
    });
  } catch (err: any) {
    console.error('[AI Router] Generate failed:', err);
    return c.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred during generation.',
      },
      500
    );
  }
});

// Stream Content (Server-Sent Events)
ai.post('/stream', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Request body must be a valid JSON object.' }, 400);
  }

  const { prompt, systemInstruction, images, responseSchema, jsonMode, provider } = body;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return c.json({ success: false, error: 'A non-empty "prompt" string is required.' }, 400);
  }

  // Basic images validation
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      return c.json({ success: false, error: '"images" must be an array of image objects.' }, 400);
    }
    for (const img of images) {
      if (!img.inlineData?.mimeType || typeof img.inlineData?.data !== 'string') {
        return c.json(
          {
            success: false,
            error: 'Each image must contain inlineData with a valid "mimeType" and base64 "data".',
          },
          400
        );
      }
    }
  }

  return streamSSE(c, async (stream) => {
    try {
      const aiProvider = getAIProvider(provider || 'gemini');

      await aiProvider.streamContent(
        {
          prompt,
          systemInstruction,
          images,
          responseSchema,
          jsonMode: jsonMode === true,
        },
        async (token) => {
          await stream.writeSSE({
            data: token,
          });
        }
      );
    } catch (err: any) {
      console.error('[AI Router] Streaming chunk failure:', err);
      try {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: err.message || 'Streaming failed' }),
        });
      } catch {
        // stream was aborted
      }
    }
  });
});

export default ai;
