import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Ban,
  ArrowRight,
  RotateCcw,
  CheckCircle,
  FileText,
  AlertOctagon,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { checkTransaction, ApiErrorResponse } from '../lib/api';
import { TransactionCheckResponse } from '../lib/types';

export const TransactionGuardPage: React.FC = () => {
  const [amountInr, setAmountInr] = useState<string>('50000');
  const [newBeneficiary, setNewBeneficiary] = useState<boolean>(true);
  const [urgencySignals, setUrgencySignals] = useState<boolean>(true);
  const [callerUnknown, setCallerUnknown] = useState<boolean>(true);
  const [transcript, setTranscript] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionCheckResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const parsedAmount = parseFloat(amountInr);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid amount in INR.');
      setIsLoading(false);
      return;
    }

    try {
      const data = await checkTransaction({
        amount_inr: parsedAmount,
        new_beneficiary: newBeneficiary,
        urgency_signals: urgencySignals,
        caller_unknown: callerUnknown,
        transcript: transcript.trim() || undefined,
      });
      setResult(data);
    } catch (err: any) {
      if (err instanceof ApiErrorResponse) {
        setError(err.message);
      } else {
        setError(err?.message || 'Backend unreachable');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'ALLOW':
        return {
          title: 'ALLOW · Transaction Permitted',
          subtitle: 'No high-risk imposter or scam velocity indicators detected.',
          colorText: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          cardBorder: 'border-emerald-500/30 shadow-[0_0_35px_rgba(52,211,153,0.12)]',
          Icon: ShieldCheck,
        };
      case 'WARN':
        return {
          title: 'WARN · Caution Advised',
          subtitle: 'Minor risk indicators detected. Verify payment context before approving.',
          colorText: 'text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          cardBorder: 'border-amber-500/30 shadow-[0_0_35px_rgba(251,191,36,0.12)]',
          Icon: AlertTriangle,
        };
      case 'VERIFY':
        return {
          title: 'VERIFY · Out-of-Band Auth Required',
          subtitle: 'Significant urgency or audio indicators present. Request secondary callback.',
          colorText: 'text-orange-400',
          badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
          cardBorder: 'border-orange-500/30 shadow-[0_0_35px_rgba(249,115,22,0.14)]',
          Icon: ShieldAlert,
        };
      case 'BLOCK_AND_VERIFY':
      default:
        return {
          title: 'BLOCK AND VERIFY · Immediate Hold',
          subtitle: 'Critical scam patterns or combined deepfake risk flags detected. Transaction halted.',
          colorText: 'text-rose-400',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          cardBorder: 'border-rose-500/30 shadow-[0_0_35px_rgba(244,63,94,0.16)]',
          Icon: Ban,
        };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-3xl mx-auto space-y-6 pt-6 sm:pt-10 pb-8 px-4 relative z-10"
    >
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-mono">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Real-Time Fraud Prevention</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight font-display bg-gradient-to-r from-white via-slate-100 to-cyan-200 bg-clip-text text-transparent leading-[1.2]">
          Transaction Guard
        </h1>
        <p className="text-sm md:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
          Evaluate bank transfer safety against social engineering markers, voice deepfake risk, and conversational urgency signals.
        </p>
      </div>

      {result ? (
        // Results View
        <div className="space-y-6">
          {(() => {
            const config = getActionConfig(result.decision.action);
            const { Icon: ActionIcon } = config;

            return (
              <div
                className={`w-full rounded-2xl p-6 sm:p-8 glass-panel border ${config.cardBorder} transition-all`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${config.badgeBg}`}
                    >
                      <ActionIcon className="w-8 h-8" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block">
                        Guard Decision
                      </span>
                      <h2
                        className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-display ${config.colorText}`}
                      >
                        {config.title}
                      </h2>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs font-mono text-slate-400 block">Risk Points</span>
                    <span className="text-2xl font-bold font-mono text-white tabular-nums">
                      {result.decision.points}
                    </span>
                  </div>
                </div>

                <p className="pt-4 text-sm sm:text-base text-slate-200 leading-relaxed">
                  {config.subtitle}
                </p>

                {/* Why / Reasons */}
                {result.decision.reasons && result.decision.reasons.length > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                    <span className="text-xs font-mono uppercase font-semibold text-slate-300 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
                      Why This Decision Was Made
                    </span>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300 leading-relaxed">
                      {result.decision.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {result.decision.next_steps && result.decision.next_steps.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 space-y-2">
                    <span className="text-xs font-mono uppercase font-semibold text-cyan-300 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                      Recommended Next Steps
                    </span>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-200 leading-relaxed">
                      {result.decision.next_steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detected Scam Phrases */}
                {result.scam && (
                  <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="uppercase font-semibold text-slate-300">
                        Scam Linguistic Signals
                      </span>
                      <span className="text-slate-400">
                        Score: <strong className="text-white">{result.scam.score}</strong>
                      </span>
                    </div>

                    {result.scam.hits && result.scam.hits.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {result.scam.hits.map((hit, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono"
                          >
                            <span>"{hit.term}"</span>
                            {hit.weight !== undefined && (
                              <span className="text-[10px] text-rose-400 opacity-75">
                                (w: {hit.weight})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        No flagged urgency or coercive scam phrases detected in transcript.
                      </p>
                    )}
                  </div>
                )}

                {/* Voice Model Correlation if attached to session */}
                {result.voice && (
                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.01] border border-white/5 text-xs text-slate-400 space-y-1">
                    <span className="text-slate-300 font-semibold block font-mono">
                      Session Voice Telemetry:
                    </span>
                    <div className="flex items-center gap-4 font-mono text-[11px]">
                      <span>Level: {result.voice.level || 'N/A'}</span>
                      <span>Risk: {result.voice.risk !== undefined ? `${result.voice.risk}%` : 'N/A'}</span>
                      <span>Windows: {result.voice.windows || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-md shadow-cyan-500/20 transition-all cursor-pointer font-display"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Check Another Transaction</span>
            </button>
          </div>
        </div>
      ) : (
        // Input Form
        <form
          onSubmit={handleSubmit}
          className="glass-panel rounded-2xl p-6 sm:p-8 border border-white/10 space-y-6 shadow-xl"
        >
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono"
            >
              {error}
            </div>
          )}

          {/* Amount INR */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-display">
              Transaction Amount (INR ₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={amountInr}
                onChange={(e) => setAmountInr(e.target.value)}
                placeholder="50000"
                className="w-full pl-8 pr-4 py-2.5 bg-black/40 border border-white/15 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Higher amounts or transfers exceeding ordinary velocity increase verification thresholds.
            </p>
          </div>

          {/* Context Checkboxes */}
          <div className="space-y-3 pt-2 border-t border-white/5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-display">
              Risk Context Factors
            </span>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newBeneficiary}
                onChange={(e) => setNewBeneficiary(e.target.checked)}
                className="mt-0.5 rounded border-white/30 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-black/40 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-white block">New Payee / Beneficiary</span>
                <span className="text-slate-400">First-time transfer recipient or unverified account details</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={urgencySignals}
                onChange={(e) => setUrgencySignals(e.target.checked)}
                className="mt-0.5 rounded border-white/30 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-black/40 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-white block">Caller Creating Urgency</span>
                <span className="text-slate-400">Pressure tactics ("transfer now or face arrest/penalty/immediate loss")</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                checked={callerUnknown}
                onChange={(e) => setCallerUnknown(e.target.checked)}
                className="mt-0.5 rounded border-white/30 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-black/40 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-white block">Caller Not in Contacts</span>
                <span className="text-slate-400">Unknown incoming number or spoofed corporate identifier</span>
              </div>
            </label>
          </div>

          {/* Optional Transcript */}
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-display">
                What the Caller Said (Optional Transcript)
              </label>
              <span className="text-[11px] text-slate-400 font-mono">Linguistic Analysis</span>
            </div>
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder='e.g., "This is your bank manager. Your account has been compromised, urgently transfer funds to this secure vault account..."'
              className="w-full px-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-xs font-bold uppercase tracking-wider bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/25 transition-all cursor-pointer font-display disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span>Evaluating Transaction Safety...</span>
              ) : (
                <>
                  <span>Evaluate Transaction Safety</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
};
