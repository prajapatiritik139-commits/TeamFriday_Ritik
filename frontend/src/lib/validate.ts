/**
 * Client-Side Audio Validation
 * Validates file size, media extension/MIME type, duration (1-60s via Web Audio API), and signal integrity.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  duration?: number;
  sampleRate?: number;
  channelCount?: number;
  audioBuffer?: AudioBuffer;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MIN_DURATION_SECONDS = 1.0;
const MAX_DURATION_SECONDS = 60.0;

const ALLOWED_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.webm'];
const ALLOWED_MIME_PREFIXES = [
  'audio/',
  'video/webm', // WebM recordings frequently carry video/webm container for audio-only
];

export function validateFileBasics(file: File): { valid: boolean; error?: string } {
  // 1. File size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size is ${sizeMb} MB, exceeding the 25 MB limit.`,
    };
  }

  if (file.size < 1024) {
    return {
      valid: false,
      error: 'File is too small to contain valid audio data.',
    };
  }

  // 2. Extension check
  const lowerName = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasValidMime = file.type ? ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)) : true;

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: 'Unsupported audio format. Supported formats: WAV, MP3, M4A, OGG, FLAC, WebM.',
    };
  }

  return { valid: true };
}

/**
 * Decodes the audio using browser AudioContext to accurately inspect duration and channels.
 */
export async function validateAudioDurationAndSignal(file: File | Blob): Promise<ValidationResult> {
  // First check basic size if it's a File
  if (file instanceof File) {
    const basicCheck = validateFileBasics(file);
    if (!basicCheck.valid) {
      return { valid: false, error: basicCheck.error };
    }
  }

  let audioContext: AudioContext | null = null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      // If Web Audio API is not available, allow pass-through to server validation
      return { valid: true };
    }

    audioContext = new AudioContextClass();
    const arrayBuffer = await file.slice(0).arrayBuffer();

    // Decode audio data safely
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;

    if (duration < MIN_DURATION_SECONDS) {
      return {
        valid: false,
        error: `Recording is too short (${duration.toFixed(1)}s). Minimum required duration is 1.0 second.`,
        duration,
      };
    }

    if (duration > MAX_DURATION_SECONDS) {
      return {
        valid: false,
        error: `Recording is too long (${duration.toFixed(1)}s). Maximum permitted duration is 60.0 seconds.`,
        duration,
      };
    }

    // Check for silent file
    let maxAmp = 0;
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / 5000));
    for (let i = 0; i < channelData.length; i += step) {
      const abs = Math.abs(channelData[i]);
      if (abs > maxAmp) maxAmp = abs;
    }

    if (maxAmp < 0.001) {
      return {
        valid: false,
        error: 'The audio file appears to contain silence or no audible signal.',
        duration,
      };
    }

    return {
      valid: true,
      duration,
      sampleRate: audioBuffer.sampleRate,
      channelCount: audioBuffer.numberOfChannels,
      audioBuffer,
    };
  } catch {
    return {
      valid: false,
      error: 'Unable to decode audio container. Please ensure the file is not corrupted.',
    };
  } finally {
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
  }
}
