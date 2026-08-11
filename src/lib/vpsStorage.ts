/**
 * VPS Private Storage helper utilities for frontend components.
 * Constructs file access URLs for /api/storage/files/{bucket}/{path}.
 */

export function getVPSFileUrl(bucket: string, path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path;
  }
  const cleanPath = path.replace(/^\//, '');
  return `/api/storage/files/${bucket}/${cleanPath}`;
}

export async function uploadVPSFile(
  bucket: string,
  path: string,
  file: File | Blob
): Promise<{ data: { path: string } | null; error: Error | null }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    formData.append('path', path);

    const token = localStorage.getItem('altrix_access_token') || '';

    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      return { data: null, error: new Error(err.detail || 'Upload failed') };
    }

    const data = await res.json();
    return { data: { path: data.path || path }, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}
