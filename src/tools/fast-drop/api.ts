import { fetchJson, fetchBlob, uploadFile } from '../../js/api';
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
  try {
    return await uploadFile('/drop', file, {
      headers: {
        'X-Filename': encodeURIComponent(file.name),
        'X-Retention': retention,
        'X-Source': source,
        'Content-Type': file.type || 'application/octet-stream',
      },
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
