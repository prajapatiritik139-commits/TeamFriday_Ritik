/**
 * VoxSentra Call Triage API & Audio Streaming Client
 * 
 * Handles /v1/analyze multipart POST and /v1/stream WebSocket 16kHz PCM streaming.
 */

export interface TriageProbs {
  ANG?: number; // Anger
  FEA?: number; // Fear
  SAD?: number; // Distress
  NEU?: number; // Calm
  HAP?: number; // Happy
  [key: string]: number | undefined;
}

export interface TriageWindow {
  start_s: number;
  probs: TriageProbs;
  urgency: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  top_label?: string;
  confidence?: number;
  uncertain?: boolean;
}

export interface TriageSession {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  urgency: number;
  windows: number;
  top_label?: string;
  peak_urgency?: number;
  reasons?: string[];
  uncertain?: boolean;
  call_id?: string;
}

export interface TriageAnalyzeResponse {
  duration_s?: number;
  latency_ms?: number;
  windows: TriageWindow[];
  session: TriageSession;
  disclaimer?: string;
  label?: string;
  call_id?: string;
}

export interface TriageLiveScoreMessage {
  type: 'score' | string;
  probs?: TriageProbs;
  urgency?: number;
  level?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  session?: TriageSession;
  start_s?: number;
  top_label?: string;
  confidence?: number;
  uncertain?: boolean;
  call_id?: string;
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

/**
 * Builds WebSocket stream URL from HTTP/HTTPS base URL.
 * e.g. https://api.example.com -> wss://api.example.com/v1/stream/{randomId}
 * e.g. http://localhost:8000 -> ws://localhost:8000/v1/stream/{randomId}
 */
export function buildTriageWsUrl(baseUrl: string, streamId: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  let wsUrl = trimmed;

  if (wsUrl.startsWith('https://')) {
    wsUrl = 'wss://' + wsUrl.slice(8);
  } else if (wsUrl.startsWith('http://')) {
    wsUrl = 'ws://' + wsUrl.slice(7);
  } else if (wsUrl.startsWith('localhost') || wsUrl.startsWith('127.0.0.1')) {
    wsUrl = 'ws://' + wsUrl;
  } else {
    wsUrl = 'wss://' + wsUrl;
  }

  return `${wsUrl}/v1/stream/${streamId}`;
}

/**
 * Analyzes audio or video file for Call Triage urgency & acoustic emotions.
 * POST multipart/form-data to {triageUrl}/v1/analyze with fields:
 * - file: File
 * - label: string (optional)
 * - voice_check: false
 */
export async function analyzeCallTriage(
  baseUrl: string,
  file: File,
  label?: string,
  signal?: AbortSignal
): Promise<TriageAnalyzeResponse> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  if (!cleanBase) {
    throw new Error('Call Triage server URL is not configured. Please set it in Settings.');
  }

  const endpoint = `${cleanBase}/v1/analyze`;

  const formData = new FormData();
  formData.append('file', file, file.name);
  if (label && label.trim()) {
    formData.append('label', label.trim());
  }
  formData.append('voice_check', 'false');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new Error(
      `Cannot connect to Call Triage backend at ${cleanBase}. Verify the server is running and CORS headers allow requests.`
    );
  }

  if (!response.ok) {
    let errorDetail = `Call triage analysis failed with status ${response.status} (${response.statusText})`;
    try {
      const errJson = await response.json();
      if (errJson && (errJson.detail || errJson.message || errJson.error)) {
        errorDetail = errJson.detail || errJson.message || errJson.error;
      }
    } catch {
      // not JSON
    }
    throw new Error(errorDetail);
  }

  const data = await response.json();

  // Normalize structure to ensure required fields
  const callId = data.call_id || data.session?.call_id || (label ? `call_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}` : undefined);

  const normalizedSession: TriageSession = {
    level: data.session?.level || 'LOW',
    urgency: typeof data.session?.urgency === 'number' ? data.session.urgency : 0,
    windows: typeof data.session?.windows === 'number' ? data.session.windows : (Array.isArray(data.windows) ? data.windows.length : 0),
    top_label: data.session?.top_label || 'Unknown',
    peak_urgency: typeof data.session?.peak_urgency === 'number' ? data.session.peak_urgency : undefined,
    reasons: Array.isArray(data.session?.reasons) ? data.session.reasons : undefined,
    uncertain: typeof data.session?.uncertain === 'boolean' ? data.session.uncertain : (typeof data.uncertain === 'boolean' ? data.uncertain : undefined),
    call_id: callId,
  };

  const normalizedWindows: TriageWindow[] = Array.isArray(data.windows)
    ? data.windows.map((w: any) => ({
        start_s: typeof w.start_s === 'number' ? w.start_s : 0,
        probs: w.probs || {},
        urgency: typeof w.urgency === 'number' ? w.urgency : 0,
        level: w.level || 'LOW',
        top_label: w.top_label,
        confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
        uncertain: typeof w.uncertain === 'boolean' ? w.uncertain : undefined,
      }))
    : [];

  const normalized: TriageAnalyzeResponse = {
    duration_s: typeof data.duration_s === 'number' ? data.duration_s : undefined,
    latency_ms: typeof data.latency_ms === 'number' ? data.latency_ms : undefined,
    windows: normalizedWindows,
    session: normalizedSession,
    disclaimer: data.disclaimer || 'Acoustic triage output is intended for advisory and prioritization assistance only.',
    label: label || data.label || undefined,
    call_id: callId,
  };

  return normalized;
}

/**
 * Downloads Call Triage CSV Report for a call_id:
 * Calls GET {backend}/v1/call/{call_id}/report?format=csv
 * Uses X-API-Key header if configured.
 * Downloads the response as report_{call_id}.csv.
 */
export async function downloadCallReportCsv(
  baseUrl: string,
  callId: string,
  apiKey?: string
): Promise<void> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  if (!cleanBase) {
    throw new Error('Call Triage server URL is not configured. Please enter it in Settings.');
  }

  const sanitizedCallId = encodeURIComponent(callId.trim());
  const endpoint = `${cleanBase}/v1/call/${sanitizedCallId}/report?format=csv`;

  const headers: Record<string, string> = {
    Accept: 'text/csv, application/csv, text/plain, */*',
  };
  if (apiKey && apiKey.trim()) {
    headers['X-API-Key'] = apiKey.trim();
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });
  } catch (err: any) {
    throw new Error(`Network error while downloading CSV report: ${err.message || err}`);
  }

  if (!response.ok) {
    let errorDetail = `Failed to download CSV report (HTTP ${response.status} ${response.statusText})`;
    try {
      const errText = await response.text();
      try {
        const errJson = JSON.parse(errText);
        if (errJson && (errJson.detail || errJson.message || errJson.error)) {
          errorDetail = errJson.detail || errJson.message || errJson.error;
        }
      } catch {
        if (errText && errText.trim().length > 0 && errText.length < 300) {
          errorDetail = errText.trim();
        }
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${callId.trim()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Resamples Float32 audio channel data down to 16,000 Hz.
 */
export function resampleTo16k(inputData: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return inputData;
  }
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const decimal = position - index;
    const sample1 = inputData[index] || 0;
    const sample2 = inputData[index + 1] !== undefined ? inputData[index + 1] : sample1;
    result[i] = sample1 + (sample2 - sample1) * decimal;
  }
  return result;
}

/**
 * Converts Float32Array (-1.0 to 1.0) to 16-bit signed PCM (Int16Array).
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Realistic sample data for demo preview (6-second windows)
 */
export function getSampleTriageData(): TriageAnalyzeResponse {
  return {
    duration_s: 36.0,
    latency_ms: 142,
    windows: [
      {
        start_s: 0.0,
        probs: { ANG: 0.05, FEA: 0.08, SAD: 0.12, NEU: 0.72, HAP: 0.03 },
        urgency: 22.0,
        level: 'LOW',
        top_label: 'Calm / neutral',
        confidence: 0.88,
        uncertain: false,
      },
      {
        start_s: 6.0,
        probs: { ANG: 0.18, FEA: 0.35, SAD: 0.22, NEU: 0.21, HAP: 0.04 },
        urgency: 54.5,
        level: 'MEDIUM',
        top_label: 'Fear / anxiety',
        confidence: 0.62,
        uncertain: true,
      },
      {
        start_s: 12.0,
        probs: { ANG: 0.42, FEA: 0.38, SAD: 0.12, NEU: 0.06, HAP: 0.02 },
        urgency: 82.0,
        level: 'HIGH',
        top_label: 'Anger / distress',
        confidence: 0.79,
        uncertain: false,
      },
      {
        start_s: 18.0,
        probs: { ANG: 0.58, FEA: 0.25, SAD: 0.11, NEU: 0.05, HAP: 0.01 },
        urgency: 91.5,
        level: 'HIGH',
        top_label: 'Anger / high urgency',
        confidence: 0.85,
        uncertain: false,
      },
      {
        start_s: 24.0,
        probs: { ANG: 0.34, FEA: 0.41, SAD: 0.18, NEU: 0.05, HAP: 0.02 },
        urgency: 78.0,
        level: 'HIGH',
        top_label: 'Fear / panic',
        confidence: 0.58,
        uncertain: true,
      },
      {
        start_s: 30.0,
        probs: { ANG: 0.20, FEA: 0.28, SAD: 0.35, NEU: 0.15, HAP: 0.02 },
        urgency: 61.0,
        level: 'MEDIUM',
        top_label: 'Distress',
        confidence: 0.71,
        uncertain: false,
      },
    ],
    session: {
      level: 'HIGH',
      urgency: 76.4,
      windows: 6,
      top_label: 'Anger & Acute Panic',
      peak_urgency: 91.5,
      uncertain: true,
      call_id: 'call_49102_extortion',
      reasons: [
        'Acoustic tension spikes exceed standard cybercrime triage threshold in windows 3-5',
        'Vocal tremor and fundamental frequency (F0) pitch perturbation detected',
        'Sustained high intensity stress patterns across consecutive 6-second windows',
      ],
    },
    disclaimer:
      'SAMPLE DATA: Automated triage metrics are generated by acoustic prosodic classification for simulated cybercrime threat escalation analysis.',
    label: '[Sample Data] Cybercrime Extortion Call #49102',
    call_id: 'call_49102_extortion',
  };
}
