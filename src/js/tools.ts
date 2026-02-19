import type { Tool } from './types';

// This will be populated by the main script
export let tools: Tool[] = [];

export function setTools(newTools: Tool[]) {
  tools = newTools;
}
