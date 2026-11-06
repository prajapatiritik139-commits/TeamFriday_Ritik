/**
 * VoxSentra Type Definitions
 * Exact alignment with Backend API schemas & strict scientific honesty rules
 */

export type Zone = 'GREEN' | 'AMBER' | 'RED';

export type Verdict = 'likely_human' | 'needs_verification' | 'likely_synthetic';

export interface HealthResponse {
  status: string; // 'ok'
  model: string;
  device: string;
  amber_threshold: number;
  red_threshold: number;
  head_self_check: boolean;
  audio_stored: boolean;
}

export interface AnalyzeWindow {
  score: number;
  zone: Zone;
  risk: number; // 0 - 100
  start_s: number;
  latency_ms: number;
}

export interface BranchResult {
  name: string;
  score: number | null;
  calibrated: boolean;
  note: string;
}

export interface QualityMetrics {
  duration_s: number;
  speech_s: number;
  snr_db: number;
  clipped_fraction: number;
  sample_rate_in: number;
  warnings: string[];
}

export interface UncertaintyRange {
  low: number;
  high: number;
}

export interface AnalyzeResponse {
  score: number;
  zone: Zone;
  risk: number; // 0 - 100
  duration_s: number;
  latency_ms: number;
  windows: AnalyzeWindow[];
  session: {
    level: string;
    risk: number;
    windows: number;
    reasons: string[];
  };
  // Optional extended telemetry
  branches?: BranchResult[];
  quality?: QualityMetrics;
  model_version?: string;
  calibration_version?: string | null;
  limitations?: string[];
  verdict?: Verdict;
  request_id?: string;
}

export interface TransactionCheckRequest {
  session_id: string;
  amount_inr: number;
  new_beneficiary: boolean;
  urgency_signals: boolean;
  caller_unknown: boolean;
  transcript?: string;
}

export interface ScamHit {
  term: string;
  lang?: string;
  weight?: number;
}

export interface TransactionCheckResponse {
  decision: {
    action: 'ALLOW' | 'WARN' | 'VERIFY' | 'BLOCK_AND_VERIFY' | string;
    points: number;
    reasons: string[];
    next_steps: string[];
  };
  voice?: {
    level?: string;
    risk?: number;
    windows?: number;
    reasons?: string[];
  };
  scam: {
    score: number;
    hits: ScamHit[];
  };
}

export interface HistoryRecord {
  time: number;
  filename: string;
  zone: Zone;
  risk: number;
  score: number;
}

export interface DemoClip {
  file: string;
  ground_truth: 'human' | 'synthetic';
  source: string;
  generator?: string;
  license: string;
  seen_in_training: boolean;
  title: string;
  description?: string;
}
