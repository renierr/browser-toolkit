import { fetchJson, fetchBlob } from '../../js/api';
import type { Drop } from './types';

export async function fetchDrops(): Promise<{ success: boolean; drops: Drop[]; error?: string }> {
  try {
    return await fetchJson('/drop');
  } catch (err: any) {
    return { success: false, drops: [], error: err.message || 'Backend server error' };
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
    return await fetchJson('/drop', {
      method: 'POST',
      body: formData,
    });
  } catch (err: any) {
    return { success: false, error: err.message || 'Upload failed' };
  }
}

export async function deleteDrop(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await fetchJson(`/drop/${id}`, { method: 'DELETE' });
  } catch (err: any) {
    return { success: false, error: err.message || 'Delete failed' };
  }
}

export async function keepDrop(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await fetchJson(`/drop/${id}/keep`, { method: 'PATCH' });
  } catch (err: any) {
    return { success: false, error: err.message || 'Update failed' };
  }
}

export async function fetchDropBlob(id: string): Promise<Blob> {
  return fetchBlob(`/drop/${id}`);
}
