export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'music';
  if (type === 'application/pdf') return 'file-text';
  if (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('xml')
  )
    return 'file-type';
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed'))
    return 'archive';
  return 'file';
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
