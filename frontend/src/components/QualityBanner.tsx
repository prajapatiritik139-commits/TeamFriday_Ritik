import React from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { QualityMetrics, Verdict } from '../lib/types';

interface QualityBannerProps {
  quality: QualityMetrics;
  verdict: Verdict;
}

export const QualityBanner: React.FC<QualityBannerProps> = ({ quality, verdict }) => {
  const hasWarnings = quality.warnings && quality.warnings.length > 0;
  const isNeedsVerification = verdict === 'needs_verification';

  if (!hasWarnings && !isNeedsVerification) {
    return (
      <div className="w-full px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
        <span>
          Acoustic signal quality is nominal ({quality.speech_s.toFixed(1)}s active speech, SNR {quality.snr_db.toFixed(1)} dB).
        </span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Audio quality advisories"
      className="w-full rounded-2xl p-5 md:p-6 bg-amber-500/10 border border-amber-500/30 text-amber-200"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-3 w-full">
          <div>
            <h4 className="text-sm font-semibold text-amber-300">
              {isNeedsVerification
                ? 'Signal Integrity & Verification Advisory'
                : 'Audio Quality Warnings'}
            </h4>
            <p className="text-xs text-amber-200/90 mt-1">
              {isNeedsVerification
                ? 'The acoustic analysis yielded inconclusive or constrained confidence. Please consider the following factors:'
                : 'The following signal anomalies may degrade detection accuracy:'}
            </p>
          </div>

          {hasWarnings && (
            <ul className="space-y-1.5 text-xs text-amber-200 list-disc pl-5">
              {quality.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {/* Actionable guidance as per Section 4 item 6 */}
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/20 text-xs space-y-1">
            <p className="font-semibold text-amber-300">Recommended Next Steps:</p>
            <p className="text-amber-200/80">
              • Request an uncompressed recording or call back directly on a verified phone number.
            </p>
            <p className="text-amber-200/80">
              • Confirm identity through out-of-band communication (secure email, pre-agreed passphrase, or internal directory).
            </p>
            <p className="text-amber-200/80">
              • Never authorize financial transfers or credential changes based on this recording alone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
