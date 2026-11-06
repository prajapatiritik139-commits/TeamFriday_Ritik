import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Clock, Cpu, AlertCircle, BarChart3 } from 'lucide-react';
import { AnalyzeResponse } from '../lib/types';
import { SpectrogramView } from './SpectrogramView';

interface EvidencePanelProps {
  response: AnalyzeResponse;
  audioBuffer: AudioBuffer | null;
  file?: File | Blob | null;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ response, audioBuffer, file }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full glass-panel rounded-2xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              Forensic Evidence & Acoustic Signal Inspection
            </h3>
            <p className="text-xs text-slate-400">
              Per-branch acoustic scores, spectral waterfall, calibration notes, and operational limits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
          <span>{isOpen ? 'Hide Details' : 'View Details'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 border-t border-white/10 space-y-6">
          {/* Spectrogram View */}
          <SpectrogramView audioBuffer={audioBuffer} file={file} />

          {/* Per-Branch Breakdown if available */}
          {response.branches && response.branches.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                <span>Multi-Branch Model Decomposition</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {response.branches.map((b, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{b.name}</span>
                      <span className="text-xs font-mono text-cyan-300 tabular-nums">
                        {b.score !== null ? `${(b.score * 100).toFixed(1)}%` : 'Offline / N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{b.note}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      Status: {b.calibrated ? 'Independently calibrated' : 'Raw logits'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal Quality Table if available */}
          {response.quality && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Signal Telemetry Summary
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-1">
                <div>
                  <span className="text-slate-500 block">Total Duration</span>
                  <span className="text-white tabular-nums">{response.quality.duration_s.toFixed(2)}s</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Active Speech (VAD)</span>
                  <span className="text-white tabular-nums">{response.quality.speech_s.toFixed(2)}s</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Estimated SNR</span>
                  <span className="text-white tabular-nums">{response.quality.snr_db.toFixed(1)} dB</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Input Sample Rate</span>
                  <span className="text-white tabular-nums">{response.quality.sample_rate_in} Hz</span>
                </div>
              </div>
            </div>
          )}

          {/* Model Provenance, Calibration & Latency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400 pt-2 border-t border-white/5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Model: <strong className="text-slate-300 font-mono">{response.model_version || 'XLS-R 300M'}</strong></span>
            </div>
            <div>
              <span>Calibration: <strong className="text-slate-300 font-mono">{response.calibration_version || 'None (Uncalibrated)'}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Inference Latency: <strong className="text-slate-300 font-mono tabular-nums">{response.latency_ms} ms</strong></span>
            </div>
          </div>

          {/* Scientific Limitations */}
          {response.limitations && response.limitations.length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.01] border border-white/5 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                <AlertCircle className="w-4 h-4 text-slate-500" />
                <span>Operational Forensic Limitations</span>
              </div>
              <ul className="space-y-1 text-slate-400 list-disc pl-5">
                {response.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
