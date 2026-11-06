import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  PhoneCall,
  Radio,
  Upload,
  AlertTriangle,
  Clock,
  Activity,
  Mic,
  MicOff,
  Sliders,
  Sparkles,
  Info,
  RotateCcw,
  Volume2,
  FileAudio,
  Film,
  XCircle,
  Shield,
  ShieldAlert,
  Waves,
  FileDown,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TriageAnalyzeResponse,
  TriageWindow,
  TriageSession,
  analyzeCallTriage,
  downloadCallReportCsv,
  buildTriageWsUrl,
  resampleTo16k,
  floatTo16BitPCM,
  getSampleTriageData,
} from '../lib/triage';
import { getApiKey } from '../lib/api';
import {
  playAnalysisStarted,
  playAnalysisFinished,
  playVerdictSound,
  notifyMicStarted,
  notifyMicStopped,
} from '../lib/soundEffects';

interface CallTriageViewProps {
  triageUrl: string;
  onOpenSettings: () => void;
}

// 5 Soft Color Signals per specification:
// Anger (red), Fear (orange), Distress (blue), Calm (grey), Happy (green)
const EMOTIONS = [
  { key: 'ANG', label: 'Anger', color: '#F43F5E', barClass: 'bg-rose-500', textClass: 'text-rose-400' },
  { key: 'FEA', label: 'Fear', color: '#F97316', barClass: 'bg-orange-500', textClass: 'text-orange-400' },
  { key: 'SAD', label: 'Distress', color: '#3B82F6', barClass: 'bg-blue-500', textClass: 'text-blue-400' },
  { key: 'NEU', label: 'Calm', color: '#94A3B8', barClass: 'bg-slate-400', textClass: 'text-slate-300' },
  { key: 'HAP', label: 'Happy', color: '#10B981', barClass: 'bg-emerald-500', textClass: 'text-emerald-400' },
] as const;

// 1) Live Waveform Visualizer using Web Audio AnalyserNode
interface LiveWaveformProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isLive: boolean;
  priorityLevel: string;
}

const LiveWaveform: React.FC<LiveWaveformProps> = ({
  analyserRef,
  isLive,
  priorityLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const getColor = (alpha = 1) => {
      if (priorityLevel === 'HIGH') return `rgba(244, 63, 94, ${alpha})`;
      if (priorityLevel === 'MEDIUM') return `rgba(245, 158, 11, ${alpha})`;
      return `rgba(16, 185, 129, ${alpha})`;
    };

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (!isLive || !analyserRef.current) {
        // Flat dim dashed line across center when mic is idle
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Draw mirrored equalizer bars with rounded caps
      const barCount = 38;
      const spacing = width / barCount;
      const barWidth = Math.max(2, spacing * 0.65);
      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        // Mirrored center distribution
        const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
        const binIndex = Math.min(bufferLength - 1, Math.floor(distFromCenter * bufferLength));
        const raw = dataArray[binIndex] || 0;
        const normalized = raw / 255;
        const barHeight = Math.max(3, normalized * (height / 2 - 4));
        const x = i * spacing + (spacing - barWidth) / 2;

        const grad = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY + barHeight);
        grad.addColorStop(0, getColor(0.75));
        grad.addColorStop(0.5, getColor(1));
        grad.addColorStop(1, getColor(0.75));

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, [2]);
        } else {
          ctx.rect(x, centerY - barHeight, barWidth, barHeight * 2);
        }
        ctx.fill();
      }

      // Center glowing hairline
      ctx.beginPath();
      ctx.strokeStyle = getColor(0.55);
      ctx.lineWidth = 1;
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(draw);
      }
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      draw();
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isLive && !prefersReducedMotion) {
      animId = requestAnimationFrame(draw);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isLive, priorityLevel, analyserRef]);

  return (
    <div className="w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-12 block"
        style={{ width: '100%', height: '48px' }}
        aria-label="Real-time acoustic audio waveform"
      />
    </div>
  );
};

// 2) Pentagon Radar Chart for 5 Emotion Signals
interface EmotionRadarPentagonProps {
  emotionAverages: Array<{
    key: string;
    label: string;
    color: string;
    value: number;
    percent: number;
  }>;
  hasData: boolean;
}

const EmotionRadarPentagon: React.FC<EmotionRadarPentagonProps> = ({
  emotionAverages,
  hasData,
}) => {
  const [animatedProbs, setAnimatedProbs] = useState<number[]>([0, 0, 0, 0, 0]);

  // Center (160, 145), Radius 88
  const cx = 160;
  const cy = 145;
  const R = 88;

  // 5 vertices: Anger (top), Fear (top-right), Distress (bottom-right), Calm (bottom-left), Happy (top-left)
  const ANGLES = useMemo(
    () => [
      -Math.PI / 2,
      -Math.PI / 2 + (2 * Math.PI) / 5,
      -Math.PI / 2 + (4 * Math.PI) / 5,
      -Math.PI / 2 + (6 * Math.PI) / 5,
      -Math.PI / 2 + (8 * Math.PI) / 5,
    ],
    []
  );

  // Smooth morphing interpolation (~600ms ease)
  useEffect(() => {
    const target = hasData
      ? emotionAverages.map((e) => Math.max(0, Math.min(1, e.value)))
      : [0, 0, 0, 0, 0];
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimatedProbs(target);
      return;
    }

    const start = [...animatedProbs];
    const startTime = performance.now();
    const duration = 600;

    let frameId: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = start.map((s, i) => s + (target[i] - s) * ease);
      setAnimatedProbs(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [emotionAverages, hasData]);

  // Concentric pentagons: 20%, 40%, 60%, 80%, 100%
  const getGridPoints = (level: number) => {
    return ANGLES.map((angle) => {
      const x = cx + Math.cos(angle) * (R * level);
      const y = cy + Math.sin(angle) * (R * level);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  };

  // Data polygon points
  const dataPoints = ANGLES.map((angle, i) => {
    const val = Math.max(0.04, Math.min(1, animatedProbs[i] || 0));
    const x = cx + Math.cos(angle) * (R * val);
    const y = cy + Math.sin(angle) * (R * val);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Outer axis tips with metadata
  const axisMeta = [
    { label: 'Anger', key: 'ANG', color: '#F43F5E', xOffset: 0, yOffset: -16, anchor: 'middle' as const },
    { label: 'Fear', key: 'FEA', color: '#F97316', xOffset: 12, yOffset: -2, anchor: 'start' as const },
    { label: 'Distress', key: 'SAD', color: '#3B82F6', xOffset: 10, yOffset: 16, anchor: 'start' as const },
    { label: 'Calm', key: 'NEU', color: '#94A3B8', xOffset: -10, yOffset: 16, anchor: 'end' as const },
    { label: 'Happy', key: 'HAP', color: '#10B981', xOffset: -12, yOffset: -2, anchor: 'end' as const },
  ];

  return (
    <div className="relative w-full max-w-[340px] mx-auto aspect-[320/275] select-none flex items-center justify-center">
      <svg
        viewBox="0 0 320 275"
        className="w-full h-full overflow-visible"
        aria-label="Emotion radar pentagon chart"
      >
        <defs>
          <linearGradient id="radarFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#818CF8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.5" />
          </linearGradient>
          <filter id="radarGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Concentric grid pentagons: 20%, 40%, 60%, 80%, 100% */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((level) => (
          <polygon
            key={level}
            points={getGridPoints(level)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={level === 1.0 ? '1.5' : '1'}
            strokeDasharray={level < 1.0 ? '3 3' : undefined}
          />
        ))}

        {/* Spokes from center to 5 vertices */}
        {ANGLES.map((angle, i) => {
          const x = cx + Math.cos(angle) * R;
          const y = cy + Math.sin(angle) * R;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon or Idle subtle breathing shape */}
        {hasData ? (
          <>
            <polygon
              points={dataPoints}
              fill="url(#radarFillGrad)"
              stroke="#22D3EE"
              strokeWidth="2"
              filter="url(#radarGlow)"
              style={{
                filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.4))',
              }}
            />

            {/* Glowing dots at data vertices */}
            {ANGLES.map((angle, i) => {
              const val = Math.max(0.04, Math.min(1, animatedProbs[i] || 0));
              const vx = cx + Math.cos(angle) * (R * val);
              const vy = cy + Math.sin(angle) * (R * val);
              return (
                <g key={i}>
                  <circle
                    cx={vx}
                    cy={vy}
                    r="4"
                    fill={axisMeta[i].color}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    style={{ filter: `drop-shadow(0 0 6px ${axisMeta[i].color})` }}
                  />
                </g>
              );
            })}
          </>
        ) : (
          <g className="triage-breathing-glow">
            <polygon
              points={getGridPoints(0.28)}
              fill="rgba(34, 211, 238, 0.04)"
              stroke="rgba(34, 211, 238, 0.25)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(148, 163, 184, 0.6)"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              Awaiting Signals
            </text>
          </g>
        )}

        {/* Axis dots and labels */}
        {ANGLES.map((angle, i) => {
          const tipX = cx + Math.cos(angle) * R;
          const tipY = cy + Math.sin(angle) * R;
          const meta = axisMeta[i];
          const labelX = tipX + meta.xOffset;
          const labelY = tipY + meta.yOffset;
          const pct = hasData ? emotionAverages[i]?.percent ?? 0 : null;

          return (
            <g key={i} className="select-none">
              {/* Outer axis colored tip dot */}
              <circle
                cx={tipX}
                cy={tipY}
                r="3.5"
                fill={meta.color}
                opacity={hasData ? 0.95 : 0.45}
                style={{ filter: hasData ? `drop-shadow(0 0 5px ${meta.color})` : undefined }}
              />

              {/* Text label with colored percentage */}
              <text
                x={labelX}
                y={labelY}
                textAnchor={meta.anchor}
                dominantBaseline="central"
                fontSize="11"
                className="font-sans font-semibold tracking-tight"
                fill={hasData ? '#E2E8F0' : '#64748B'}
              >
                {meta.label}
                <tspan
                  fill={hasData ? meta.color : '#64748B'}
                  className="font-mono font-bold"
                >
                  {' '}{hasData ? `${pct}%` : '—'}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const CallTriageView: React.FC<CallTriageViewProps> = ({
  triageUrl,
  onOpenSettings,
}) => {
  // Input states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [callLabel, setCallLabel] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // Analysis & Live states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageAnalyzeResponse | null>(null);
  const [isSampleData, setIsSampleData] = useState(false);
  const [hoveredWindow, setHoveredWindow] = useState<{ window: TriageWindow; index: number } | null>(null);

  // Live WebSocket state
  const [isLive, setIsLive] = useState(false);
  const [liveDuration, setLiveDuration] = useState(0);
  const [liveAudioLevel, setLiveAudioLevel] = useState(0);
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(null);

  // CSV Report download states
  const [downloadingCallId, setDownloadingCallId] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const isLiveActiveRef = useRef(false);
  const liveCallIdRef = useRef<string | null>(null);

  // Animated Priority Gauge & Pulse states
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const [isHighPulsing, setIsHighPulsing] = useState(false);
  const prevLevelRef = useRef<string | null>(null);

  // Clean up streaming on unmount
  useEffect(() => {
    return () => {
      stopLiveStreaming();
    };
  }, []);

  // Loading elapsed timer
  useEffect(() => {
    let interval: number | null = null;
    if (isLoading) {
      setLoadingTime(0);
      interval = window.setInterval(() => {
        setLoadingTime((prev) => prev + 0.1);
      }, 100);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setError(null);
    }
  };

  // Perform Analyze POST
  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError('Please choose an audio or video file to analyze.');
      return;
    }

    if (!triageUrl.trim()) {
      setError('Call Triage server URL is not configured. Please enter it in Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsSampleData(false);
    stopLiveStreaming();

    // 4a) Analysis started sound: two quick rising notes
    playAnalysisStarted();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await analyzeCallTriage(
        triageUrl,
        selectedFile,
        callLabel.trim() || undefined,
        controller.signal
      );
      setResult(res);
      // 4b & 5) Analysis finished chime & verdict chord/tone
      playAnalysisFinished();
      setTimeout(() => {
        playVerdictSound(res.session?.level);
      }, 340);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Call triage analysis failed.');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Stop current analysis
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  };

  // Stop live streaming
  const stopLiveStreaming = () => {
    if (liveTimerRef.current) {
      clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (isLiveActiveRef.current) {
      isLiveActiveRef.current = false;
      notifyMicStopped();
    }

    setIsLive(false);
    setLiveAudioLevel(0);
  };

  // Start Live WebSocket stream
  const handleToggleLive = async () => {
    if (isLive) {
      stopLiveStreaming();
      setLiveStatusMessage('Live stream stopped.');
      return;
    }

    if (!triageUrl.trim()) {
      setError('Call Triage server URL is required for live streaming. Please configure it in Settings.');
      return;
    }

    setError(null);
    setLiveStatusMessage('Connecting microphone to live triage stream...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = stream;

      const randomId = 'stream_' + Math.random().toString(36).substring(2, 10);
      liveCallIdRef.current = randomId;
      const wsUrl = buildTriageWsUrl(triageUrl, randomId);

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLive(true);
        isLiveActiveRef.current = true;
        notifyMicStarted();
        setLiveDuration(0);
        setLiveStatusMessage(`Streaming 16 kHz PCM to server`);

        liveTimerRef.current = window.setInterval(() => {
          setLiveDuration((prev) => prev + 1);
        }, 1000);

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtxClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);

        // Web Audio AnalyserNode for live waveform equalizer
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;

        const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = scriptProcessor;

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioCtx.destination);

        scriptProcessor.onaudioprocess = (audioEvent) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputFloat32 = audioEvent.inputBuffer.getChannelData(0);

          let sumSquares = 0;
          for (let i = 0; i < inputFloat32.length; i++) {
            sumSquares += inputFloat32[i] * inputFloat32[i];
          }
          const rms = Math.sqrt(sumSquares / inputFloat32.length);
          setLiveAudioLevel(Math.min(1, rms * 4));

          const resampled = resampleTo16k(inputFloat32, audioEvent.inputBuffer.sampleRate);
          const pcm16 = floatTo16BitPCM(resampled);

          ws.send(pcm16.buffer as ArrayBuffer);
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && msg.type === 'score') {
            setResult((prev) => {
              const prevWindows = prev ? [...prev.windows] : [];
              const winStart = typeof msg.start_s === 'number'
                ? msg.start_s
                : prevWindows.length > 0
                ? prevWindows[prevWindows.length - 1].start_s + 6.0
                : 0.0;

              const newWindow: TriageWindow = {
                start_s: winStart,
                probs: msg.probs || {},
                urgency: typeof msg.urgency === 'number' ? msg.urgency : 0,
                level: msg.level || 'LOW',
                top_label: msg.top_label,
                confidence: typeof msg.confidence === 'number' ? msg.confidence : undefined,
                uncertain: typeof msg.uncertain === 'boolean' ? msg.uncertain : undefined,
              };

              const updatedWindows = [...prevWindows, newWindow].slice(-30);

              const resolvedCallId = msg.call_id || msg.session?.call_id || prev?.call_id || liveCallIdRef.current || 'live_stream';

              const liveSession: TriageSession = msg.session || {
                level: msg.level || 'LOW',
                urgency: typeof msg.urgency === 'number' ? msg.urgency : 0,
                windows: updatedWindows.length,
                top_label: msg.top_label,
                peak_urgency: Math.max(...updatedWindows.map((w) => w.urgency)),
                uncertain: typeof msg.session?.uncertain === 'boolean'
                  ? msg.session.uncertain
                  : typeof msg.uncertain === 'boolean'
                  ? msg.uncertain
                  : undefined,
                call_id: resolvedCallId,
              };

              // Ensure session.uncertain is carried over if present in msg.uncertain
              if (liveSession.uncertain === undefined && typeof msg.uncertain === 'boolean') {
                liveSession.uncertain = msg.uncertain;
              }
              if (!liveSession.call_id) {
                liveSession.call_id = resolvedCallId;
              }

              return {
                duration_s: updatedWindows.length * 6.0,
                latency_ms: msg.latency_ms || undefined,
                windows: updatedWindows,
                session: liveSession,
                disclaimer: msg.disclaimer || prev?.disclaimer || 'Live acoustic triage stream active.',
                label: callLabel.trim() || 'Live Mic Stream',
                call_id: resolvedCallId,
              };
            });
          }
        } catch {
          // Ignore non-JSON
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket triage error:', e);
        setError(`Live stream connection error with WebSocket at ${wsUrl}. Verify backend is accessible.`);
        stopLiveStreaming();
      };

      ws.onclose = () => {
        stopLiveStreaming();
        setLiveStatusMessage('Live stream connection closed.');
      };
    } catch (err: any) {
      stopLiveStreaming();
      setError(`Microphone or WebSocket error: ${err.message || err}`);
    }
  };

  // Load sample demo data
  const handleLoadDemo = () => {
    setError(null);
    stopLiveStreaming();
    setIsSampleData(true);
    const demo = getSampleTriageData();
    setResult(demo);
    setCallLabel(demo.label || '[Sample Data] Cybercrime Extortion Call #49102');
    playAnalysisFinished();
    setTimeout(() => {
      playVerdictSound(demo.session?.level);
    }, 320);
  };

  // Reset triage workspace
  const handleReset = () => {
    stopLiveStreaming();
    setIsSampleData(false);
    setSelectedFile(null);
    setCallLabel('');
    setResult(null);
    setError(null);
    setReportError(null);
    liveCallIdRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download Report CSV handler
  const handleDownloadReport = async (callId?: string) => {
    const targetCallId = callId || result?.call_id || result?.session?.call_id || (result?.label ? `call_${result.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}` : 'current_call');
    if (!targetCallId) {
      setReportError('No Call ID available for CSV report generation.');
      return;
    }

    if (!triageUrl.trim()) {
      setReportError('Call Triage server URL is not configured. Please enter it in Settings.');
      return;
    }

    setReportError(null);
    setDownloadingCallId(targetCallId);

    try {
      const apiKey = getApiKey();
      await downloadCallReportCsv(triageUrl, targetCallId, apiKey);
    } catch (err: any) {
      setReportError(err?.message || 'Failed to download CSV report from backend.');
    } finally {
      setDownloadingCallId(null);
    }
  };

  // Compute emotion averages across all windows
  const emotionAverages = useMemo(() => {
    if (!result) {
      return EMOTIONS.map((emotion) => ({
        ...emotion,
        value: 0,
        percent: 0,
      }));
    }
    const windows = result.windows || [];

    if (windows.length > 0) {
      return EMOTIONS.map((emotion) => {
        let sum = 0;
        let count = 0;
        for (const w of windows) {
          if (w.probs && typeof w.probs[emotion.key] === 'number') {
            sum += w.probs[emotion.key]!;
            count++;
          }
        }
        const avg = count > 0 ? sum / count : 0;
        return {
          ...emotion,
          value: avg,
          percent: Math.min(100, Math.max(0, Math.round(avg * 100))),
        };
      });
    }

    return EMOTIONS.map((emotion) => ({
      ...emotion,
      value: 0,
      percent: 0,
    }));
  }, [result]);

  // Session urgency score & level
  const urgencyScore = result?.session?.urgency !== undefined ? Math.round(result.session.urgency) : null;
  const sessionLevel = (result?.session?.level || 'LOW').toUpperCase();
  const sessionWindowsCount = result?.session?.windows ?? (result?.windows ? result.windows.length : 0);
  const isProvisional = sessionWindowsCount === 1;

  // Resolved Call ID for CSV report
  const callIdForReport = result?.call_id || result?.session?.call_id || (result?.label ? `call_${result.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}` : null);

  // Level color palette: LOW green, MEDIUM amber, HIGH red
  const getLevelBadgeStyles = (level: string) => {
    switch (level) {
      case 'HIGH':
        return {
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)]',
          dot: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse',
          stroke: '#F43F5E',
          glow: 'rgba(244, 63, 94, 0.45)',
          label: 'HIGH',
        };
      case 'MEDIUM':
        return {
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]',
          dot: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]',
          stroke: '#F59E0B',
          glow: 'rgba(245, 158, 11, 0.4)',
          label: 'MEDIUM',
        };
      case 'LOW':
      default:
        return {
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]',
          dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]',
          stroke: '#10B981',
          glow: 'rgba(16, 185, 129, 0.4)',
          label: 'LOW',
        };
    }
  };

  const levelStyles = getLevelBadgeStyles(sessionLevel);

  // 3) Priority gauge: animate number with count-up & smooth sweep
  useEffect(() => {
    if (urgencyScore === null) {
      setAnimatedScore(null);
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setAnimatedScore(urgencyScore);
      return;
    }

    const start = animatedScore !== null ? animatedScore : 0;
    const target = urgencyScore;
    const duration = 650;
    const startTime = performance.now();

    let frameId: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(start + (target - start) * ease));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [urgencyScore]);

  // When the level becomes HIGH, play one short pulse of the red glow (once, not looping)
  useEffect(() => {
    if (sessionLevel === 'HIGH' && prevLevelRef.current !== 'HIGH' && result) {
      setIsHighPulsing(true);
      const timer = window.setTimeout(() => setIsHighPulsing(false), 950);
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = sessionLevel;
  }, [sessionLevel, result]);

  // Helper: Dominant emotion for 6-second window in heat ribbon
  const getDominantEmotion = (win: TriageWindow) => {
    const probs = win.probs || {};
    let maxKey: string = 'NEU';
    let maxVal: number = -1;
    for (const em of EMOTIONS) {
      const p = probs[em.key];
      const val: number = typeof p === 'number' ? p : 0;
      if (val > maxVal) {
        maxVal = val;
        maxKey = em.key;
      }
    }
    const match = EMOTIONS.find((e) => e.key === maxKey) || EMOTIONS[3];
    return {
      ...match,
      prob: maxVal > 0 ? maxVal : 0,
      percent: Math.min(100, Math.max(0, Math.round(maxVal * 100))),
    };
  };

  // SVG Circular Gauge calculation
  const gaugeRadius = 64;
  const circumference = 2 * Math.PI * gaugeRadius;
  const strokeDashoffset = urgencyScore !== null
    ? circumference - (Math.min(100, Math.max(0, urgencyScore)) / 100) * circumference
    : circumference;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-5">
      {/* 1) Top: Compact Hero Header Card */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-[20px] p-4 sm:p-5 bg-gradient-to-b from-[#0D1528]/95 via-[#0C1222]/95 to-[#080D1A]/95 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 text-[11px] font-mono mb-1">
              <PhoneCall className="w-3 h-3" />
              <span>Voice Signal Priority</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-cyan-200 bg-clip-text text-transparent font-display tracking-tight">
              Cybercrime Call Triage
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Spot the calls that need attention first
            </p>
          </div>

          {/* Action buttons (Tidy Load Sample Data + Reset) */}
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={handleLoadDemo}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Load simulated cybercrime call data (not a real call)"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Load sample data (not a real call)</span>
            </button>

            {result && (
              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer flex items-center gap-1"
                title="Reset workspace"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Small & Tidy Server URL Notice Banner (if not configured) */}
      {!triageUrl.trim() && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-200 text-xs shadow-md backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Call Triage server URL not configured.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-semibold text-xs hover:bg-amber-300 transition-colors shrink-0 cursor-pointer shadow-sm"
          >
            Settings
          </button>
        </motion.div>
      )}

      {/* Error notification banner if any */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2.5 text-rose-200 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

      {/* 2) Main Area: Two columns on laptop, one column on phones */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* a) Left Card: "Priority" */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:col-span-5 triage-glass-card rounded-[20px] p-5 sm:p-6 flex flex-col items-center justify-between relative text-center"
        >
          {/* Card Title & Label */}
          <div className="w-full flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white font-display tracking-wider uppercase">
                Priority
              </h3>
            </div>

            {isSampleData ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 font-bold uppercase tracking-wider">
                Sample Data
              </span>
            ) : result?.label ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-cyan-300 max-w-[130px] truncate">
                {result.label}
              </span>
            ) : null}
          </div>

          {/* Large Circular Urgency Gauge with Single Red Pulse on HIGH */}
          <div
            className={`relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center my-4 select-none rounded-full transition-all ${
              isHighPulsing ? 'priority-high-single-pulse' : ''
            }`}
          >
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              {/* Background circular track */}
              <circle
                cx="80"
                cy="80"
                r={gaugeRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="11"
              />

              {/* Progress arc (LOW green, MEDIUM amber, HIGH red) */}
              <circle
                cx="80"
                cy="80"
                r={gaugeRadius}
                fill="none"
                stroke={urgencyScore !== null ? levelStyles.stroke : 'rgba(255, 255, 255, 0.12)'}
                strokeWidth="11"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease',
                  filter: urgencyScore !== null ? `drop-shadow(0 0 10px ${levelStyles.glow})` : undefined,
                }}
              />
            </svg>

            {/* Center Gauge Readout with Count-Up / Empty State */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              {urgencyScore !== null ? (
                <>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white tabular-nums tracking-tight">
                      {animatedScore !== null ? animatedScore : urgencyScore}
                    </span>
                    <span className="text-xs font-mono text-slate-400 font-medium">/100</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1 font-semibold">
                    Urgency Score
                  </span>
                </>
              ) : (
                <div className="space-y-1">
                  <span className="text-4xl sm:text-5xl font-extrabold font-mono text-slate-500 block leading-none">
                    -
                  </span>
                  <p className="text-[11px] text-slate-300 font-medium leading-tight max-w-[130px] mx-auto mt-2">
                    Upload a recording or tap the mic
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Level badge and notes under gauge */}
          <div className="w-full flex flex-col items-center gap-1.5 pt-1">
            {urgencyScore !== null ? (
              <>
                <div
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border select-none transition-all ${levelStyles.badge}`}
                >
                  <span className={`w-2 h-2 rounded-full ${levelStyles.dot}`} />
                  <span>{sessionLevel} PRIORITY</span>
                </div>

                {/* LOW CONFIDENCE orange note under priority gauge when session.uncertain is true */}
                {result?.session?.uncertain && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-sm mt-1 px-3 py-2 rounded-xl bg-orange-500/15 border border-orange-500/40 text-orange-200 text-xs font-semibold flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.2)] select-none"
                  >
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs leading-tight text-center">
                      LOW CONFIDENCE: an officer should listen to this call.
                    </span>
                  </motion.div>
                )}

                {/* Provisional notice if only 1 window */}
                {isProvisional && (
                  <p className="text-[11px] font-mono text-amber-300/90 italic mt-0.5">
                    provisional: only 1 window
                  </p>
                )}

                {result?.session?.top_label && (
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">
                    Dominant: <strong className="text-white">{result.session.top_label}</strong>
                  </p>
                )}

                {/* Report CSV Button & Status under priority gauge */}
                {callIdForReport && (
                  <div className="w-full flex flex-col items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => handleDownloadReport(callIdForReport)}
                      disabled={downloadingCallId === callIdForReport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 text-xs font-medium transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      title={`Download CSV report for call: ${callIdForReport}`}
                    >
                      {downloadingCallId === callIdForReport ? (
                        <>
                          <Activity className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>Generating CSV...</span>
                        </>
                      ) : (
                        <>
                          <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Report CSV</span>
                        </>
                      )}
                    </button>

                    {reportError && (
                      <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg mt-1 text-center max-w-xs">
                        {reportError}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs font-mono text-slate-500">
                Awaiting Audio Session
              </div>
            )}
          </div>

          {/* Windows / Session stats footer */}
          <div className="w-full pt-3 mt-3 border-t border-white/5 flex items-center justify-around text-[10px] sm:text-[11px] font-mono text-slate-400">
            <div>
              <span className="block text-slate-200 font-bold">{sessionWindowsCount}</span>
              <span>Windows</span>
            </div>
            {result?.duration_s !== undefined && (
              <div>
                <span className="block text-slate-200 font-bold">{result.duration_s.toFixed(1)}s</span>
                <span>Duration</span>
              </div>
            )}
            {result?.latency_ms !== undefined && (
              <div>
                <span className="block text-slate-200 font-bold">{result.latency_ms}ms</span>
                <span>Latency</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* b) Right Card: Big Round Mic + Drop Zone + Call Label + Single Analyse Button */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="lg:col-span-7 triage-glass-card rounded-[20px] p-5 sm:p-6 flex flex-col justify-between space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white font-display tracking-wider uppercase">
                Audio Input & Capture
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              6-Second Windows
            </span>
          </div>

          {/* Big Round Microphone Button for Live Mic */}
          <div className="flex flex-col items-center justify-center py-2 select-none">
            <div className="relative flex items-center justify-center">
              {/* Pulsing ring while live */}
              {isLive && (
                <span className="absolute -inset-2 rounded-full border-2 border-rose-400/60 animate-ping pointer-events-none" />
              )}
              <button
                type="button"
                onClick={handleToggleLive}
                disabled={isLoading}
                className={`w-20 h-20 sm:w-22 sm:h-22 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer relative z-10 ${
                  isLive
                    ? 'bg-rose-500/30 text-rose-300 border-2 border-rose-400 shadow-[0_0_28px_rgba(244,63,94,0.6)] ring-4 ring-rose-500/40 animate-pulse'
                    : 'bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-cyan-500/10 text-cyan-300 border-2 border-cyan-400/50 hover:border-cyan-300 hover:scale-105 shadow-[0_0_20px_rgba(34,211,238,0.25)] active:scale-95'
                }`}
                title={isLive ? 'Stop Live Mic streaming' : 'Tap to stream live microphone audio over WebSocket'}
              >
                {isLive ? (
                  <>
                    <MicOff className="w-6 h-6 sm:w-7 sm:h-7" />
                    <span className="text-[10px] font-mono font-bold mt-1 tracking-tight">
                      {liveDuration}s • Stop
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
                    <span className="text-[10px] font-mono font-bold mt-1 tracking-tight">
                      Live Mic
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Audio level meter or helper line */}
            {isLive ? (
              <div className="w-48 mt-2.5 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div className="h-1.5 flex-1 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-500 transition-all duration-75"
                    style={{ width: `${Math.round(liveAudioLevel * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-rose-300 font-bold shrink-0">
                  LIVE
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Tap to stream live 16 kHz audio directly
              </p>
            )}
          </div>

          {/* Drop Zone for Audio / Video upload */}
          <div className="space-y-1.5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-3.5 sm:p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                  : selectedFile
                  ? 'border-cyan-500/40 bg-white/[0.03]'
                  : 'border-white/15 bg-black/20 hover:border-white/30 hover:bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.flac,.mp4,.webm,.mov"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center gap-3 text-left w-full overflow-hidden">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
                    {selectedFile.type.startsWith('video') ? (
                      <Film className="w-4 h-4" />
                    ) : (
                      <FileAudio className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{selectedFile.name}</p>
                    <p className="text-[10px] font-mono text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'audio file'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1 pointer-events-none">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-200 font-medium">
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Drop audio/video file here or <span className="text-cyan-400 font-semibold underline underline-offset-2">browse</span></span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    WAV, MP3, FLAC, M4A, OGG, WebM, MP4
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Optional Call Label Input */}
          <div className="space-y-1">
            <input
              type="text"
              value={callLabel}
              onChange={(e) => setCallLabel(e.target.value)}
              placeholder="Call Label / Identifier (optional, e.g. Extortion Threat #104)"
              className="w-full px-3.5 py-2 bg-black/40 border border-white/15 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors font-sans"
            />
          </div>

          {/* Single "Analyse" Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isLoading || isLive || !selectedFile}
              className={`w-full min-h-[46px] rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md font-display ${
                isLoading || isLive || !selectedFile
                  ? 'bg-white/10 text-slate-500 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.35)] active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Analyzing ({loadingTime.toFixed(1)}s)...</span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  <span>Analyse</span>
                </>
              )}
            </button>

            {isLoading && (
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="w-full text-center text-[10px] text-slate-400 hover:text-white underline mt-1.5 cursor-pointer"
              >
                Cancel Analysis
              </button>
            )}

            {/* After File Analysis: Report CSV button */}
            {!isLoading && result && callIdForReport && (
              <div className="pt-2 mt-2 border-t border-white/5 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDownloadReport(callIdForReport)}
                  disabled={downloadingCallId === callIdForReport}
                  className="w-full min-h-[38px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-slate-200 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  title={`Download CSV report for call: ${callIdForReport}`}
                >
                  {downloadingCallId === callIdForReport ? (
                    <>
                      <Activity className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <span>Downloading Report CSV...</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Report CSV</span>
                      <span className="text-[10px] font-mono text-cyan-300/80">({callIdForReport})</span>
                    </>
                  )}
                </button>

                {reportError && (
                  <p className="w-full text-center text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                    {reportError}
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* 3) Live Waveform Visualizer Card (Directly Above Radar) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="triage-glass-card rounded-[20px] p-4 sm:p-5 space-y-2.5"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white font-display tracking-wider uppercase">
              Acoustic Stream Monitor
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-mono font-bold text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                LIVE STREAMING (16 kHz)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                MIC INACTIVE
              </span>
            )}
            {result?.session?.level && (
              <span
                className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md border"
                style={{
                  color: levelStyles.stroke,
                  borderColor: `${levelStyles.stroke}60`,
                  backgroundColor: `${levelStyles.stroke}15`,
                }}
              >
                {sessionLevel} TONE
              </span>
            )}
          </div>
        </div>

        {/* Live Audio Equalizer Waveform Canvas (Real Web Audio AnalyserNode / Dim Flat Line) */}
        <div className="rounded-xl bg-black/45 border border-white/5 p-2 overflow-hidden shadow-inner">
          <LiveWaveform
            analyserRef={analyserRef}
            isLive={isLive}
            priorityLevel={sessionLevel}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
          <span>Web Audio FFT Analyser · 16,000 Hz acoustic profile</span>
          <span>{isLive ? `${liveDuration}s elapsed stream` : 'Waveform activates during Live Mic'}</span>
        </div>
      </motion.div>

      {/* 4) Emotion Signals Card: Pentagon Radar Chart + Compact Percentage List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="triage-glass-card rounded-[20px] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white font-display tracking-wider uppercase">
              Emotion Signals
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {result ? `Averaged across ${sessionWindowsCount} window${sessionWindowsCount === 1 ? '' : 's'}` : 'Pentagonal Prosodic Stress Distribution'}
          </span>
        </div>

        {isLoading ? (
          /* Shimmering Skeleton while Analysing */
          <div className="space-y-4 py-3">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs">
              <Activity className="w-4 h-4 animate-spin" />
              <span>Extracting prosodic features from audio windows ({loadingTime.toFixed(1)}s)...</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 flex justify-center py-4">
                <div className="w-56 h-56 rounded-full triage-skeleton border border-white/5" />
              </div>
              <div className="lg:col-span-5 space-y-3.5">
                {[1, 2, 3, 4, 5].map((k) => (
                  <div key={k} className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded-md triage-skeleton" />
                    <div className="h-2 w-full rounded-full triage-skeleton" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: Glowing Pentagon Radar Chart */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center">
              <EmotionRadarPentagon
                emotionAverages={emotionAverages}
                hasData={Boolean(result && sessionWindowsCount > 0)}
              />
              <p className="text-[10px] font-mono text-slate-400 mt-2 text-center">
                Pentagon axis: 0–100% normalized acoustic emotion probability
              </p>
            </div>

            {/* Right on laptop, below on phones: Compact Percentage List */}
            <div className="lg:col-span-5 space-y-3 pt-2 lg:pt-0 lg:border-l lg:border-white/5 lg:pl-6">
              <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300">
                Probability Breakdown
              </h4>
              <div className="space-y-2.5">
                {emotionAverages.map((emotion) => (
                  <div key={emotion.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: emotion.color }}
                        />
                        <span className="font-semibold text-slate-200">{emotion.label}</span>
                        <span className="text-[10px] font-mono text-slate-400">({emotion.key})</span>
                      </div>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {result && sessionWindowsCount > 0 ? `${emotion.percent}%` : '—'}
                      </span>
                    </div>

                    {/* Compact meter */}
                    <div className="h-2 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden shadow-inner">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: result && sessionWindowsCount > 0 ? `${emotion.percent}%` : '0%',
                          backgroundColor: emotion.color,
                          boxShadow: emotion.percent > 0 ? `0 0 8px ${emotion.color}80` : undefined,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* 5) Acoustic Heat Ribbon Timeline Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.16 }}
        className="triage-glass-card rounded-[20px] p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-white font-display tracking-wider uppercase">
              Heat Ribbon Timeline
            </h3>
          </div>

          {/* Small Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-300">
            {EMOTIONS.map((em) => (
              <div key={em.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: em.color }} />
                <span className="text-slate-300 text-[10px] sm:text-[11px]">{em.label}</span>
              </div>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 py-3">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Assembling 6-second forensic heat ribbon segments...</span>
            </div>
            <div className="flex items-center gap-3 overflow-hidden py-1">
              {[1, 2, 3, 4, 5, 6].map((k) => (
                <div key={k} className="w-18 h-20 rounded-xl triage-skeleton shrink-0" />
              ))}
            </div>
          </div>
        ) : result?.windows && result.windows.length > 0 ? (
          <div className="space-y-3">
            {/* Scrollable Heat Ribbon Track */}
            <div className="overflow-x-auto pb-3 pt-2">
              <div className="min-w-max flex items-stretch gap-2.5 sm:gap-3 px-1">
                {result.windows.map((win, idx) => {
                  const dom = getDominantEmotion(win);
                  const winUrgency = Math.round(win.urgency || 0);
                  const winLevel = (win.level || 'LOW').toUpperCase();
                  const isHovered = hoveredWindow?.index === idx;

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(0.2, idx * 0.02) }}
                      onMouseEnter={() => setHoveredWindow({ window: win, index: idx })}
                      onMouseLeave={() => setHoveredWindow(null)}
                      onClick={() => setHoveredWindow(isHovered ? null : { window: win, index: idx })}
                      className={`min-w-[68px] sm:min-w-[76px] h-24 rounded-xl flex flex-col justify-between p-2 relative cursor-pointer select-none transition-all duration-200 overflow-hidden ${
                        isHovered
                          ? 'scale-105 ring-2 ring-cyan-400 z-10'
                          : 'hover:scale-[1.02]'
                      }`}
                      style={{
                        background: `linear-gradient(180deg, ${dom.color}22 0%, ${dom.color}55 100%)`,
                        borderColor: isHovered ? dom.color : `${dom.color}80`,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        boxShadow: isHovered
                          ? `0 0 16px ${dom.color}`
                          : `0 0 ${Math.max(4, Math.round(winUrgency / 4))}px ${dom.color}40`,
                      }}
                    >
                      {/* Internal Heat Level Height Indicator */}
                      <div
                        className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-40 transition-all duration-300"
                        style={{
                          height: `${Math.max(16, winUrgency)}%`,
                          background: `linear-gradient(180deg, transparent 0%, ${dom.color} 100%)`,
                        }}
                      />

                      {/* Window Timestamp */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-white/90 z-10">
                        <span>{win.start_s.toFixed(0)}s</span>
                        <span className="text-[9px] text-slate-300">W{idx + 1}</span>
                      </div>

                      {/* Dominant Emotion Badge */}
                      <div className="text-center z-10">
                        <span
                          className="inline-block text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shadow-sm text-white"
                          style={{ backgroundColor: `${dom.color}cc` }}
                        >
                          {dom.key}
                        </span>
                      </div>

                      {/* Urgency Score Pill */}
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold z-10">
                        <span
                          className={`px-1 py-0.5 rounded text-[9px] uppercase ${
                            winLevel === 'HIGH'
                              ? 'bg-rose-500/30 text-rose-300'
                              : winLevel === 'MEDIUM'
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {winLevel}
                        </span>
                        <span className="text-white text-[10px]">{winUrgency}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Tooltip on Hover or Tap */}
            <AnimatePresence>
              {hoveredWindow && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="p-3.5 rounded-xl bg-black/85 border border-cyan-400/40 shadow-xl space-y-2 text-xs font-mono backdrop-blur-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-300 font-bold">
                        Window #{hoveredWindow.index + 1}
                      </span>
                      <span className="text-slate-400">
                        ({hoveredWindow.window.start_s.toFixed(0)}s – {(hoveredWindow.window.start_s + 6).toFixed(0)}s)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-300">
                        Urgency: <strong className="text-white">{Math.round(hoveredWindow.window.urgency || 0)}/100</strong>
                      </span>
                      {hoveredWindow.window.confidence !== undefined && (
                        <span className="text-slate-300 text-[11px]">
                          Conf: <strong className="text-cyan-300">{(hoveredWindow.window.confidence * 100).toFixed(0)}%</strong>
                        </span>
                      )}
                      {hoveredWindow.window.uncertain && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/25 text-orange-300 border border-orange-500/40">
                          UNCERTAIN
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          hoveredWindow.window.level === 'HIGH'
                            ? 'bg-rose-500/30 text-rose-300'
                            : hoveredWindow.window.level === 'MEDIUM'
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'bg-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {hoveredWindow.window.level || 'LOW'} PRIORITY
                      </span>
                    </div>
                  </div>

                  {/* All 5 emotion signals breakdown for this window */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                    {EMOTIONS.map((em) => {
                      const prob = hoveredWindow.window.probs?.[em.key] || 0;
                      const pct = Math.round(prob * 100);
                      return (
                        <div key={em.key} className="p-1.5 rounded-lg bg-white/5 border border-white/5 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span style={{ color: em.color }} className="font-bold">{em.label}</span>
                            <span className="text-white font-bold">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: em.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Diagnostic Reasons if present */}
            {result?.session?.reasons && result.session.reasons.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1 text-xs">
                <span className="font-semibold text-slate-300 font-mono text-[11px]">
                  Diagnostic Rationale:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[11px] leading-relaxed">
                  {result.session.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 font-mono bg-black/20 rounded-xl border border-white/5 triage-breathing-glow">
            Awaiting 6-second acoustic windows · Stream live mic or upload audio to generate heat ribbon
          </div>
        )}
      </motion.div>

      {/* 4) Slim Footer Chip: Indicative signal disclaimer */}
      <div className="flex flex-col items-center gap-1.5 pt-1 pb-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 font-mono text-[11px] shadow-sm select-none text-center">
          <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Emotion is an indicative signal, not evidence. Audio is never stored.</span>
        </div>
      </div>
    </div>
  );
};
