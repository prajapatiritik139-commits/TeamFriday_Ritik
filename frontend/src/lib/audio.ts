/**
 * Browser Audio Processing Utilities
 * Real spectrogram generation from decoded audio signal & client-side waveform analysis.
 * NOTE: As per scientific honesty rules, the client spectrogram is strictly a signal inspection tool,
 * NOT a detection result.
 */

export interface SpectrogramRenderOptions {
  fftSize?: number;
  canvas: HTMLCanvasElement;
  audioBuffer: AudioBuffer;
  colorMap?: 'viridis' | 'cyan-amber' | 'grayscale';
}

/**
 * Fast Fourier Transform (Cooley-Tukey Radix-2)
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      real[i] = real[j];
      real[j] = tempR;
      const tempI = imag[i];
      imag[i] = imag[j];
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Danielson-Lanczos section
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      for (let k = 0; k < halfLen; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const tR = wR * real[i + k + halfLen] - wI * imag[i + k + halfLen];
        const tI = wR * imag[i + k + halfLen] + wI * real[i + k + halfLen];

        real[i + k] = uR + tR;
        imag[i + k] = uI + tI;
        real[i + k + halfLen] = uR - tR;
        imag[i + k + halfLen] = uI - tI;

        const nextWR = wR * wStepR - wI * wStepI;
        const nextWI = wR * wStepI + wI * wStepR;
        wR = nextWR;
        wI = nextWI;
      }
    }
  }
}

/**
 * Pre-computes Hann window
 */
function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * Generates an accurate spectrogram canvas from an AudioBuffer
 */
export function renderSpectrogram({
  canvas,
  audioBuffer,
  fftSize = 512,
  colorMap = 'cyan-amber',
}: SpectrogramRenderOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, width, height);

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = channelData.length;

  if (totalSamples === 0) return;

  const halfFFT = fftSize / 2;
  const hann = createHannWindow(fftSize);

  // Calculate hop size so we produce exactly 'width' columns
  const numSlices = width;
  const hopSize = Math.max(1, Math.floor((totalSamples - fftSize) / numSlices));

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Track max magnitude for dynamic normalization
  const magnitudes = new Float32Array(numSlices * halfFFT);
  let maxMag = 1e-6;

  for (let slice = 0; slice < numSlices; slice++) {
    const startIdx = slice * hopSize;
    if (startIdx + fftSize > totalSamples) break;

    for (let i = 0; i < fftSize; i++) {
      real[i] = channelData[startIdx + i] * hann[i];
      imag[i] = 0;
    }

    fft(real, imag);

    for (let bin = 0; bin < halfFFT; bin++) {
      const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
      magnitudes[slice * halfFFT + bin] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }

  // Draw into imageData (frequency is on vertical axis, 0Hz at bottom, Nyquist at top)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // Map y (0 at top, height-1 at bottom) to bin index (halfFFT-1 down to 0)
      const bin = Math.floor(((height - 1 - y) / height) * halfFFT);
      const mag = magnitudes[x * halfFFT + bin] || 0;
      
      // Decibel scale: 20 * log10(mag / maxMag) normalized to [0, 1]
      const db = 20 * Math.log10(Math.max(mag / maxMag, 1e-4));
      const normalized = Math.max(0, Math.min(1, (db + 80) / 80)); // -80dB to 0dB

      const pixelIdx = (y * width + x) * 4;

      if (colorMap === 'cyan-amber') {
        // Deep space blue -> Laser cyan -> High-energy amber/white
        if (normalized < 0.4) {
          const t = normalized / 0.4;
          data[pixelIdx] = Math.floor(7 + t * 20);     // R
          data[pixelIdx + 1] = Math.floor(11 + t * 60); // G
          data[pixelIdx + 2] = Math.floor(20 + t * 140);// B
        } else if (normalized < 0.75) {
          const t = (normalized - 0.4) / 0.35;
          data[pixelIdx] = Math.floor(27 + t * 7);     // R: 27 -> 34
          data[pixelIdx + 1] = Math.floor(71 + t * 140);// G: 71 -> 211
          data[pixelIdx + 2] = Math.floor(160 + t * 78);// B: 160 -> 238
        } else {
          const t = (normalized - 0.75) / 0.25;
          data[pixelIdx] = Math.floor(34 + t * 217);   // R: 34 -> 251
          data[pixelIdx + 1] = Math.floor(211 - t * 20);// G: 211 -> 191
          data[pixelIdx + 2] = Math.floor(238 - t * 202);// B: 238 -> 36
        }
      } else {
        // Fallback grayscale
        const v = Math.floor(normalized * 255);
        data[pixelIdx] = v;
        data[pixelIdx + 1] = v;
        data[pixelIdx + 2] = v;
      }
      data[pixelIdx + 3] = 255; // Alpha
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Overlay frequency grid lines (e.g. 2 kHz, 4 kHz, 8 kHz)
  const maxFreq = sampleRate / 2;
  const gridFrequencies = [1000, 2000, 4000, 8000].filter((f) => f < maxFreq);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillStyle = 'rgba(230, 236, 245, 0.6)';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.lineWidth = 1;

  for (const freq of gridFrequencies) {
    const yPos = height - (freq / maxFreq) * height;
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.moveTo(0, yPos);
    ctx.lineTo(width, yPos);
    ctx.stroke();

    ctx.fillText(`${(freq / 1000).toFixed(0)} kHz`, 8, yPos - 3);
  }
  ctx.setLineDash([]);
}

/**
 * Extracts a downsampled waveform array (e.g. 64 or 128 bars) for visualizers
 */
export function extractWaveformData(buffer: AudioBuffer, numPoints: number = 80): number[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.floor(channelData.length / numPoints);
  const result: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const start = i * step;
    let sumSquares = 0;
    const count = Math.min(step, channelData.length - start);
    for (let j = 0; j < count; j++) {
      const val = channelData[start + j];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    result.push(Math.min(1, rms * 3.5)); // Boost for display
  }

  return result;
}
