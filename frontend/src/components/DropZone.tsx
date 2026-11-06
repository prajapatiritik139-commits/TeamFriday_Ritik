import React, { useState, useRef, DragEvent, ChangeEvent, MouseEvent } from 'react';
import { Upload, Mic, AlertCircle, Loader2 } from 'lucide-react';
import { validateFileBasics, validateAudioDurationAndSignal } from '../lib/validate';

interface DropZoneProps {
  onAudioSelected: (file: File) => void;
  onRecordClick?: () => void;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onAudioSelected,
  onRecordClick,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 3D Tilt & Specular state for Drop Zone
  const [dropTilt, setDropTilt] = useState({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });

  // 3D Tilt & Magnetic state for Record Button
  const [recTilt, setRecTilt] = useState({ rotX: 0, rotY: 0, magX: 0, magY: 0, hX: -1000, hY: -1000, active: false });

  // Check touch device
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const processFile = async (file: File) => {
    setErrorMessage(null);

    // 1. Check basic size and extension
    const basic = validateFileBasics(file);
    if (!basic.valid) {
      setErrorMessage(basic.error || 'Invalid file.');
      return;
    }

    // 2. Decode and validate duration & signal
    setIsValidating(true);
    try {
      const result = await validateAudioDurationAndSignal(file);
      if (!result.valid) {
        setErrorMessage(result.error || 'Audio duration or content is invalid.');
        return;
      }
      onAudioSelected(file);
    } catch {
      setErrorMessage('Failed to decode audio. Please ensure the file is a valid audio track.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || isValidating) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isValidating) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    if (disabled || isValidating) return;
    fileInputRef.current?.click();
  };

  // 3D tilt on dropzone hover
  const handleDropMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isTouch || disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotX = -((y - rect.height / 2) / (rect.height / 2)) * 6;
    const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 6;
    setDropTilt({ rotX, rotY, hX: x, hY: y, active: true });
  };

  const handleDropMouseLeave = () => {
    setDropTilt({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });
  };

  // 3D tilt & magnetic pull on record button hover
  const handleRecMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (isTouch || disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotX = -((y - rect.height / 2) / (rect.height / 2)) * 6;
    const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 6;
    const magX = ((x - rect.width / 2) / (rect.width / 2)) * 6;
    const magY = ((y - rect.height / 2) / (rect.height / 2)) * 6;
    setRecTilt({ rotX, rotY, magX, magY, hX: x, hY: y, active: true });
  };

  const handleRecMouseLeave = () => {
    setRecTilt({ rotX: 0, rotY: 0, magX: 0, magY: 0, hX: -1000, hY: -1000, active: false });
  };

  return (
    <div className="w-full space-y-3 perspective-container">
      <div className="flex flex-col md:flex-row gap-3 items-stretch w-full">
        {/* Main Upload Drop Zone with 3D Tilt and Specular Highlight */}
        <div
          onClick={handleClick}
          onMouseMove={handleDropMouseMove}
          onMouseLeave={handleDropMouseLeave}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              handleClick();
            }
          }}
          aria-label="Upload audio file for deepfake analysis"
          aria-disabled={disabled}
          data-echo-target="dropzone"
          style={{
            transform: dropTilt.active
              ? `perspective(1000px) rotateX(${dropTilt.rotX.toFixed(2)}deg) rotateY(${dropTilt.rotY.toFixed(2)}deg)`
              : 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
          }}
          className={`group relative flex-1 rounded-2xl p-7 md:p-9 text-center cursor-pointer select-none glass-panel flex flex-col items-center justify-center overflow-hidden tilt-card ${
            isDragging
              ? 'border-cyan-400 bg-cyan-950/25 shadow-[0_0_30px_rgba(34,211,238,0.25)] scale-[1.01]'
              : 'hover:border-cyan-400/40 hover:bg-white/[0.05] border-white/10'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Moving Specular Highlight */}
          {dropTilt.active && (
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-150"
              style={{
                background: `radial-gradient(circle 280px at ${dropTilt.hX}px ${dropTilt.hY}px, rgba(255,255,255,0.08), transparent 70%)`,
              }}
              aria-hidden="true"
            />
          )}

          {/* Animated dashed SVG border overlay when dragging */}
          {isDragging && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl"
              style={{ strokeDasharray: '8 6', animation: 'dash-march 1s linear infinite' }}
            >
              <rect
                x="1.5"
                y="1.5"
                width="calc(100% - 3px)"
                height="calc(100% - 3px)"
                rx="14"
                fill="none"
                stroke="#22D3EE"
                strokeWidth="2"
              />
            </svg>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.ogg,.flac,.webm,audio/*"
            onChange={handleFileChange}
            disabled={disabled || isValidating}
            className="hidden"
            aria-hidden="true"
          />

          <div className="flex flex-col items-center justify-center gap-3.5 z-10">
            {/* Upload Icon with Pulsing Ring */}
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing ring */}
              <span
                className="absolute -inset-2.5 rounded-full bg-cyan-400/20 blur-[2px] animate-pulse pointer-events-none"
                aria-hidden="true"
              />
              <span
                className="absolute -inset-1 rounded-full border border-cyan-400/30 pointer-events-none group-hover:scale-110 transition-transform"
                aria-hidden="true"
              />
              <div className="w-13 h-13 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)] group-hover:scale-105 group-hover:text-cyan-200 transition-all">
                {isValidating ? (
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                ) : (
                  <Upload className="w-6 h-6 text-cyan-400" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm md:text-base font-semibold text-white tracking-tight">
                {isValidating ? 'Validating audio stream...' : 'Drop audio recording here, or browse'}
              </p>
              <p className="text-xs text-slate-400">
                WAV, MP3, M4A, OGG, FLAC, WebM · 1 to 60 s, up to 25 MB
              </p>
            </div>
          </div>
        </div>

        {/* Clear Record Button Beside It (Magnetic + 3D Tilt) */}
        {onRecordClick && (
          <button
            type="button"
            onClick={onRecordClick}
            onMouseMove={handleRecMouseMove}
            onMouseLeave={handleRecMouseLeave}
            disabled={disabled || isValidating}
            style={{
              transform: recTilt.active
                ? `perspective(1000px) rotateX(${recTilt.rotX.toFixed(2)}deg) rotateY(${recTilt.rotY.toFixed(2)}deg) translate3d(${recTilt.magX.toFixed(1)}px, ${recTilt.magY.toFixed(1)}px, 0)`
                : 'perspective(1000px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)',
            }}
            className="w-full md:w-48 rounded-2xl p-5 md:p-6 glass-panel hover:bg-white/[0.06] border border-white/10 hover:border-cyan-400/40 flex flex-row md:flex-col items-center justify-center gap-3 text-slate-200 hover:text-white transition-all duration-150 cursor-pointer group shadow-lg shrink-0 select-none magnetic-btn relative overflow-hidden"
            aria-label="Record voice using microphone"
            data-echo-target="record"
          >
            {/* Specular Highlight for Record Button */}
            {recTilt.active && (
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-150"
                style={{
                  background: `radial-gradient(circle 160px at ${recTilt.hX}px ${recTilt.hY}px, rgba(255,255,255,0.1), transparent 70%)`,
                }}
                aria-hidden="true"
              />
            )}

            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 group-hover:border-cyan-400/30 group-hover:bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-all shadow-[0_0_12px_rgba(34,211,238,0.15)] z-10 shrink-0">
              <Mic className="w-6 h-6" />
            </div>
            <div className="text-left md:text-center z-10">
              <span className="block text-sm font-semibold text-white tracking-tight">
                Record Voice
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                Direct microphone
              </span>
            </div>
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400 text-center hidden md:block">
        Laptop microphones add noise; phone-recorded or uploaded clips give more reliable results.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
