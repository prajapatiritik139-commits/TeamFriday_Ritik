import React, { useState } from 'react';
import { ServerCrash, RefreshCw, Settings, Check, KeyRound, Globe } from 'lucide-react';
import {
  ApiErrorResponse,
  getApiBaseUrl,
  setApiBaseUrl,
  getApiKey,
  setApiKey,
} from '../lib/api';

interface ErrorStateProps {
  error: Error | ApiErrorResponse;
  onRetry?: () => void;
  onReset?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry, onReset }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [customUrl, setCustomUrl] = useState(getApiBaseUrl());
  const [customKey, setCustomKey] = useState(getApiKey());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isApiError = error instanceof ApiErrorResponse;
  const statusCode = isApiError ? (error as ApiErrorResponse).statusCode : 0;
  const isKeyError = statusCode === 401 || error.message.toLowerCase().includes('wrong api key');
  const isNetwork = statusCode === 0 || error.message.toLowerCase().includes('backend unreachable');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(customUrl);
    setApiKey(customKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      if (onRetry) onRetry();
    }, 600);
  };

  return (
    <div
      role="alert"
      className="w-full glass-panel rounded-2xl p-6 md:p-8 border border-rose-500/30 bg-rose-950/15 text-left space-y-4"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
          <ServerCrash className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-mono uppercase text-rose-400 font-semibold tracking-wider">
            {isKeyError
              ? 'Authentication Error (401)'
              : isNetwork
              ? 'Network Error'
              : `HTTP Error ${statusCode || ''}`}
          </span>
          <h3 className="text-lg font-semibold text-white">
            {isKeyError
              ? 'Wrong API key'
              : isNetwork
              ? 'Backend unreachable'
              : 'Analysis Could Not Be Completed'}
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed pt-1">
            {error.message}
          </p>
        </div>
      </div>

      {/* Backend URL & Key configuration drawer */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{showConfig ? 'Hide API Settings' : 'Configure API Base URL & Key'}</span>
          </button>

          <div className="flex items-center gap-2">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg border border-white/10 transition-colors cursor-pointer"
              >
                Start Over
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>

        {showConfig && (
          <form onSubmit={handleSave} className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>API Base URL</span>
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://api.yourbackend.com or http://localhost:8000"
                className="w-full px-3 py-1.5 text-xs font-mono bg-black/40 border border-white/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                <span>API Key</span>
              </label>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="Enter API key"
                className="w-full px-3 py-1.5 text-xs font-mono bg-black/40 border border-white/20 rounded-lg text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-cyan-500 text-slate-950 rounded-lg hover:bg-cyan-400 flex items-center gap-1 cursor-pointer"
              >
                {savedSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                <span>Save and Reconnect</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
