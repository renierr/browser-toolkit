const ADJECTIVES = [
  'Golden',
  'Silent',
  'Funny',
  'Grateful',
  'Brave',
  'Swift',
  'Calm',
  'Wild',
  'Shiny',
  'Ancient',
];
const ANIMALS = ['Hippo', 'Cat', 'Dog', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Deer'];

/**
 * Generates a random peer name or retrieves it from localStorage.
 */
export function generateName(): string {
  const saved = localStorage.getItem('btk-drop-name');
  if (saved) return saved;
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const name = `${adj} ${animal} ${Math.floor(Math.random() * 900) + 100}`;
  localStorage.setItem('btk-drop-name', name);
  return name;
}

/**
 * Formats bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Small deterministic hash used for short keys (not cryptographic).
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
