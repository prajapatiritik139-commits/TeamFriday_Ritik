// Web Audio API Synthesized UI Sound Effects
// Pure procedural synthesis (OscillatorNode + GainNode + BiquadFilterNode)
// Strict rules:
// - Quiet volume ~0.08 to 0.12
// - All sounds < 400ms
// - AudioContext created only on/after first user click/tap
// - Never play while microphone is active, or within 2000ms after microphone stop
// - Muted by default if prefers-reduced-motion, otherwise sound ON
// - Persisted in localStorage ('voxsentra_sound_muted')

let audioCtx: AudioContext | null = null;
let activeMicCount = 0;
let lastMicStopTime = 0;

const STORAGE_KEY = 'voxsentra_sound_muted';

function getInitialMutedState(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {}

  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true; // Muted by default if reduced motion is requested
    }
  } catch {}

  return false; // Default: sound ON
}

let isMuted: boolean = getInitialMutedState();
const listeners = new Set<(muted: boolean) => void>();

export function getSoundMuted(): boolean {
  return isMuted;
}

export function setSoundMuted(muted: boolean): void {
  isMuted = muted;
  try {
    localStorage.setItem(STORAGE_KEY, String(muted));
  } catch {}
  listeners.forEach((fn) => {
    try {
      fn(muted);
    } catch {}
  });
}

export function toggleSoundMuted(): boolean {
  const next = !isMuted;
  setSoundMuted(next);
  return next;
}

export function subscribeSoundMuted(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Microphone activity tracking to prevent acoustic feedback into mic
export function notifyMicStarted(): void {
  activeMicCount++;
}

export function notifyMicStopped(): void {
  activeMicCount = Math.max(0, activeMicCount - 1);
  lastMicStopTime = Date.now();
}

export function isSoundAllowed(): boolean {
  if (isMuted) return false;
  if (activeMicCount > 0) return false;
  if (Date.now() - lastMicStopTime < 2000) return false;
  return true;
}

// Lazy initialization of AudioContext on user interaction
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// Setup user gesture listener to prime audio context once
if (typeof window !== 'undefined') {
  const primeAudio = () => {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };

  window.addEventListener('pointerdown', primeAudio, { once: true, passive: true });
  window.addEventListener('keydown', primeAudio, { once: true, passive: true });
}

/**
 * 1) Mascot Tap: soft "blip" (short rising tone, ~130ms)
 */
export function playMascotBlip(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(740, now + 0.12);

  // Quiet volume: 0.001 -> 0.09 -> 0.001
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.14);
}

/**
 * 2) Opening/Closing Mascot Menu: gentle "whoosh" (filtered noise sweep, ~200ms)
 */
export function playMenuWhoosh(opening: boolean = true): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const duration = 0.2;
  const sampleRate = ctx.sampleRate || 44100;
  const bufferLength = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferLength, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferLength; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.45;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(2.0, ctx.currentTime);

  const now = ctx.currentTime;
  if (opening) {
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1250, now + duration);
  } else {
    filter.frequency.setValueAtTime(1250, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration + 0.02);
}

/**
 * 3) Clicking a menu bubble or switching mode: short "tick" (~35ms)
 */
export function playTick(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.035);

  gain.gain.setValueAtTime(0.085, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

/**
 * 4a) Analysis started: two quick rising notes (~220ms total)
 */
export function playAnalysisStarted(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Note 1: C5 (523.25 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now);

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.08, now + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.09);

  // Note 2: E5 (659.25 Hz)
  const t2 = now + 0.09;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, t2);

  gain2.gain.setValueAtTime(0.001, t2);
  gain2.gain.linearRampToValueAtTime(0.09, t2 + 0.015);
  gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.12);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t2);
  osc2.stop(t2 + 0.13);
}

/**
 * 4b) Analysis finished: pleasant two-note chime (~310ms total)
 */
export function playAnalysisFinished(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Note 1: D5 (587.33 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.085, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.12);

  // Note 2: A5 (880.00 Hz)
  const t2 = now + 0.11;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880, t2);

  gain2.gain.setValueAtTime(0.001, t2);
  gain2.gain.linearRampToValueAtTime(0.095, t2 + 0.02);
  gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.19);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t2);
  osc2.stop(t2 + 0.2);
}

/**
 * 5a) Result GREEN or LOW: soft major chord (~340ms)
 * Triad: C5 (523.25), E5 (659.25), G5 (783.99)
 */
export function playResultGreenOrLow(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freqs = [523.25, 659.25, 783.99];

  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const stagger = idx * 0.015; // delicate micro-arpeggio
    const startT = now + stagger;

    gain.gain.setValueAtTime(0.0001, startT);
    gain.gain.linearRampToValueAtTime(0.035, startT + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startT);
    osc.stop(startT + 0.32);
  });
}

/**
 * 5b) Result RED or HIGH: short low warning tone (single beep, not harsh, ~260ms)
 */
export function playResultRedOrHigh(): void {
  if (!isSoundAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Low frequency warm sine tone (not harsh)
  osc.type = 'sine';
  osc.frequency.setValueAtTime(246.94, now); // B3 warm low note

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.095, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * Helper to dispatch outcome sound based on verdict/level
 */
export function playVerdictSound(verdictOrLevel: string | undefined | null): void {
  if (!verdictOrLevel) return;
  const upper = verdictOrLevel.toUpperCase();
  if (upper === 'LOW' || upper === 'AUTHENTIC' || upper === 'GREEN' || upper === 'HUMAN') {
    playResultGreenOrLow();
  } else if (upper === 'HIGH' || upper === 'SYNTHETIC' || upper === 'RED') {
    playResultRedOrHigh();
  }
}
