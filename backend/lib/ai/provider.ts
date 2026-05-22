export interface AIImage {
  inlineData: {
    mimeType: string;
    data: string; // Base64 representation
  };
}

export interface GenerateContentOptions {
  prompt: string;
  systemInstruction?: string;
  images?: AIImage[];
  responseSchema?: Record<string, any>;
  jsonMode?: boolean;
}

export interface GenerateContentResult {
  text: string;
}

export interface AIProvider {
  /**
   * Generates content in a single shot.
   */
  generateContent(options: GenerateContentOptions): Promise<GenerateContentResult>;

  /**
   * Generates content dynamically using server-sent tokens.
   */
  streamContent(
    options: GenerateContentOptions,
    onToken: (token: string) => void
  ): Promise<void>;
}
