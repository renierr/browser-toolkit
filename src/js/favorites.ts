const STORAGE_KEY = 'favorites';

export function getFavorites(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(toolPath: string): boolean {
  const favorites = getFavorites();
  const index = favorites.indexOf(toolPath);
  let isFavorite = false;

  if (index === -1) {
    favorites.push(toolPath);
    isFavorite = true;
  } else {
    favorites.splice(index, 1);
    isFavorite = false;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  return isFavorite;
}

export function isFavorite(toolPath: string): boolean {
  return getFavorites().includes(toolPath);
}
