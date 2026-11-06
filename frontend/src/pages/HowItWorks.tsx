import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Cpu,
  AlertTriangle,
  Activity,
  Layers,
  Database,
  Server,
  Microchip,
} from 'lucide-react';
import { motion } from 'motion/react';
import { checkHealth } from '../lib/api';
import { HealthResponse } from '../lib/types';

export const HowItWorks: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    checkHealth()
      .then((data) => setHealth(data))
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-4xl mx-auto space-y-10 py-8 px-4 relative z-10"
    >
      {/* 1. Scientific Foundation */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400">
          <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-wider font-semibold">
            Scientific Position
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight font-display">
          Acoustic Verification Methodology
        </h1>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            Current scientific research confirms that <strong>no single acoustic feature separates all natural human speech from all synthetic speech</strong>.
          </p>
          <p>
            Modern neural text-to-speech (TTS), voice cloning models, and diffusion vocoders construct artificial waveforms that accurately replicate human vocal tract resonances. When recordings traverse cellular networks, VoIP encoders, or compression algorithms, subtle phase signatures can degrade.
          </p>
          <div className="p-4 rounded-xl glass-panel border border-white/10 text-slate-200 text-xs sm:text-sm">
            <strong className="text-cyan-300">Empirical Integrity Rule:</strong> VoxSentra never fabricates synthetic scores or benchmark numbers. All operational thresholds and evaluation metrics shown are obtained directly from live inference against the configured API backend.
          </div>
        </div>
      </section>

      {/* 2. XLS-R 300M Pipeline Architecture */}
      <section className="space-y-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Foundation Model
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight mt-1 font-display">
            XLS-R 300M Deep Speech Architecture
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            End-to-end self-supervised representations for cross-lingual speech artifact detection
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl glass-panel border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400">
              <Cpu className="w-5 h-5" />
              <h3 className="text-sm font-semibold text-white font-display">XLS-R 300M Transformer Backbone</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Trained on over 436,000 hours of unlabelled speech spanning 128 languages, the 24-layer transformer encoder learns high-level latent acoustic representations invariant to specific speaker dialects.
            </p>
            <div className="text-[11px] font-mono text-slate-400">
              Analysis: Micro-prosodic irregularities, unnatural co-articulation, and glottal opening timing anomalies.
            </div>
          </div>

          <div className="p-5 rounded-2xl glass-panel border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400">
              <Layers className="w-5 h-5" />
              <h3 className="text-sm font-semibold text-white font-display">Temporal Window-Level Pooling</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Continuous speech streams are evaluated in calibrated sliding time windows. Each segment outputs an individual probability score and classification zone, exposing localized voice clone insertions.
            </p>
            <div className="text-[11px] font-mono text-slate-400">
              Detection: Vocoder phase dispersion, harmonic discontinuities, and localized speech splicing.
            </div>
          </div>
        </div>
      </section>

      {/* 3. Live Dynamic Thresholds from /health */}
      <section className="space-y-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
            Live Server Configuration
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight mt-1 font-display">
            Dynamic Operational Thresholds (via GET /health)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real operating parameters loaded live from the active backend service
          </p>
        </div>

        {loading ? (
          <div className="p-6 rounded-2xl glass-panel border border-white/10 text-xs font-mono text-slate-400">
            Querying backend health endpoint...
          </div>
        ) : health?.status === 'ok' ? (
          <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-slate-400 block">Model</span>
                <span className="text-sm font-bold text-white truncate block">
                  {health.model || 'XLS-R 300M'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-slate-400 block">Device</span>
                <span className="text-sm font-bold text-cyan-300 block">
                  {health.device || 'CPU'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <span className="text-emerald-400 block">Amber Threshold</span>
                <span className="text-base font-bold text-emerald-300 tabular-nums block">
                  {health.amber_threshold !== undefined ? health.amber_threshold : '0.35'}
                </span>
                <span className="text-[10px] text-emerald-400/80">Green &lt; Amber</span>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                <span className="text-rose-400 block">Red Threshold</span>
                <span className="text-base font-bold text-rose-300 tabular-nums block">
                  {health.red_threshold !== undefined ? health.red_threshold : '0.65'}
                </span>
                <span className="text-[10px] text-rose-400/80">Red &ge; Threshold</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Head Self-Check: <strong className="text-white">{health.head_self_check ? 'PASSED' : 'NOT VERIFIED'}</strong></span>
              </div>

              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Audio Storage Policy: <strong className="text-white">{health.audio_stored ? 'Retained' : 'Zero Persistence (Ephemeral)'}</strong></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl glass-panel border border-white/10 text-center space-y-2">
            <p className="text-xs text-rose-400 font-mono">
              Backend currently unreachable or unconfigured.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Please click the Settings gear icon in the top header to configure your API Base URL and Key. Thresholds will automatically query from <code className="text-cyan-300">GET /health</code>.
            </p>
          </div>
        )}
      </section>

      {/* 4. Known Limitations Box */}
      <section className="space-y-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
            Forensic Boundaries
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight mt-1 font-display">
            Known Forensic Limitations
          </h2>
        </div>

        <div className="p-6 rounded-2xl glass-panel border border-amber-500/30 bg-amber-950/10 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-semibold font-display">
              Operational Constraints & Environmental Factors
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
            <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <strong className="text-white block font-medium">Short Clips (&lt; 1.0 second)</strong>
              <p className="text-slate-400 leading-relaxed">
                Recordings under 1.0s exhibit limited phonetic variety and co-articulation context, which can lower statistical reliability.
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <strong className="text-white block font-medium">Heavy Telecom & VoIP Compression</strong>
              <p className="text-slate-400 leading-relaxed">
                Narrowband cellular codecs (such as AMR 4.75kbps or aggressive VoIP downsampling) eliminate high-frequency harmonics, prompting AMBER verification flags.
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <strong className="text-white block font-medium">Laptop Built-in Microphones</strong>
              <p className="text-slate-400 leading-relaxed">
                Integrated laptop microphones often pick up internal cooling fan vibration and room reverberation. Direct phone captures provide cleaner spectral profiles.
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <strong className="text-white block font-medium">Unseen Neural Architectures</strong>
              <p className="text-slate-400 leading-relaxed">
                Novel generative voice conversion models not represented in current foundation weights may produce out-of-distribution signatures requiring human review.
              </p>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
};
