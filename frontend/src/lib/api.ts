/**
 * VoxSentra REST API Client
 *
 * Strict status code mapping, zero hard-coded credentials,
 * X-API-Key authentication header, and persistent session management.
 */

import {
  AnalyzeResponse,
  HealthResponse,
  TransactionCheckRequest,
  TransactionCheckResponse,
} from './types';

const STORAGE_KEY_API_URL = 'voxsentra_api_base_url';
const STORAGE_KEY_API_KEY = 'voxsentra_api_key';

// One random session_id per page load, reused across calls
let pageLoadSessionId = '';

export function getSessionId(): string {
  if (!pageLoadSessionId) {
    pageLoadSessionId =
      'sess_' +
      Math.random().toString(36).substring(2, 10) +
      '_' +
      Date.now().toString(36);
  }
  return pageLoadSessionId;
}

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_API_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // LocalStorage unavailable
  }
  return '';
}

export function setApiBaseUrl(url: string): void {
  try {
    const sanitized = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY_API_URL, sanitized);
  } catch {
    // LocalStorage unavailable
  }
}

export function getApiKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_API_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch {
    // LocalStorage unavailable
  }
  return '';
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
  } catch {
    // LocalStorage unavailable
  }
}

const STORAGE_KEY_TRIAGE_URL = 'voxsentra_triage_base_url';

export function getTriageBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TRIAGE_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // LocalStorage unavailable
  }
  return '';
}

export function setTriageBaseUrl(url: string): void {
  try {
    const sanitized = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY_TRIAGE_URL, sanitized);
  } catch {
    // LocalStorage unavailable
  }
}

export function clearTriageBaseUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TRIAGE_URL);
  } catch {
    // LocalStorage unavailable
  }
}

export function clearApiConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_API_URL);
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_TRIAGE_URL);
  } catch {
    // LocalStorage unavailable
  }
}

export class ApiErrorResponse extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string = 'ERROR') {
    super(message);
    this.name = 'ApiErrorResponse';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Maps HTTP status codes to user-facing error strings per specification:
 * 401 -> "Wrong API key"
 * 422 -> show detail
 * network -> "Backend unreachable"
 */
function extractErrorDetail(status: number, data: any): string {
  if (status === 401) {
    return 'Wrong API key';
  }
  if (status === 422) {
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((d: any) => d.msg || d.message || JSON.stringify(d))
          .join(', ');
      }
      return JSON.stringify(data.detail);
    }
    return 'Validation error (422): invalid audio or parameters';
  }
  if (data?.error?.message) {
    return data.error.message;
  }
  if (data?.detail && typeof data.detail === 'string') {
    return data.detail;
  }
  if (status >= 500) {
    return `Server error (${status}). Please check backend logs.`;
  }
  return `Request failed with status ${status}.`;
}

/**
 * Call GET {base}/health (no key needed)
 * Green "Connected" if status == "ok", else red "Disconnected"
 */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiErrorResponse('Backend unreachable', 0, 'NOT_CONFIGURED');
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      throw new ApiErrorResponse('Backend unreachable', response.status, 'HEALTH_FAILED');
    }

    const data = await response.json();
    return data as HealthResponse;
  } catch (err: unknown) {
    if (err instanceof ApiErrorResponse) throw err;
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiErrorResponse('Backend unreachable', 0, 'NETWORK_ERROR');
  }
}

/**
 * POST {base}/v1/analyze as multipart/form-data with fields "file" and "session_id"
 * Authenticated via header X-API-Key: {key}
 */
export function analyzeAudio(
  file: File | Blob,
  fileName: string = 'audio.wav',
  onUploadProgress?: (fraction: number) => void,
  abortSignal?: AbortSignal
): Promise<AnalyzeResponse> {
  return new Promise((resolve, reject) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      return reject(
        new ApiErrorResponse(
          'Backend unreachable: Please configure the API base URL in Settings.',
          0,
          'NOT_CONFIGURED'
        )
      );
    }

    const xhr = new XMLHttpRequest();
    const timeoutMs = 90000;

    xhr.open('POST', `${baseUrl}/v1/analyze`, true);
    xhr.timeout = timeoutMs;

    const apiKey = getApiKey();
    if (apiKey) {
      xhr.setRequestHeader('X-API-Key', apiKey);
    }

    const formData = new FormData();
    formData.append('file', file, fileName);
    formData.append('session_id', getSessionId());

    if (abortSignal) {
      if (abortSignal.aborted) {
        return reject(new DOMException('Analysis aborted by user', 'AbortError'));
      }
      abortSignal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Analysis aborted by user', 'AbortError'));
      });
    }

    if (xhr.upload && onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const fraction = Math.min(1, Math.max(0, e.loaded / e.total));
          onUploadProgress(fraction);
        }
      };
    }

    xhr.ontimeout = () => {
      reject(new ApiErrorResponse('Analysis timed out after 90 seconds.', 408, 'TIMEOUT'));
    };

    xhr.onerror = () => {
      reject(new ApiErrorResponse('Backend unreachable', 0, 'NETWORK_ERROR'));
    };

    xhr.onload = () => {
      try {
        const text = xhr.responseText;
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          // not json
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as AnalyzeResponse);
        } else {
          const errorMessage = extractErrorDetail(xhr.status, data);
          reject(new ApiErrorResponse(errorMessage, xhr.status, `HTTP_${xhr.status}`));
        }
      } catch (e: any) {
        reject(
          new ApiErrorResponse(
            `Error processing server response: ${e.message}`,
            xhr.status,
            'PARSE_ERROR'
          )
        );
      }
    };

    xhr.send(formData);
  });
}

/**
 * POST {base}/v1/transaction/check
 * Authenticated via header X-API-Key: {key}
 */
export async function checkTransaction(
  payload: Omit<TransactionCheckRequest, 'session_id'>,
  signal?: AbortSignal
): Promise<TransactionCheckResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiErrorResponse(
      'Backend unreachable: Please configure the API base URL in Settings.',
      0,
      'NOT_CONFIGURED'
    );
  }

  const fullPayload: TransactionCheckRequest = {
    ...payload,
    session_id: getSessionId(),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    const response = await fetch(`${baseUrl}/v1/transaction/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fullPayload),
      signal,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // not json
    }

    if (!response.ok) {
      const errorMessage = extractErrorDetail(response.status, data);
      throw new ApiErrorResponse(errorMessage, response.status, `HTTP_${response.status}`);
    }

    return data as TransactionCheckResponse;
  } catch (err: unknown) {
    if (err instanceof ApiErrorResponse) throw err;
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiErrorResponse('Backend unreachable', 0, 'NETWORK_ERROR');
  }
}
