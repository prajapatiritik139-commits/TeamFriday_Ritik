import React, { useEffect, useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';

export type AnalysisStage = 'uploading' | 'extracting_features' | 'fusing_evidence';

interface AnalysisProgressProps {
  stage: AnalysisStage;
  uploadProgress: number; // 0 to 1
  onCancel: () => void;
  fileName?: string;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  stage,
  uploadProgress,
  onCancel,
  fileName,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getStageDescription = () => {
    switch (stage) {
      case 'uploading':
        return `Transmitting audio payload (${Math.round(uploadProgress * 100)}%)...`;
      case 'extracting_features':
        return 'Executing SSL representation & LFCC spectral analysis...';
      case 'fusing_evidence':
        return 'Evaluating acoustic margins & calibrating decision thresholds...';
      default:
        return 'Analyzing acoustic signal...';
    }
  };

  const stages: { id: AnalysisStage; label: string }[] = [
    { id: 'uploading', label: '1. Preparing audio' },
    { id: 'extracting_features', label: '2. Feature extraction' },
    { id: 'fusing_evidence', label: '3. Combining evidence' },
  ];

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Analysis in progress"
      className="w-full glass-panel rounded-2xl p-6 md:p-10 border border-white/10 text-center relative overflow-hidden"
    >
      <div className="flex flex-col items-center max-w-md mx-auto">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        </div>

        <h3 className="text-lg font-semibold text-white tracking-tight mb-1">
          Forensic Acoustic Verification
        </h3>
        
        {fileName && (
          <p className="text-xs font-mono text-slate-400 mb-3 truncate max-w-xs">
            {fileName}
          </p>
        )}

        <p className="text-sm text-cyan-300 font-medium mb-6">
          {getStageDescription()}
        </p>

        {/* Real upload progress bar if in uploading state */}
        {stage === 'uploading' && (
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-6">
            <div
              className="h-full bg-cyan-400 transition-all duration-150"
              style={{ width: `${Math.round(uploadProgress * 100)}%` }}
            />
          </div>
        )}

        {/* 3 Real Stages Sequence */}
        <div className="w-full grid grid-cols-3 gap-2 py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5 mb-6 text-left">
          {stages.map((st, idx) => {
            const isCompleted =
              (stage === 'fusing_evidence' && idx < 2) ||
              (stage === 'extracting_features' && idx === 0);
            const isCurrent = stage === st.id;

            return (
              <div key={st.id} className="flex flex-col">
                <span
                  className={`text-[11px] font-medium leading-tight ${
                    isCurrent
                      ? 'text-cyan-400 font-semibold'
                      : isCompleted
                      ? 'text-slate-300'
                      : 'text-slate-600'
                  }`}
                >
                  {st.label}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {isCompleted ? 'Done' : isCurrent ? 'Active' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between w-full pt-2">
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Elapsed: {elapsedSeconds}s (Timeout: 90s)
          </span>

          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel Analysis</span>
          </button>
        </div>
      </div>
    </div>
  );
};
