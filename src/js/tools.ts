import type { Tool } from './types';

// This will be populated by the main script
export let tools: Tool[] = [];
export let isBackendAvailable = false;

export function setTools(newTools: Tool[]) {
  tools = newTools;
}

export function setBackendAvailable(available: boolean) {
  isBackendAvailable = available;
}
