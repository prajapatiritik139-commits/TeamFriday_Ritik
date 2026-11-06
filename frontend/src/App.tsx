import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  History as HistoryIcon,
  Settings,
  Trash2,
  X,
  ShieldAlert,
  ShieldCheck,
  Radio,
  KeyRound,
  Globe,
  CheckCircle,
  PhoneCall,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getSoundMuted,
  toggleSoundMuted,
  subscribeSoundMuted,
  playTick,
  playAnalysisStarted,
  playAnalysisFinished,
  playVerdictSound,
} from './lib/soundEffects';
import { HomePage } from './pages/Home';
import { ResultPage } from './pages/Result';
import { TransactionGuardPage } from './pages/TransactionGuard';
import { HowItWorks } from './pages/HowItWorks';
import { ConsentModal, hasUserGivenConsent } from './components/ConsentModal';
import { AnalysisProgress, AnalysisStage } from './components/AnalysisProgress';
import { ErrorState } from './components/ErrorState';
import {
  analyzeAudio,
  checkHealth,
  getApiBaseUrl,
  setApiBaseUrl,
  getApiKey,
  setApiKey,
  getTriageBaseUrl,
  setTriageBaseUrl,
  clearTriageBaseUrl,
  clearApiConfig,
  ApiErrorResponse,
} from './lib/api';
import {
  AnalyzeResponse,
  HealthResponse,
  HistoryRecord,
} from './lib/types';
import { validateAudioDurationAndSignal } from './lib/validate';
import { EchoMascot } from './components/EchoMascot';
import { CallTriageView } from './components/CallTriageView';
import { CustomPointerOverlay } from './components/CustomPointerOverlay';

type AppMode = 'voice' | 'triage';
type AppView = 'home' | 'result' | 'guard' | 'how_it_works';

const STORAGE_HISTORY_KEY = 'voxsentra_analysis_history';

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('voice');
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // Sound effects mute state (persisted & synced)
  const [soundMuted, setSoundMuted] = useState<boolean>(() => getSoundMuted());

  useEffect(() => {
    return subscribeSoundMuted((muted) => setSoundMuted(muted));
  }, []);

  const handleToggleSound = () => {
    const next = toggleSoundMuted();
    setSoundMuted(next);
    if (!next) {
      playTick();
    }
  };

  // Settings Modal form state
  const [inputBaseUrl, setInputBaseUrl] = useState<string>('');
  const [inputApiKey, setInputApiKey] = useState<string>('');
  const [inputTriageUrl, setInputTriageUrl] = useState<string>('');
  const [triageUrl, setTriageUrl] = useState<string>(() => getTriageBaseUrl());
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);

  // Pending file to analyze once consent is granted
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('uploading');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<Error | ApiErrorResponse | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [activeResult, setActiveResult] = useState<AnalyzeResponse | null>(null);

  // Echo Mascot Reactions & Target Tracking
  const [dropTrigger, setDropTrigger] = useState<number>(0);
  const [cursorTarget, setCursorTarget] = useState<'default' | 'dropzone' | 'record' | 'nav'>('default');
  const [echoEnabled, setEchoEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('voxsentra_echo_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Track cursor target for Echo mascot reactions
  useEffect(() => {
    const handlePointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-echo-target="dropzone"]')) {
        setCursorTarget('dropzone');
      } else if (target.closest('[data-echo-target="record"]')) {
        setCursorTarget('record');
      } else if (target.closest('[data-echo-target="nav"]') || target.closest('header nav')) {
        setCursorTarget('nav');
      } else {
        setCursorTarget('default');
      }
    };
    window.addEventListener('pointerover', handlePointerOver);
    return () => window.removeEventListener('pointerover', handlePointerOver);
  }, []);

  // Load history from localStorage on mount: only { time, filename, zone, risk, score }
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Poll GET {base}/health on load and every 15 seconds (no key needed)
  const refreshHealth = () => {
    checkHealth()
      .then((data) => {
        setHealth(data);
      })
      .catch(() => {
        setHealth(null);
      });
  };

  useEffect(() => {
    refreshHealth();
    const interval = window.setInterval(refreshHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // When config modal opens, load saved URL and key into inputs
  useEffect(() => {
    if (showConfigModal) {
      setInputBaseUrl(getApiBaseUrl());
      setInputApiKey(getApiKey());
      setInputTriageUrl(getTriageBaseUrl());
      setSettingsSavedMessage(null);
    }
  }, [showConfigModal]);

  // Save history record in localStorage: only {time, filename, zone, risk, score}
  const saveHistoryRecord = (fileName: string, res: AnalyzeResponse) => {
    const record: HistoryRecord = {
      time: Date.now(),
      filename: fileName,
      zone: res.zone,
      risk: res.risk,
      score: res.score,
    };
    setHistory((prev) => {
      const updated = [record, ...prev.slice(0, 19)];
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {}
  };

  const startAnalysis = async (file: File) => {
    if (!hasUserGivenConsent()) {
      setPendingFile(file);
      setShowConsentModal(true);
      return;
    }

    setDropTrigger(Date.now());
    setActiveFileName(file.name);
    setAnalysisError(null);
    setIsAnalyzing(true);
    setAnalysisStage('uploading');
    setUploadProgress(0);

    // 4a) Analysis started sound: two quick rising notes
    playAnalysisStarted();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Validate duration and signal client-side first
      await validateAudioDurationAndSignal(file);

      const response = await analyzeAudio(
        file,
        file.name,
        (progressFraction) => {
          setUploadProgress(progressFraction);
          if (progressFraction >= 0.99) {
            setAnalysisStage('extracting_features');
          }
        },
        abortController.signal
      );

      setAnalysisStage('fusing_evidence');
      setActiveResult(response);
      saveHistoryRecord(file.name, response);
      setIsAnalyzing(false);
      setCurrentView('result');

      // 4b & 5) Analysis finished chime & verdict chord/tone
      playAnalysisFinished();
      setTimeout(() => {
        playVerdictSound(response.zone);
      }, 340);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setIsAnalyzing(false);
        return;
      }
      setAnalysisError(err);
      setIsAnalyzing(false);
    }
  };

  const handleConsentAccepted = () => {
    setShowConsentModal(false);
    if (pendingFile) {
      const file = pendingFile;
      setPendingFile(null);
      startAnalysis(file);
    }
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsAnalyzing(false);
    setAnalysisError(null);
  };

  const handleReset = () => {
    setIsAnalyzing(false);
    setActiveResult(null);
    setAnalysisError(null);
    setCurrentView('home');
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(inputBaseUrl);
    setApiKey(inputApiKey);
    setTriageBaseUrl(inputTriageUrl);
    setTriageUrl(inputTriageUrl.trim().replace(/\/+$/, ''));
    refreshHealth();
    setSettingsSavedMessage('Settings saved. Configuration updated.');
    setTimeout(() => {
      setShowConfigModal(false);
      setSettingsSavedMessage(null);
    }, 800);
  };

  const isConnected = health?.status === 'ok';

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E6ECF5] flex flex-col relative selection:bg-cyan-500/20 selection:text-cyan-300 overflow-x-hidden max-w-full">
      {/* Clean Deep Navy (#070B14) Background with Soft Radial Cyan Glow Behind Hero & Faint Vignette */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden max-w-full" aria-hidden="true">
        {/* Soft radial cyan glow behind hero */}
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[740px] max-w-[100vw] h-[480px] rounded-full blur-[130px] opacity-20 bg-[radial-gradient(ellipse_at_center,#22D3EE_0%,rgba(59,130,246,0.45)_50%,transparent_80%)] overflow-hidden" />
        {/* Faint edge vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(7,11,20,0.8)_100%)] max-w-full" />
      </div>

      {/* Custom Pointer Overlay: Circle Cursor Ring and Tap/Click Ripples Portal */}
      <CustomPointerOverlay />

      {/* Consent Modal */}
      <ConsentModal
        isOpen={showConsentModal}
        onAccept={handleConsentAccepted}
        onCancel={() => {
          setShowConsentModal(false);
          setPendingFile(null);
        }}
      />

      {/* Top Bar with Glowing Hairline (Responsive: wraps on mobile so mode switch stays visible) */}
      <header className="sticky top-0 z-40 bg-[#070B14]/90 backdrop-blur-md border-b border-white/5 relative w-full overflow-hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center justify-between gap-2.5 md:gap-6">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={handleReset}
            className="text-lg font-bold tracking-tight text-white flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shrink-0 font-display"
          >
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
              <Activity className="w-4.5 h-4.5" />
            </div>
            <span className="font-extrabold tracking-tight">VoxSentra</span>
          </button>

          {/* Zone 4: Connection Badge, Sound Mute Button & Settings Gear (Right-aligned in row 1 on mobile, right on desktop) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 md:order-last">
            {/* CONNECTION BADGE: Green "Connected" if status == "ok", else red "Disconnected" */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-mono border transition-all select-none shadow-sm ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}
              title={
                isConnected
                  ? `Connected to ${health?.model || 'XLS-R 300M'}`
                  : 'Backend service unreachable. Click gear to update settings.'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                }`}
              />
              <span className="font-sans font-medium text-[11px] sm:text-xs">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* SOUND MUTE / UNMUTE BUTTON */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${
                soundMuted
                  ? 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
              }`}
              aria-label={soundMuted ? 'Unmute UI sounds' : 'Mute UI sounds'}
              title={soundMuted ? 'UI sounds muted (click to unmute)' : 'UI sounds active (click to mute)'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* SETTINGS: Gear icon opens modal with "API base URL", "Call Triage URL", and "API key" */}
            <button
              type="button"
              onClick={() => {
                playTick();
                setShowConfigModal(true);
              }}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
              aria-label="Open backend API settings"
              title="Configure API base URL, Call Triage URL, and API key"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Zone 2: Mode Switch Segmented Control (Wrapped below on mobile, centered/inline on desktop) */}
          <div className="w-full md:w-auto flex justify-center items-center order-last md:order-none py-0.5 md:py-0">
            <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 shadow-inner w-full sm:w-auto justify-center">
              <button
                type="button"
                onClick={() => {
                  if (appMode !== 'voice') {
                    playTick();
                    setAppMode('voice');
                  }
                }}
                className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  appMode === 'voice'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Voice Verification</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (appMode !== 'triage') {
                    playTick();
                    setAppMode('triage');
                  }
                }}
                className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  appMode === 'triage'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Triage</span>
              </button>
            </div>
          </div>

          {/* Zone 3: Navigation Links (Voice Verification mode on desktop) */}
          {appMode === 'voice' ? (
            <nav data-echo-target="nav" className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-300">
              <button
                type="button"
                onClick={() => {
                  playTick();
                  handleReset();
                  setCurrentView('home');
                }}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentView === 'home' && !activeResult ? 'text-cyan-400 font-semibold' : ''
                }`}
              >
                Verify Audio
              </button>
              <button
                type="button"
                onClick={() => {
                  playTick();
                  setCurrentView('guard');
                }}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  currentView === 'guard' ? 'text-cyan-400 font-semibold' : ''
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                <span>Guard</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playTick();
                  setCurrentView('how_it_works');
                }}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentView === 'how_it_works' ? 'text-cyan-400 font-semibold' : ''
                }`}
              >
                Methodology
              </button>
              <button
                type="button"
                onClick={() => {
                  playTick();
                  setShowHistoryModal(true);
                }}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                History
              </button>
            </nav>
          ) : (
            <div className="hidden lg:block text-xs font-mono text-cyan-400/80">
              Acoustic Urgency Mode
            </div>
          )}
        </div>

        {/* Thin glowing cyan divider line under navbar */}
        <div className="navbar-glow-line" />
      </header>

      {/* Main Workspace Stage with 250ms Page Transitions */}
      <main className="flex-1 flex flex-col justify-start pt-2 sm:pt-4 pb-2 sm:pb-3 px-3 sm:px-4 z-10 relative">
        <AnimatePresence mode="wait">
          {appMode === 'triage' ? (
            <motion.div
              key="triage-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              <CallTriageView
                triageUrl={triageUrl}
                onOpenSettings={() => setShowConfigModal(true)}
              />
            </motion.div>
          ) : analysisError ? (
            <motion.div
              key="error-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="max-w-2xl mx-auto w-full"
            >
              <ErrorState
                error={analysisError}
                onRetry={() => {
                  setShowConfigModal(true);
                }}
                onReset={handleReset}
              />
            </motion.div>
          ) : isAnalyzing ? (
            <motion.div
              key="analyzing-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="max-w-xl mx-auto w-full pt-6 sm:pt-10 space-y-4"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display text-white">
                  Verifying Audio Recording
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  Sending clip to XLS-R inference pipeline...
                </p>
              </div>

              {/* Echo Mascot in Hero Center analyzing with magnifying glass */}
              <div className="flex items-center justify-center my-2 sm:my-3">
                <EchoMascot
                  isAnalyzing={true}
                  isBackendDisconnected={!isConnected}
                  dropTrigger={dropTrigger}
                  cursorTarget={cursorTarget}
                  mode={appMode}
                  interactive={false}
                />
              </div>

              <AnalysisProgress
                stage={analysisStage}
                uploadProgress={uploadProgress}
                onCancel={handleCancelAnalysis}
                fileName={activeFileName}
              />
            </motion.div>
          ) : currentView === 'result' && activeResult ? (
            <motion.div
              key="result-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              <ResultPage
                response={activeResult}
                fileName={activeFileName}
                onAnalyzeAnother={handleReset}
              />
            </motion.div>
          ) : currentView === 'guard' ? (
            <motion.div
              key="guard-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              <TransactionGuardPage />
            </motion.div>
          ) : currentView === 'how_it_works' ? (
            <motion.div
              key="how-it-works-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              <HowItWorks />
            </motion.div>
          ) : (
            <motion.div
              key="home-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              <HomePage
                onAudioReady={startAnalysis}
                onNavigateHowItWorks={() => setCurrentView('how_it_works')}
                disabled={isAnalyzing}
                isAnalyzing={isAnalyzing}
                verdictResult={activeResult?.zone}
                isBackendDisconnected={!isConnected}
                dropTrigger={dropTrigger}
                cursorTarget={cursorTarget}
                mode={appMode}
                onSelectMode={(newMode) => {
                  setAppMode(newMode);
                  setTimeout(() => {
                    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
                  }, 60);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* SETTINGS MODAL: API base URL and API key */}
      {showConfigModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 bg-[#0D121F] border border-white/10 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-semibold text-white font-display">API Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs text-slate-300">
              <p className="text-slate-400 leading-relaxed">
                Configure your REST backend endpoint and access credentials. Settings are stored safely in browser local storage.
              </p>

              {/* API base URL */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  <span>API Base URL</span>
                </label>
                <input
                  type="text"
                  value={inputBaseUrl}
                  onChange={(e) => setInputBaseUrl(e.target.value)}
                  placeholder="e.g. https://api.yourbackend.com or http://localhost:8000"
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/20 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <span className="text-[11px] text-slate-400">
                  Target for /health, /v1/analyze, and /v1/transaction/check
                </span>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                  <span>API Key</span>
                </label>
                <input
                  type="password"
                  value={inputApiKey}
                  onChange={(e) => setInputApiKey(e.target.value)}
                  placeholder="Enter API Key (sent via X-API-Key)"
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/20 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <span className="text-[11px] text-slate-400">
                  Transmitted with protected calls via header: <code className="text-cyan-300">X-API-Key</code>
                </span>
              </div>

              {/* Call Triage Server URL (no API key needed) */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Call Triage Server URL</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={inputTriageUrl}
                  onChange={(e) => setInputTriageUrl(e.target.value)}
                  placeholder="e.g. https://triage.example.com or http://localhost:8000"
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/20 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <span className="text-[11px] text-slate-400">
                  Target for Call Triage /v1/analyze and /v1/stream WebSocket triage. No API key needed.
                </span>
              </div>

              {/* Live Status readout */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Connection Status:</span>
                  <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {isConnected ? 'Connected (status: ok)' : 'Disconnected'}
                  </span>
                </div>
                {health && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Model:</span>
                      <span className="text-slate-200">{health.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Device:</span>
                      <span className="text-slate-200">{health.device}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Echo Mascot Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                <div>
                  <span className="text-slate-200 font-medium block">Echo Mascot</span>
                  <span className="text-[11px] text-slate-400">Interactive visual mascot</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={echoEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEchoEnabled(checked);
                      try {
                        localStorage.setItem('voxsentra_echo_enabled', String(checked));
                      } catch {}
                      window.dispatchEvent(new CustomEvent('voxsentra_echo_toggle'));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {settingsSavedMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{settingsSavedMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    clearApiConfig();
                    clearTriageBaseUrl();
                    setInputBaseUrl('');
                    setInputApiKey('');
                    setInputTriageUrl('');
                    setTriageUrl('');
                    refreshHealth();
                  }}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Clear Settings
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg border border-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded-lg transition-colors cursor-pointer font-display"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTORY MODAL: only store {time, filename, zone, risk, score} */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 bg-[#0D121F] border border-white/10 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <HistoryIcon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-semibold text-white font-display">Analysis History</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Stores only verification metadata without audio recording persistence.
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 font-mono">No analyses recorded yet.</p>
              ) : (
                history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-white block truncate max-w-xs">
                        {item.filename}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.time).toLocaleTimeString()} · {new Date(item.time).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span
                        className={`text-xs font-bold font-mono uppercase px-2 py-0.5 rounded ${
                          item.zone === 'GREEN'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : item.zone === 'AMBER'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {item.zone}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Risk: {item.risk}/100 · Score: {item.score?.toFixed(3)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/10 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
