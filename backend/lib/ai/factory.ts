import { GeminiProvider } from './gemini';
import type { AIProvider } from './provider';

/**
 * AI Provider Registry Factory
 * Instantiates the specified AI provider module.
 */
export function getAIProvider(providerName = 'gemini'): AIProvider {
  const normalized = providerName.toLowerCase().trim();
  if (normalized === 'gemini') {
    return new GeminiProvider();
  }
  throw new Error(`Unsupported AI provider: ${providerName}`);
}
