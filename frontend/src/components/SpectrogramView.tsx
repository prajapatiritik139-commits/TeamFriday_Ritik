import React, { useEffect, useRef, useState } from 'react';
import { renderSpectrogram } from '../lib/audio';
import { Activity } from 'lucide-react';

interface SpectrogramViewProps {
  audioBuffer: AudioBuffer | null;
  file?: File | Blob | null;
}

export const SpectrogramView: React.FC<SpectrogramViewProps> = ({ audioBuffer, file }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalBuffer, setInternalBuffer] = useState<AudioBuffer | null>(audioBuffer);
  const [colorMap, setColorMap] = useState<'cyan-amber' | 'grayscale'>('cyan-amber');
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    if (audioBuffer) {
      setInternalBuffer(audioBuffer);
      return;
    }

    if (file) {
      let isCancelled = false;
      setIsDecoding(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        setIsDecoding(false);
        return;
      }
      const ctx = new AudioCtx();
      file.arrayBuffer().then((buf) => {
        return ctx.decodeAudioData(buf);
      }).then((decoded) => {
        if (!isCancelled) {
          setInternalBuffer(decoded);
          setIsDecoding(false);
        }
      }).catch(() => {
        if (!isCancelled) setIsDecoding(false);
      }).finally(() => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      });

      return () => {
        isCancelled = true;
      };
    }
  }, [audioBuffer, file]);

  useEffect(() => {
    if (!internalBuffer || !canvasRef.current) return;
    renderSpectrogram({
      canvas: canvasRef.current,
      audioBuffer: internalBuffer,
      colorMap,
      fftSize: 512,
    });
  }, [internalBuffer, colorMap]);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Acoustic Fourier Spectrogram
          </h4>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
            Signal view, not a detection result
          </span>
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setColorMap('cyan-amber')}
              className={`px-2 py-0.5 rounded transition-colors ${
                colorMap === 'cyan-amber' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Phosphor
            </button>
            <button
              type="button"
              onClick={() => setColorMap('grayscale')}
              className={`px-2 py-0.5 rounded transition-colors ${
                colorMap === 'grayscale' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mono
            </button>
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-white/10 bg-[#070B14] p-1">
        {isDecoding ? (
          <div className="h-44 flex items-center justify-center text-xs text-slate-400">
            Decoding audio buffer for spectral FFT...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={860}
            height={200}
            className="w-full min-w-[500px] h-44 block rounded-lg"
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 px-1">
        <span>Time → 0s to {internalBuffer ? `${internalBuffer.duration.toFixed(1)}s` : '--'}</span>
        <span>Frequency ↑ 0 Hz to {internalBuffer ? `${Math.round(internalBuffer.sampleRate / 2000)} kHz (Nyquist)` : '8 kHz'}</span>
      </div>
    </div>
  );
};
