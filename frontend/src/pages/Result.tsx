import React, { useState } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Layers,
  Activity,
  Timer,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AnalyzeResponse } from '../lib/types';
import { EchoMascot } from '../components/EchoMascot';

interface ResultPageProps {
  response: AnalyzeResponse;
  fileName: string;
  onAnalyzeAnother: () => void;
}

export const ResultPage: React.FC<ResultPageProps> = ({
  response,
  fileName,
  onAnalyzeAnother,
}) => {
  const [copied, setCopied] = useState(false);

  const getZoneConfig = (zone: 'GREEN' | 'AMBER' | 'RED') => {
    switch (zone) {
      case 'GREEN':
        return {
          title: 'GREEN',
          description: 'No synthetic-voice signal detected by the model.',
          colorText: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
          cardBorder: 'border-emerald-500/30 shadow-[0_0_35px_rgba(52,211,153,0.12)]',
          Icon: ShieldCheck,
        };
      case 'AMBER':
        return {
          title: 'AMBER',
          description:
            'Suspicious but not confirmed. Verify the caller through another channel (call back on a saved number, OTP).',
          colorText: 'text-amber-400',
          badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
          cardBorder: 'border-amber-500/30 shadow-[0_0_35px_rgba(251,191,36,0.12)]',
          Icon: AlertTriangle,
        };
      case 'RED':
        return {
          title: 'RED',
          description:
            "Strong synthetic-voice signal. Do not act on this caller's instructions; verify through another channel.",
          colorText: 'text-rose-400',
          badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
          cardBorder: 'border-rose-500/30 shadow-[0_0_35px_rgba(244,63,94,0.14)]',
          Icon: AlertOctagon,
        };
    }
  };

  const zoneConfig = getZoneConfig(response.zone);
  const { Icon: ZoneIcon } = zoneConfig;

  const copySummary = () => {
    const lines = [
      `VOXSENTRA AUDIO FORENSIC SUMMARY`,
      `===============================`,
      `File: ${fileName}`,
      `Zone: ${response.zone}`,
      `Risk Score: ${response.risk}/100`,
      `Raw Score: ${response.score.toFixed(4)}`,
      `Duration: ${response.duration_s.toFixed(2)}s`,
      `Inference Latency: ${response.latency_ms}ms`,
      `Windows Analyzed: ${response.windows?.length || 0}`,
      response.session?.reasons?.length
        ? `Session Reasons: ${response.session.reasons.join('; ')}`
        : '',
      `Timestamp: ${new Date().toISOString()}`,
      `\nNOTICE: VoxSentra outputs are empirical decision-support estimates from live API inference.`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-3xl mx-auto space-y-6 py-4 px-4"
    >
      {/* Echo Mascot Reaction in center spot */}
      <div className="flex items-center justify-center my-1 sm:my-3">
        <EchoMascot isAnalyzing={false} verdictResult={response.zone} />
      </div>

      {/* 1. Big Zone Badge Card */}
      <div
        className={`w-full rounded-2xl p-6 sm:p-8 glass-panel border ${zoneConfig.cardBorder} transition-all`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${zoneConfig.badgeBg}`}
            >
              <ZoneIcon className="w-8 h-8" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block">
                Verification Zone
              </span>
              <h2
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-display ${zoneConfig.colorText}`}
              >
                {zoneConfig.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${zoneConfig.badgeBg}`}
            >
              ZONE: {response.zone}
            </span>
          </div>
        </div>

        <p className="pt-4 text-sm sm:text-base text-slate-200 leading-relaxed">
          {zoneConfig.description}
        </p>

        {response.session?.reasons && response.session.reasons.length > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5 text-xs">
            <span className="font-semibold text-slate-300 block">Session Assessment Signals:</span>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              {response.session.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 2. Risk Gauge 0-100 & Point Estimate */}
      <div className="w-full glass-panel rounded-2xl p-6 sm:p-7 border border-white/10 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight font-display">
              Synthetic Risk Index
            </h3>
            <p className="text-xs text-slate-400">
              Calibrated risk index from 0 (no synthetic signal) to 100 (strong synthetic signal). It is not a probability.
            </p>
          </div>

          <div className="flex items-baseline gap-1 sm:justify-end">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tabular-nums">
              {response.risk}
            </span>
            <span className="text-sm font-mono text-cyan-400">/ 100</span>
          </div>
        </div>

        {/* Visual Animated Gauge Bar */}
        <div className="space-y-2 pt-1">
          <div className="relative w-full h-5 rounded-full bg-white/5 border border-white/10 overflow-hidden shadow-inner">
            {/* Color threshold backgrounds */}
            <div className="absolute inset-0 flex opacity-25 pointer-events-none">
              <div className="w-[40%] bg-emerald-500" title="Green (0-39)" />
              <div className="w-[30%] bg-amber-500" title="Amber (40-69)" />
              <div className="w-[30%] bg-rose-500" title="Red (70-100)" />
            </div>

            {/* Filled bar animating once */}
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: `${Math.max(2, Math.min(100, response.risk))}%` }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className={`h-full relative shadow-[0_0_15px_rgba(34,211,238,0.5)] ${
                response.zone === 'GREEN'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
                  : response.zone === 'AMBER'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-300'
                  : 'bg-gradient-to-r from-rose-500 to-rose-300'
              }`}
            >
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white shadow-sm" />
            </motion.div>
          </div>

          <div className="flex justify-between text-[11px] font-mono pt-0.5">
            <span className="text-emerald-400 font-semibold">Green (0–39)</span>
            <span className="text-amber-400 font-semibold">Amber (40–69)</span>
            <span className="text-rose-400 font-semibold">Red (70–100)</span>
          </div>
        </div>
      </div>

      {/* 3. Telemetry Matrix (Raw Score, Latency, Duration, Session Level) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl glass-panel border border-white/5 space-y-1">
          <span className="text-[11px] font-mono uppercase text-slate-400 block flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Raw Score
          </span>
          <span className="text-lg font-bold font-mono text-white tabular-nums">
            {response.score.toFixed(4)}
          </span>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-white/5 space-y-1">
          <span className="text-[11px] font-mono uppercase text-slate-400 block flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Latency
          </span>
          <span className="text-lg font-bold font-mono text-white tabular-nums">
            {response.latency_ms} ms
          </span>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-white/5 space-y-1">
          <span className="text-[11px] font-mono uppercase text-slate-400 block flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-cyan-400" />
            Duration
          </span>
          <span className="text-lg font-bold font-mono text-white tabular-nums">
            {response.duration_s.toFixed(2)} s
          </span>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-white/5 space-y-1">
          <span className="text-[11px] font-mono uppercase text-slate-400 block flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            Windows
          </span>
          <span className="text-lg font-bold font-mono text-white tabular-nums">
            {response.windows?.length || 1}
          </span>
        </div>
      </div>

      {/* 4. Small Per-Window Timeline from windows[] */}
      {response.windows && response.windows.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white font-display">
                Per-Window Acoustic Timeline
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {response.windows.length} temporal slices
            </span>
          </div>

          <div className="space-y-2">
            {response.windows.map((win, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 font-semibold">
                    W{idx + 1}
                  </span>
                  <span className="text-slate-300">
                    Offset: {win.start_s.toFixed(1)}s
                  </span>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Score:</span>
                    <span className="text-white font-bold">{win.score.toFixed(3)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300">Risk: {win.risk}/100</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Latency:</span>
                    <span className="text-slate-300">{win.latency_ms}ms</span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                      win.zone === 'GREEN'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : win.zone === 'AMBER'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {win.zone}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Actions Strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={copySummary}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Summary Copied to Clipboard' : 'Copy Verification Summary'}</span>
        </button>

        <button
          type="button"
          onClick={onAnalyzeAnother}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-md shadow-cyan-500/20 transition-all cursor-pointer font-display"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Analyze Another Recording</span>
        </button>
      </div>

      <div className="text-center pt-2 space-y-1.5">
        <p className="text-xs text-amber-300 font-medium">
          A GREEN result does not prove the caller is genuine.
        </p>
        <p className="text-[11px] text-slate-400">
          All numbers are returned directly from the connected backend model without interpolation or fabricated data.
        </p>
      </div>
    </motion.div>
  );
};
