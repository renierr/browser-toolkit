/**
 * API Fetch Helper
 * Handles communication with the Bun backend.
 * Provides a centralized place for error handling, auth, and future enhancements.
 */

export type ApiOptions = RequestInit & {
  /** Optional custom error message if the request fails */
  errorMessage?: string;
};

/**
 * Base fetch wrapper for backend API calls.
 * Automatically prefixes endpoints with /api/ if needed and handles non-ok responses.
 */
export async function fetchApi(
  endpoint: string,
  options: ApiOptions = {}
): Promise<Response> {
  const { errorMessage, ...fetchOptions } = options;
  
  // Ensure the endpoint is correctly formatted
  // If it starts with http or already has /api/, use it as is, otherwise prefix with /api/
  const url = (endpoint.startsWith('http') || endpoint.startsWith('/api/'))
    ? endpoint
    : `/api/${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`;

  // future: const headers = new Headers(fetchOptions.headers);
  // future: headers.set('Authorization', `Bearer ${getToken()}`);
  // future: fetchOptions.headers = headers;

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let detail = `API Error: ${response.status} ${response.statusText}`;
    try {
      // Try to extract error message from JSON response
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        if (data.error) detail = data.error;
      }
    } catch (e) {
      // Ignore if not JSON or other parsing error
    }
    
    throw new Error(errorMessage || detail);
  }

  return response;
}

/**
 * Helper for API calls that return JSON.
 */
export async function fetchJson<T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const response = await fetchApi(endpoint, options);
  return response.json();
}

/**
 * Helper for API calls that return a Blob (files, images, etc.).
 */
export async function fetchBlob(
  endpoint: string,
  options: ApiOptions = {}
): Promise<Blob> {
  const response = await fetchApi(endpoint, options);
  return response.blob();
}

export type UploadOptions = ApiOptions & {
  /** Callback for upload progress (0-100) */
  onProgress?: (percent: number) => void;
};

/**
 * Specialized helper for file uploads.
 * Uses fetch for high-efficiency streaming.
 * NOTE: Upload progress (onProgress) is not natively supported by fetch and will be ignored.
 */
export async function uploadFile<T = any>(
  endpoint: string,
  file: File | Blob,
  options: UploadOptions = {}
): Promise<T> {
  const { onProgress, errorMessage, headers = {}, ...rest } = options;

  const response = await fetchApi(endpoint, {
    ...rest,
    method: rest.method || 'POST',
    body: file,
    headers: {
      ...headers,
      'Content-Type': file.type || 'application/octet-stream',
    },
  });

  return response.json();
}


