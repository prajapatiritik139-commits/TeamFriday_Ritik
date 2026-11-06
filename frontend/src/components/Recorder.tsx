import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertCircle, Volume2 } from 'lucide-react';
import { validateAudioDurationAndSignal } from '../lib/validate';
import { notifyMicStarted, notifyMicStopped } from '../lib/soundEffects';

interface RecorderProps {
  onAudioRecorded: (file: File) => void;
  onCancel: () => void;
}

export const Recorder: React.FC<RecorderProps> = ({ onAudioRecorded, onCancel }) => {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'review'>('idle');
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1
  const [micError, setMicError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const isRecordingActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      stopTracks();
      if (isRecordingActiveRef.current) {
        isRecordingActiveRef.current = false;
        notifyMicStopped();
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [audioUrl]);

  const stopTracks = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = async () => {
    setMicError(null);
    setValidationError(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Maintain natural forensic acoustics
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Setup audio analyzer for live level meter
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        setAudioLevel(Math.min(1, avg * 2.2));
        animFrameRef.current = requestAnimationFrame(checkLevel);
      };
      checkLevel();

      // Determine supported mime type
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
      const supportedType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

      const mediaRecorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState('review');
        stopTracks();
        if (isRecordingActiveRef.current) {
          isRecordingActiveRef.current = false;
          notifyMicStopped();
        }
      };

      mediaRecorder.start(200); // 200ms slice
      isRecordingActiveRef.current = true;
      notifyMicStarted();
      setRecordingState('recording');
      setRecordedSeconds(0);

      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordedSeconds(elapsed);
        if (elapsed >= 10) {
          stopRecording();
        }
      }, 500);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone access was denied. Please allow microphone permission in your browser address bar.');
      } else if (err.name === 'NotFoundError') {
        setMicError('No audio input device found. Please connect a microphone.');
      } else {
        setMicError(`Unable to start audio recording: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordedSeconds(0);
    setRecordingState('idle');
    setValidationError(null);
  };

  const togglePlayback = () => {
    if (!audioElementRef.current) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const submitRecording = async () => {
    if (!audioBlob) return;
    setValidationError(null);

    const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('ogg') ? 'ogg' : 'wav';
    const file = new File([audioBlob], `voxsentra_mic_capture.${ext}`, {
      type: audioBlob.type,
      lastModified: Date.now(),
    });

    const val = await validateAudioDurationAndSignal(file);
    if (!val.valid) {
      setValidationError(val.error || 'Recording duration does not meet requirements (1-60 seconds).');
      return;
    }

    onAudioRecorded(file);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-6 md:p-8 border border-white/10 text-center">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 text-left">
        <div>
          <h3 className="text-base font-semibold text-white">Direct Microphone Capture</h3>
          <p className="text-xs text-slate-400 mt-0.5">Captures high-fidelity mono/stereo voice clip</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/10"
        >
          Close
        </button>
      </div>

      {micError && (
        <div role="alert" className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-left flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-200">Microphone Unavailable</p>
            <p className="mt-1">{micError}</p>
          </div>
        </div>
      )}

      {recordingState === 'idle' && (
        <div className="py-8 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={startRecording}
            className="w-16 h-16 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            aria-label="Start recording"
          >
            <Mic className="w-8 h-8" />
          </button>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-200">Click to start voice recording (5–10 seconds)</p>
            <p className="text-xs text-slate-400 hidden md:block">
              Laptop microphones add noise; phone-recorded or uploaded clips give more reliable results.
            </p>
          </div>
        </div>
      )}

      {recordingState === 'recording' && (
        <div className="py-6 flex flex-col items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-3xl font-mono font-bold text-white tracking-wider tabular-nums">
              {formatTime(recordedSeconds)}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 00:10</span>
          </div>

          {/* Live Level Meter */}
          <div className="w-full max-w-xs h-3 rounded-full bg-white/10 overflow-hidden relative border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-all duration-75"
              style={{ width: `${Math.round(audioLevel * 100)}%` }}
            />
          </div>

          <p className="text-xs text-slate-400">
            {recordedSeconds < 5
              ? `Keep speaking (${5 - recordedSeconds}s until minimum 5s threshold)...`
              : 'Sufficient audio captured. Click stop or recording will auto-finish at 10s.'}
          </p>

          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold shadow-md shadow-rose-500/20 transition-all cursor-pointer"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>Stop Recording</span>
          </button>

          <p className="text-[11px] text-slate-400 max-w-md hidden md:block">
            Laptop microphones add noise; phone-recorded or uploaded clips give more reliable results.
          </p>
        </div>
      )}

      {recordingState === 'review' && audioUrl && (
        <div className="py-4 flex flex-col items-center gap-5">
          <audio
            ref={audioElementRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/15 text-cyan-400 flex items-center justify-center border border-white/10 transition-colors"
              aria-label={isPlaying ? 'Pause review audio' : 'Play review audio'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Recorded Audio</p>
              <p className="text-xs font-mono text-slate-400 tabular-nums">
                Duration: {recordedSeconds} seconds
              </p>
            </div>
          </div>

          {validationError && (
            <div role="alert" className="px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {validationError}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={resetRecording}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg border border-white/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Record Again</span>
            </button>
            <button
              type="button"
              onClick={submitRecording}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded-lg shadow-md shadow-cyan-500/20 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Submit for Verification</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
