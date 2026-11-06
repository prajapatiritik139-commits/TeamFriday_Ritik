import React, { useState } from 'react';
import { ShieldCheck, Server, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../lib/api';

interface ConsentModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

const STORAGE_KEY = 'voxsentra_consent_accepted';

export function hasUserGivenConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setUserConsent(accepted: boolean): void {
  try {
    if (accepted) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // LocalStorage unavailable
  }
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  onAccept,
  onCancel,
}) => {
  const [acknowledgedServer, setAcknowledgedServer] = useState(false);
  const serverUrl = getApiBaseUrl();

  if (!isOpen) return null;

  const handleConfirm = () => {
    setUserConsent(true);
    onAccept();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 md:p-8 bg-[#0D121F] border border-white/10 shadow-2xl relative">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
            <ShieldCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="consent-title" className="text-xl font-semibold text-white tracking-tight">
              Audio Transmission Consent
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Required prior to audio upload or recording analysis
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          <p>
            VoxSentra performs real signal analysis by sending your audio file to the configured inference backend:
          </p>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-cyan-300">
            <Server className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{serverUrl}</span>
          </div>

          <ul className="space-y-2 text-xs text-slate-400 list-disc pl-5">
            <li>
              <strong className="text-slate-200">Ephemeral processing:</strong> Audio is received into a temporary buffer, processed through feature extraction pipelines, and deleted immediately in a cleanup routine.
            </li>
            <li>
              <strong className="text-slate-200">No telemetry storage:</strong> Audio recordings, acoustic embeddings, and raw files are never stored in databases, logged to disk, or used for model retraining.
            </li>
            <li>
              <strong className="text-slate-200">Decision support only:</strong> Outputs indicate statistical similarity to known synthetic speech patterns; they are not legal proof of identity or fraud.
            </li>
          </ul>

          <label className="flex items-start gap-3 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledgedServer}
              onChange={(e) => setAcknowledgedServer(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0"
            />
            <span className="text-xs text-slate-300">
              I consent to sending this recording to <code className="text-cyan-300 font-mono">{serverUrl}</code> for automated acoustic verification.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 mt-7 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledgedServer}
            onClick={handleConfirm}
            className={`px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
              acknowledgedServer
                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-md shadow-cyan-500/20 cursor-pointer'
                : 'bg-white/10 text-slate-500 cursor-not-allowed'
            }`}
          >
            Agree and Continue
          </button>
        </div>
      </div>
    </div>
  );
};
