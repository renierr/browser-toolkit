import type { Drop } from './types';

export async function fetchDrops(): Promise<{ success: boolean; drops: Drop[]; error?: string }> {
  try {
    const resp = await fetch('/api/drop');
    return await resp.json();
  } catch (err) {
    return { success: false, drops: [], error: 'Backend server error' };
  }
}

export async function uploadDrop(
  file: File,
  retention: string,
  source: string
): Promise<{ success: boolean; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('retention', retention);
  formData.append('source', source);

  try {
    const resp = await fetch('/api/drop', {
      method: 'POST',
      body: formData,
    });
    return await resp.json();
  } catch (err) {
    return { success: false, error: 'Upload failed' };
  }
}

export async function deleteDrop(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`/api/drop/${id}`, { method: 'DELETE' });
    return await resp.json();
  } catch (err) {
    return { success: false, error: 'Delete failed' };
  }
}

export async function keepDrop(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`/api/drop/${id}/keep`, { method: 'PATCH' });
    return await resp.json();
  } catch (err) {
    return { success: false, error: 'Update failed' };
  }
}

export async function fetchDropBlob(id: string): Promise<Blob> {
  const resp = await fetch(`/api/drop/${id}`);
  if (!resp.ok) throw new Error('Fetch failed');
  return await resp.blob();
}
