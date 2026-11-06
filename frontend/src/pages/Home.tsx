import React, { useState } from 'react';
import { DropZone } from '../components/DropZone';
import { Recorder } from '../components/Recorder';
import { EchoMascot } from '../components/EchoMascot';
import { Zone } from '../lib/types';

interface HomePageProps {
  onAudioReady: (file: File) => void;
  onNavigateHowItWorks: () => void;
  disabled?: boolean;
  isAnalyzing?: boolean;
  verdictResult?: Zone | null;
  isBackendDisconnected?: boolean;
  dropTrigger?: number;
  cursorTarget?: 'default' | 'dropzone' | 'record' | 'nav';
  mode?: 'voice' | 'triage';
  onSelectMode?: (newMode: 'voice' | 'triage') => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onAudioReady,
  onNavigateHowItWorks,
  disabled = false,
  isAnalyzing = false,
  verdictResult = null,
  isBackendDisconnected = false,
  dropTrigger = 0,
  cursorTarget = 'default',
  mode = 'voice',
  onSelectMode,
}) => {
  const [showRecorder, setShowRecorder] = useState(false);

  const handleAudioSelected = (file: File) => {
    onAudioReady(file);
  };

  const handleAudioRecorded = (file: File) => {
    setShowRecorder(false);
    onAudioReady(file);
  };

  return (
    <div className="w-full max-w-3xl mx-auto pt-2 sm:pt-4 pb-1 sm:pb-2 px-3 sm:px-4 relative z-10">
      {/* 1. Header & Headline (compact top padding) */}
      <div className="text-center space-y-1 sm:space-y-1.5">
        <h1
          className="font-extrabold tracking-tight font-display bg-gradient-to-r from-white via-slate-100 to-cyan-200 bg-clip-text text-transparent leading-[1.15] pb-0.5"
          style={{ fontSize: 'clamp(1.5rem, 5.5vw, 2.75rem)' }}
        >
          Empirical Voice Deepfake Verification
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-normal mt-1">
          Verify acoustic recordings against our XLS-R foundation model pipeline with calibrated window-level risk assessment.
        </p>
      </div>

      {/* 2. Echo Forensic Mascot in Exact Center Hero Spot (8-16px margin) */}
      <div className="flex items-center justify-center my-2 sm:my-3">
        <EchoMascot
          isAnalyzing={isAnalyzing}
          verdictResult={verdictResult}
          isBackendDisconnected={isBackendDisconnected}
          dropTrigger={dropTrigger}
          cursorTarget={cursorTarget}
          mode={mode}
          interactive={true}
          onSelectMode={onSelectMode}
        />
      </div>

      {/* 3. Primary Audio Action Block (12-16px below mascot) */}
      <div className="mt-3 sm:mt-4 space-y-3">
        {showRecorder ? (
          <Recorder
            onAudioRecorded={handleAudioRecorded}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <DropZone
            onAudioSelected={handleAudioSelected}
            onRecordClick={() => setShowRecorder(true)}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};
