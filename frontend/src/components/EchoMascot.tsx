import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Sparkles,
  HelpCircle,
  BookOpen,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  PhoneCall,
  Upload,
  Radio,
  Settings,
  AlertCircle,
  Check,
} from 'lucide-react';
import { Zone } from '../lib/types';
import { playMascotBlip, playMenuWhoosh, playTick } from '../lib/soundEffects';

export type EchoState =
  | 'idle'
  | 'looking'
  | 'hover'
  | 'drop'
  | 'analyzing'
  | 'sleepy'
  | 'human'
  | 'synthetic'
  | 'verify';

export type MascotMenuState =
  | 'closed'
  | 'main'
  | 'modes'
  | 'how_it_works'
  | 'features'
  | 'help';

interface EchoMascotProps {
  isAnalyzing: boolean;
  verdictResult?: Zone | string | null;
  isBackendDisconnected?: boolean;
  dropTrigger?: number; // timestamp when file is dropped
  cursorTarget?: 'default' | 'dropzone' | 'record' | 'nav';
  mode?: 'voice' | 'triage';
  interactive?: boolean; // defaults to true on home screen
  onSelectMode?: (newMode: 'voice' | 'triage') => void;
}

export const EchoMascot: React.FC<EchoMascotProps> = ({
  isAnalyzing,
  verdictResult = null,
  isBackendDisconnected = false,
  dropTrigger = 0,
  cursorTarget = 'default',
  mode = 'voice',
  interactive = true,
  onSelectMode,
}) => {
  // Echo enabled setting (stored in localStorage)
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('voxsentra_echo_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [state, setState] = useState<EchoState>('idle');
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isInactive, setIsInactive] = useState(false);

  // Pop-out Menu State
  const [menuState, setMenuState] = useState<MascotMenuState>('closed');

  // Interactive face mood & bounce reaction
  const [mood, setMood] = useState<'default' | 'happy'>('default');
  const [isBouncing, setIsBouncing] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hasPlayedShake, setHasPlayedShake] = useState(false);

  // Pupil and Head Tilt Offsets
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [headTiltDeg, setHeadTiltDeg] = useState(0);

  // Reduced motion and touch detection
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const verdictTimerRef = useRef<number | null>(null);
  const inactiveTimerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Sync settings storage changes from modal
  useEffect(() => {
    const handleStorage = () => {
      try {
        const saved = localStorage.getItem('voxsentra_echo_enabled');
        if (saved !== null) setIsEnabled(saved === 'true');
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('voxsentra_echo_toggle', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('voxsentra_echo_toggle', handleStorage);
    };
  }, []);

  // Detect environment (reduced motion, touch device)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const mediaListener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    media.addEventListener('change', mediaListener);

    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);

    return () => media.removeEventListener('change', mediaListener);
  }, []);

  // Inactivity tracking (30 seconds of no user interaction triggers sleepy state)
  useEffect(() => {
    const resetInactive = () => {
      setIsInactive(false);
      if (inactiveTimerRef.current) clearTimeout(inactiveTimerRef.current);
      inactiveTimerRef.current = window.setTimeout(() => {
        setIsInactive(true);
      }, 30000);
    };

    resetInactive();
    window.addEventListener('pointermove', resetInactive);
    window.addEventListener('keydown', resetInactive);
    window.addEventListener('click', resetInactive);
    window.addEventListener('touchstart', resetInactive);

    return () => {
      if (inactiveTimerRef.current) clearTimeout(inactiveTimerRef.current);
      window.removeEventListener('pointermove', resetInactive);
      window.removeEventListener('keydown', resetInactive);
      window.removeEventListener('click', resetInactive);
      window.removeEventListener('touchstart', resetInactive);
    };
  }, []);

  // Blinking loop (every 3 to 6 seconds)
  useEffect(() => {
    let timeoutId: number;
    const scheduleBlink = () => {
      const delay = Math.random() * 3000 + 3000;
      timeoutId = window.setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 180);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => clearTimeout(timeoutId);
  }, []);

  // Close pop-out menu on click outside or Esc key
  useEffect(() => {
    if (menuState === 'closed') return;

    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        playMenuWhoosh(false);
        setMenuState('closed');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        playMenuWhoosh(false);
        setMenuState('closed');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  // Handle verdict state transitions & red shake reactions
  useEffect(() => {
    if (!verdictResult) {
      setHasPlayedShake(false);
      return;
    }

    if (verdictTimerRef.current) clearTimeout(verdictTimerRef.current);

    const norm = String(verdictResult).toUpperCase();
    const isRedOrHigh = norm === 'RED' || norm === 'LIKELY_SYNTHETIC' || norm === 'HIGH';
    const isGreenOrLow = norm === 'GREEN' || norm === 'LIKELY_HUMAN' || norm === 'LOW';

    if (isGreenOrLow) {
      setState('human');
    } else if (isRedOrHigh) {
      setState('synthetic');
      // Trigger a short shake once (not looping)
      if (!hasPlayedShake) {
        setIsShaking(true);
        setHasPlayedShake(true);
        setTimeout(() => setIsShaking(false), 550);
      }
    } else {
      setState('verify');
    }

    verdictTimerRef.current = window.setTimeout(() => {
      setState('idle');
    }, 6000);

    return () => {
      if (verdictTimerRef.current) clearTimeout(verdictTimerRef.current);
    };
  }, [verdictResult, hasPlayedShake]);

  // Handle file drop reaction (eyes widen, headphones lift)
  useEffect(() => {
    if (dropTrigger > 0) {
      setState('drop');
      const timer = setTimeout(() => {
        setState(isAnalyzing ? 'analyzing' : 'idle');
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [dropTrigger, isAnalyzing]);

  // Mouse tracking and looking behavior (desktop non-touch)
  useEffect(() => {
    if (isTouchDevice || reducedMotion) return;

    let targetPupilX = 0;
    let targetPupilY = 0;
    let targetTilt = 0;
    let currentPupilX = 0;
    let currentPupilY = 0;
    let currentTilt = 0;

    const handlePointerMove = (e: PointerEvent) => {
      if (document.hidden) return;

      let echoCenterX = window.innerWidth / 2;
      let echoCenterY = window.innerHeight * 0.38;

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        echoCenterX = rect.left + rect.width / 2;
        echoCenterY = rect.top + rect.height / 2;
      }

      const dx = e.clientX - echoCenterX;
      const dy = e.clientY - echoCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const maxPupil = 7;
      targetPupilX = Math.max(-maxPupil, Math.min(maxPupil, (dx / Math.max(1, dist)) * maxPupil));
      targetPupilY = Math.max(-maxPupil, Math.min(maxPupil, (dy / Math.max(1, dist)) * maxPupil));

      const angle = Math.atan2(dy, dx);
      targetTilt = Math.max(-8, Math.min(8, (angle * 180) / Math.PI / 8));
    };

    window.addEventListener('pointermove', handlePointerMove);

    const updateLoop = () => {
      if (!document.hidden) {
        let effTargetX = targetPupilX;
        let effTargetY = targetPupilY;
        let effTargetTilt = targetTilt;

        if (cursorTarget === 'nav') {
          effTargetY = -7;
          effTargetX = 2;
          effTargetTilt = -4;
        } else if (cursorTarget === 'record') {
          effTargetX = 6;
          effTargetY = 4;
          effTargetTilt = 7;
        } else if (cursorTarget === 'dropzone') {
          effTargetY = 6;
          effTargetX = Math.max(-4, Math.min(4, targetPupilX));
          effTargetTilt = 2;
        } else if (mode === 'triage') {
          // In Call Triage mode: tilts head as if listening
          effTargetTilt = -9;
        }

        currentPupilX += (effTargetX - currentPupilX) * 0.12;
        currentPupilY += (effTargetY - currentPupilY) * 0.12;
        currentTilt += (effTargetTilt - currentTilt) * 0.1;

        setPupilOffset({ x: currentPupilX, y: currentPupilY });
        setHeadTiltDeg(currentTilt);
      }
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isTouchDevice, reducedMotion, cursorTarget, mode]);

  if (!isEnabled) {
    return null;
  }

  // Determine current active state priority
  const activeState: EchoState = isBackendDisconnected || isInactive
    ? 'sleepy'
    : isAnalyzing
    ? 'analyzing'
    : state !== 'idle'
    ? state
    : isHovered
    ? 'hover'
    : cursorTarget !== 'default' || Math.abs(pupilOffset.x) > 1.5 || Math.abs(pupilOffset.y) > 1.5
    ? 'looking'
    : 'idle';

  // Mascot Click: Toggle Pop-Out Speech-Bubble Menu
  const handleMascotClick = () => {
    if (!interactive) return;

    // 1) Tap on mascot sound: soft blip
    playMascotBlip();

    // Small happy bounce
    setIsBouncing(true);
    setMood('happy');
    setTimeout(() => {
      setIsBouncing(false);
      setMood('default');
    }, 450);

    // 2) Toggle menu with whoosh sound
    if (menuState !== 'closed') {
      playMenuWhoosh(false);
      setMenuState('closed');
    } else {
      playMenuWhoosh(true);
      setMenuState('main');
    }
  };

  // Switch mode action
  const handleSwitchMode = (targetMode: 'voice' | 'triage') => {
    // 3) Clicking menu bubble or switching mode: short tick
    playTick();
    if (onSelectMode) {
      onSelectMode(targetMode);
    }
    setMenuState('closed');
    // Scroll to main workspace
    setTimeout(() => {
      document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  // Expression parameters
  const isEyeWide = activeState === 'drop' || cursorTarget === 'dropzone';
  const isEyeSquint = activeState === 'analyzing' || (activeState === 'synthetic' && !isShaking);
  const isEyeSleepy = activeState === 'sleepy';
  const isSmile = activeState === 'human' || mood === 'happy';
  const isListeningMood = mode === 'triage';
  const isRaisedEyebrow = activeState === 'analyzing' || activeState === 'synthetic';
  const isWiggleHeadphones = cursorTarget === 'record' || activeState === 'hover';
  const isHeadphonesLifted = activeState === 'drop';
  const isShrugVerify = activeState === 'verify';

  // Check if current result is Red/High or Green/Low
  const normVerdict = verdictResult ? String(verdictResult).toUpperCase() : '';
  const isRedVerdict = normVerdict === 'RED' || normVerdict === 'LIKELY_SYNTHETIC' || normVerdict === 'HIGH';
  const isGreenVerdict = normVerdict === 'GREEN' || normVerdict === 'LIKELY_HUMAN' || normVerdict === 'LOW';

  // Head tilt: in Triage mode tilts head as if listening (~ -9deg)
  const modeTilt = mode === 'triage' ? -9 : 0;
  const effectiveTilt = isShrugVerify ? 12 : headTiltDeg || modeTilt;

  // Mode-dependent eye scanning: slow scanning movement in Voice Verification mode when idle
  const isScanningEyes = mode === 'voice' && activeState === 'idle' && !reducedMotion;

  return (
    <div
      ref={wrapperRef}
      className="relative flex flex-row items-center justify-center gap-3 md:gap-7 my-1 sm:my-2 w-full max-w-3xl mx-auto px-2 sm:px-0"
    >
      {/* Mascot Column */}
      <div className={`flex flex-col items-center justify-center transition-all ${menuState !== 'closed' ? 'w-[38%] shrink-0 md:w-auto' : 'w-auto'}`}>
        <div
          ref={containerRef}
          aria-label="Echo Forensic Mascot (Tap to open menu)"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleMascotClick();
            }
          }}
          className={`relative flex items-center justify-center select-none pointer-events-auto cursor-pointer focus:outline-none transition-transform duration-200 ease-out group ${
            activeState === 'idle' && !isBouncing && !isShaking && !reducedMotion ? 'echo-floating-bob' : ''
          } ${isBouncing && !reducedMotion ? 'echo-bounce-active' : ''} ${
            isShaking && !reducedMotion ? 'echo-shake-once' : ''
          }`}
          style={{
            transform: `translate3d(0, ${isHovered ? -6 : 0}px, 0)`,
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleMascotClick}
          title="Tap Echo for menu options"
        >
          {/* Avatar Graphic */}
          <div
            className={`transition-transform duration-200 ease-out flex items-center justify-center ${
              menuState !== 'closed' ? 'echo-mascot-avatar-open' : 'echo-mascot-avatar-closed'
            } ${activeState === 'analyzing' && !reducedMotion ? 'echo-thinking' : ''}`}
            style={{
              transform: reducedMotion ? 'none' : `rotate(${effectiveTilt.toFixed(1)}deg)`,
              transformOrigin: '190px 190px',
            }}
          >
            <svg
              viewBox="0 0 380 380"
              className="w-full h-full overflow-visible filter drop-shadow-[0_12px_28px_rgba(7,11,20,0.65)]"
            >
              <defs>
                {/* Halo glow filter */}
                <filter id="echo-halo-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="16" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                {/* Upper soft highlight gradient */}
                <linearGradient id="echo-highlight-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.1" />
                </linearGradient>

                {/* Darker lower shade gradient */}
                <linearGradient id="echo-shade-grad" x1="50%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0" />
                  <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.6" />
                </linearGradient>
              </defs>

              {/* 1. Behind Echo: Soft Halo (Cyan, or Red for Red/High verdict, or Emerald for Green/Low) */}
              <circle
                cx="190"
                cy="190"
                r="114"
                fill={isRedVerdict ? '#F43F5E' : isGreenVerdict ? '#10B981' : '#22D3EE'}
                fillOpacity={isRedVerdict ? 0.35 : 0.16}
                filter="url(#echo-halo-glow)"
                className={reducedMotion ? '' : 'echo-halo-breath'}
                style={{
                  transition: 'fill 0.4s ease, fill-opacity 0.4s ease',
                }}
              />

              {/* 2. Sound-Wave Arcs Behind Echo */}
              <g className={reducedMotion ? '' : 'echo-soundwaves-breath'}>
                {/* Left Sound-Wave Arcs */}
                <path
                  d="M 68 155 A 46 46 0 0 0 68 225"
                  stroke={isRedVerdict ? '#F43F5E' : '#22D3EE'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={activeState === 'human' || isListeningMood ? '1' : '0.9'}
                />
                <path
                  d="M 50 140 A 64 64 0 0 0 50 240"
                  stroke={isRedVerdict ? '#F43F5E' : '#22D3EE'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={activeState === 'human' || isListeningMood ? '0.85' : '0.5'}
                />

                {/* Right Sound-Wave Arcs */}
                <path
                  d="M 312 155 A 46 46 0 0 1 312 225"
                  stroke={isRedVerdict ? '#F43F5E' : '#22D3EE'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={activeState === 'human' || isListeningMood ? '1' : '0.9'}
                />
                <path
                  d="M 330 140 A 64 64 0 0 1 330 240"
                  stroke={isRedVerdict ? '#F43F5E' : '#22D3EE'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={activeState === 'human' || isListeningMood ? '0.85' : '0.5'}
                />
              </g>

              {/* 3. Full Orb Body (radius 92, fill #2563EB) */}
              <circle cx="190" cy="190" r="92" fill="#2563EB" />

              {/* Darker Lower Shade #1D4ED8 (60% opacity) */}
              <path
                d="M 98 190 A 92 92 0 0 0 282 190 Z"
                fill="#1D4ED8"
                fillOpacity="0.6"
              />

              {/* Soft Highlight Ellipse #60A5FA (55% opacity) on upper left */}
              <ellipse
                cx="145"
                cy="140"
                rx="38"
                ry="22"
                transform="rotate(-28 145 140)"
                fill="#60A5FA"
                fillOpacity="0.55"
              />

              {/* 4. Headphones: Dark Navy #0B1B3A Band Over Top & Ear Cups */}
              <g
                style={{
                  transform: isHeadphonesLifted
                    ? 'translateY(-12px)'
                    : isWiggleHeadphones
                    ? 'translateY(-3px)'
                    : 'none',
                  transition: 'transform 0.2s ease-out',
                }}
                className={isWiggleHeadphones && !reducedMotion ? 'echo-wiggle-headphones' : ''}
              >
                {/* Top Band */}
                <path
                  d="M 98 190 C 98 96, 282 96, 282 190"
                  stroke="#0B1B3A"
                  strokeWidth="15"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Left Ear Cup */}
                <g>
                  <rect
                    x="82"
                    y="156"
                    width="28"
                    height="68"
                    rx="14"
                    fill="#0B1B3A"
                    stroke="#08142b"
                    strokeWidth="2"
                  />
                  <line
                    x1="96"
                    y1="168"
                    x2="96"
                    y2="212"
                    stroke={isListeningMood ? '#38BDF8' : '#22D3EE'}
                    strokeWidth={isListeningMood ? '4.5' : '3.5'}
                    strokeLinecap="round"
                  />
                </g>

                {/* Right Ear Cup */}
                <g>
                  <rect
                    x="270"
                    y="156"
                    width="28"
                    height="68"
                    rx="14"
                    fill="#0B1B3A"
                    stroke="#08142b"
                    strokeWidth="2"
                  />
                  <line
                    x1="284"
                    y1="168"
                    x2="284"
                    y2="212"
                    stroke={isListeningMood ? '#38BDF8' : '#22D3EE'}
                    strokeWidth={isListeningMood ? '4.5' : '3.5'}
                    strokeLinecap="round"
                  />
                </g>
              </g>

              {/* 5. Face Features */}
              {/* Pink Cheeks */}
              <ellipse
                cx="132"
                cy="208"
                rx="14"
                ry="9"
                fill="#F9A8D4"
                fillOpacity={mood === 'happy' ? '0.85' : '0.6'}
              />
              <ellipse
                cx="248"
                cy="208"
                rx="14"
                ry="9"
                fill="#F9A8D4"
                fillOpacity={mood === 'happy' ? '0.85' : '0.6'}
              />

              {/* Eyebrows */}
              {/* Left Eyebrow */}
              <path
                d={
                  isRaisedEyebrow
                    ? 'M 140 144 Q 155 134 170 144'
                    : 'M 142 154 Q 155 148 168 154'
                }
                stroke="#0B1B3A"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
                style={{ transition: 'd 0.2s ease-out' }}
              />
              {/* Right Eyebrow */}
              <path
                d={
                  isRaisedEyebrow
                    ? 'M 210 138 Q 225 124 240 138'
                    : 'M 212 154 Q 225 148 238 154'
                }
                stroke="#0B1B3A"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
                style={{ transition: 'd 0.2s ease-out' }}
              />

              {/* Eyes & Pupils */}
              {isBlinking ? (
                /* Blinking eyelids */
                <g style={{ transition: 'opacity 0.2s ease-out' }}>
                  <line x1="140" y1="184" x2="170" y2="184" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" />
                  <line x1="210" y1="184" x2="240" y2="184" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" />
                </g>
              ) : isEyeSleepy ? (
                /* Sleepy eyes */
                <g style={{ transition: 'all 0.2s ease-out' }}>
                  <path d="M 140 184 Q 155 177 170 184" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <circle cx="155" cy="186" r="4.5" fill="#0B1B3A" />
                  <path d="M 210 184 Q 225 177 240 184" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <circle cx="225" cy="186" r="4.5" fill="#0B1B3A" />
                </g>
              ) : isEyeSquint ? (
                /* Squinting eyes */
                <g style={{ transition: 'all 0.2s ease-out' }}>
                  <path d="M 140 182 Q 155 173 170 182" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <ellipse cx="155" cy="182" rx="6.5" ry="3.5" fill="#0B1B3A" />
                  <path d="M 210 182 Q 225 173 240 182" stroke="#0B1B3A" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <ellipse cx="225" cy="182" rx="6.5" ry="3.5" fill="#0B1B3A" />
                </g>
              ) : (
                /* Large white oval eyes with pupil tracking or scanning */
                <g style={{ transition: 'all 0.2s ease-out' }}>
                  {/* Left Eye White */}
                  <ellipse
                    cx="155"
                    cy="184"
                    rx={isEyeWide ? '18' : '15'}
                    ry={isEyeWide ? '25' : '21'}
                    fill="white"
                    stroke="#0B1B3A"
                    strokeWidth="1.5"
                    style={{ transition: 'rx 0.2s ease-out, ry 0.2s ease-out' }}
                  />
                  {/* Left Pupil */}
                  <g
                    className={isScanningEyes ? 'echo-scanning-eyes' : ''}
                    style={{
                      transform: isScanningEyes
                        ? undefined
                        : `translate(${pupilOffset.x.toFixed(1)}px, ${pupilOffset.y.toFixed(1)}px)`,
                      transition: isScanningEyes ? undefined : 'transform 0.12s ease-out',
                    }}
                  >
                    <circle cx="155" cy="184" r="8" fill="#0B1B3A" />
                    <circle cx="152.5" cy="181.5" r="2.8" fill="white" />
                  </g>

                  {/* Right Eye White */}
                  <ellipse
                    cx="225"
                    cy="184"
                    rx={isEyeWide ? '18' : '15'}
                    ry={isEyeWide ? '25' : '21'}
                    fill="white"
                    stroke="#0B1B3A"
                    strokeWidth="1.5"
                    style={{ transition: 'rx 0.2s ease-out, ry 0.2s ease-out' }}
                  />
                  {/* Right Pupil */}
                  <g
                    className={isScanningEyes ? 'echo-scanning-eyes' : ''}
                    style={{
                      transform: isScanningEyes
                        ? undefined
                        : `translate(${pupilOffset.x.toFixed(1)}px, ${pupilOffset.y.toFixed(1)}px)`,
                      transition: isScanningEyes ? undefined : 'transform 0.12s ease-out',
                    }}
                  >
                    <circle cx="225" cy="184" r="8" fill="#0B1B3A" />
                    <circle cx="222.5" cy="181.5" r="2.8" fill="white" />
                  </g>
                </g>
              )}

              {/* 6. Mouth */}
              <path
                d={
                  isSmile
                    ? 'M 172 212 Q 190 228 208 212' // Gentle joyful smile
                    : isEyeSleepy
                    ? 'M 175 218 L 205 218' // Calm sleepy mouth
                    : activeState === 'hover'
                    ? 'M 168 216 Q 178 206, 188 216 T 208 216' // Lively waving mouth
                    : 'M 172 216 Q 180 211, 188 216 T 204 216' // Standard waveform mouth
                }
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{ transition: 'd 0.2s ease-out' }}
              />

              {/* Magnifying Glass Accessory while analyzing */}
              {activeState === 'analyzing' && (
                <g
                  className="animate-bounce"
                  style={{
                    transform: 'translate(254px, 128px)',
                    transition: 'opacity 0.2s ease-out',
                  }}
                >
                  <circle cx="24" cy="24" r="18" fill="none" stroke="#22D3EE" strokeWidth="4" />
                  <circle cx="24" cy="24" r="15" fill="#22D3EE" fillOpacity="0.2" />
                  <line x1="38" y1="38" x2="52" y2="52" stroke="#22D3EE" strokeWidth="5" strokeLinecap="round" />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* 1) Tiny "Tap me" hint under the mascot when closed */}
        {interactive && menuState === 'closed' && (
          <div
            className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-mono text-cyan-400 tracking-wide select-none cursor-pointer"
            onClick={handleMascotClick}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
            <span>Tap me</span>
          </div>
        )}

        {/* Closed hint helper */}
        {interactive && menuState !== 'closed' && (
          <div className="mt-2 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-mono text-slate-400 select-none text-center">
            <span>Tap Echo to close</span>
          </div>
        )}
      </div>

      {/* 2) Tap the mascot: Four speech-bubble buttons pop out to the right */}
      {interactive && menuState === 'main' && (
        <div className="flex flex-col gap-2 flex-1 min-w-0 md:w-72 relative z-20">
          {/* Button 1: Modes */}
          <button
            type="button"
            onClick={() => {
              playTick();
              setMenuState('modes');
            }}
            className="echo-stagger-1 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] glass-panel bg-[#0D1424]/95 border border-cyan-400/30 hover:border-cyan-400/70 hover:bg-cyan-500/10 text-white text-sm font-semibold flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all cursor-pointer group select-none relative"
          >
            {/* Small left-pointing tail toward Echo mascot */}
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <Sliders className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="truncate text-sm">Modes</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 transition-colors shrink-0" />
          </button>

          {/* Button 2: Features */}
          <button
            type="button"
            onClick={() => {
              playTick();
              setMenuState('features');
            }}
            className="echo-stagger-2 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] glass-panel bg-[#0D1424]/95 border border-cyan-400/30 hover:border-cyan-400/70 hover:bg-cyan-500/10 text-white text-sm font-semibold flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all cursor-pointer group select-none relative"
          >
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <Sparkles className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="truncate text-sm">Features</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 transition-colors shrink-0" />
          </button>

          {/* Button 3: How it works */}
          <button
            type="button"
            onClick={() => {
              playTick();
              setMenuState('how_it_works');
            }}
            className="echo-stagger-3 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] glass-panel bg-[#0D1424]/95 border border-cyan-400/30 hover:border-cyan-400/70 hover:bg-cyan-500/10 text-white text-sm font-semibold flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all cursor-pointer group select-none relative"
          >
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <BookOpen className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="truncate text-sm">How it works</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 transition-colors shrink-0" />
          </button>

          {/* Button 4: Help */}
          <button
            type="button"
            onClick={() => {
              playTick();
              setMenuState('help');
            }}
            className="echo-stagger-4 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] glass-panel bg-[#0D1424]/95 border border-cyan-400/30 hover:border-cyan-400/70 hover:bg-cyan-500/10 text-white text-sm font-semibold flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all cursor-pointer group select-none relative"
          >
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <HelpCircle className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="truncate text-sm">Help</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 transition-colors shrink-0" />
          </button>
        </div>
      )}

      {/* 3) "Modes": Voice Verification, Call Triage, Back */}
      {interactive && menuState === 'modes' && (
        <div className="flex flex-col gap-2 flex-1 min-w-0 md:w-72 relative z-20 echo-bubble-pop">
          <div className="px-1 py-0.5 text-[10px] sm:text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="truncate">Select Mode</span>
            <span className="text-cyan-400 font-bold shrink-0">{mode === 'voice' ? 'Voice' : 'Triage'}</span>
          </div>

          {/* Mode 1: Voice Verification */}
          <button
            type="button"
            onClick={() => handleSwitchMode('voice')}
            className={`echo-stagger-1 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] text-sm font-semibold flex items-center justify-between transition-all cursor-pointer select-none border relative ${
              mode === 'voice'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/70 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                : 'glass-panel bg-[#0D1424]/95 text-slate-200 border-white/10 hover:border-cyan-400/40'
            }`}
          >
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate text-sm">Voice Verification</span>
            </span>
            {mode === 'voice' && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 shrink-0">
                Active
              </span>
            )}
          </button>

          {/* Mode 2: Call Triage */}
          <button
            type="button"
            onClick={() => handleSwitchMode('triage')}
            className={`echo-stagger-2 w-full min-h-[44px] px-3 py-2.5 rounded-[14px] text-sm font-semibold flex items-center justify-between transition-all cursor-pointer select-none border relative ${
              mode === 'triage'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/70 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                : 'glass-panel bg-[#0D1424]/95 text-slate-200 border-white/10 hover:border-cyan-400/40'
            }`}
          >
            <div
              className="block absolute -left-1.5 md:-left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] md:border-t-[6px] border-t-transparent border-b-[5px] md:border-b-[6px] border-b-transparent border-r-[7px] md:border-r-[8px] border-r-cyan-400/40"
              aria-hidden="true"
            />
            <span className="flex items-center gap-2 min-w-0 pr-1">
              <PhoneCall className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate text-sm">Call Triage</span>
            </span>
            {mode === 'triage' && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 shrink-0">
                Active
              </span>
            )}
          </button>

          {/* Back Button */}
          <button
            type="button"
            onClick={() => {
              playTick();
              setMenuState('main');
            }}
            className="echo-stagger-3 w-full min-h-[40px] px-3 py-2 rounded-[14px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        </div>
      )}

      {/* 4) "How it works": Compact card with 3-4 numbered steps for current mode */}
      {interactive && menuState === 'how_it_works' && (
        <div className="flex-1 min-w-0 md:w-80 lg:w-96 max-h-[60vh] overflow-y-auto glass-panel rounded-2xl p-3.5 sm:p-5 border border-cyan-400/30 bg-[#0D1424]/95 shadow-[0_4px_28px_rgba(0,0,0,0.5)] relative text-left echo-bubble-pop select-none z-20 space-y-3">
          <div
            className="block absolute -left-1.5 md:-left-2 top-8 w-0 h-0 border-t-[6px] md:border-t-[7px] border-t-transparent border-b-[6px] md:border-b-[7px] border-b-transparent border-r-[8px] md:border-r-[9px] border-r-cyan-400/40"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between pb-2 border-b border-white/10 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
              <h4 className="text-[11px] sm:text-xs font-bold text-white font-display uppercase tracking-wider truncate">
                How It Works
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">
              {mode === 'voice' ? 'Verification' : 'Triage'}
            </span>
          </div>

          {/* Numbered Steps */}
          {mode === 'voice' ? (
            <ol className="space-y-2 text-[11px] sm:text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>Upload or record audio via microphone or file picker.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>The audio is split into windows for acoustic scoring.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>Each window gets a synthetic-voice risk score.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  4
                </span>
                <span>The final zone is <strong className="text-emerald-400">GREEN</strong>, <strong className="text-amber-400">AMBER</strong> or <strong className="text-rose-400">RED</strong>.</span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-2 text-[11px] sm:text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>Upload a recording or use Live Mic to capture audio.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>Audio is scored in 6-second windows for anger, fear, distress, calm and happy.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>Urgency from 0–100 gives <strong className="text-emerald-400">LOW</strong>, <strong className="text-amber-400">MEDIUM</strong> or <strong className="text-rose-400">HIGH</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  4
                </span>
                <span>HIGH needs 2 of the last 3 windows to trigger escalation.</span>
              </li>
            </ol>
          )}

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playTick();
                setMenuState('main');
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span className="text-[10px] font-mono text-slate-400">Tap outside to close</span>
          </div>
        </div>
      )}

      {/* 5) "Features": Card listing all features grouped as Voice Verification and Call Triage */}
      {interactive && menuState === 'features' && (
        <div className="flex-1 min-w-0 md:w-80 lg:w-96 max-h-[60vh] overflow-y-auto glass-panel rounded-2xl p-3.5 sm:p-5 border border-cyan-400/30 bg-[#0D1424]/95 shadow-[0_4px_28px_rgba(0,0,0,0.5)] relative text-left echo-bubble-pop select-none z-20 space-y-3">
          <div
            className="block absolute -left-1.5 md:-left-2 top-8 w-0 h-0 border-t-[6px] md:border-t-[7px] border-t-transparent border-b-[6px] md:border-b-[7px] border-b-transparent border-r-[8px] md:border-r-[9px] border-r-cyan-400/40"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <h4 className="text-[11px] sm:text-xs font-bold text-white font-display uppercase tracking-wider">
                Features
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-400">VoxSentra Suite</span>
          </div>

          {/* Group 1: Voice Verification */}
          <div className="space-y-1">
            <h5 className="text-[10px] sm:text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Voice Verification</span>
            </h5>
            <ul className="space-y-1 text-[11px] sm:text-xs text-slate-300 pl-3.5 list-disc marker:text-cyan-400 leading-relaxed">
              <li>File upload (WAV, MP3, FLAC, M4A, OGG)</li>
              <li>Live microphone recording & validation</li>
              <li>Calibrated synthetic-voice risk gauge</li>
              <li>Window timeline & forensic details</li>
              <li>Analysis history saved locally</li>
              <li>Audio is analysed in memory and never stored.</li>
            </ul>
          </div>

          {/* Group 2: Call Triage */}
          <div className="space-y-1 pt-2 border-t border-white/5">
            <h5 className="text-[10px] sm:text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <PhoneCall className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Call Triage</span>
            </h5>
            <ul className="space-y-1 text-[11px] sm:text-xs text-slate-300 pl-3.5 list-disc marker:text-cyan-400 leading-relaxed">
              <li>Audio and video call analysis</li>
              <li>Real-time Live Mic streaming</li>
              <li>Urgency gauge (0–100) & LOW / MED / HIGH</li>
              <li>5-factor emotion distribution bars</li>
              <li>6-second acoustic window timeline</li>
              <li>Configurable server URL in Settings</li>
              <li>Optional synthetic-voice check</li>
            </ul>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playTick();
                setMenuState('main');
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span className="text-[10px] font-mono text-slate-400">Esc to close</span>
          </div>
        </div>
      )}

      {/* 6) "Help": Short card */}
      {interactive && menuState === 'help' && (
        <div className="flex-1 min-w-0 md:w-80 lg:w-96 max-h-[60vh] overflow-y-auto glass-panel rounded-2xl p-3.5 sm:p-5 border border-cyan-400/30 bg-[#0D1424]/95 shadow-[0_4px_28px_rgba(0,0,0,0.5)] relative text-left echo-bubble-pop select-none z-20 space-y-2.5">
          <div
            className="block absolute -left-1.5 md:-left-2 top-8 w-0 h-0 border-t-[6px] md:border-t-[7px] border-t-transparent border-b-[6px] md:border-b-[7px] border-b-transparent border-r-[8px] md:border-r-[9px] border-r-cyan-400/40"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
              <h4 className="text-[11px] sm:text-xs font-bold text-white font-display uppercase tracking-wider">
                Help & Guide
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Quick Guide</span>
          </div>

          <div className="space-y-2 text-[11px] sm:text-xs text-slate-300 leading-relaxed">
            <div className="space-y-0.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Upload a File:</span>
              </span>
              <p className="text-slate-400 pl-5 text-[10px] sm:text-[11px]">
                Drag and drop your audio or video file into the dropzone or click browse.
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Use Live Mic:</span>
              </span>
              <p className="text-slate-400 pl-5 text-[10px] sm:text-[11px]">
                Tap the Live Mic button to stream audio directly from your microphone.
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Call Triage Server URL:</span>
              </span>
              <p className="text-slate-400 pl-5 text-[10px] sm:text-[11px]">
                Open Settings via the gear icon in the header to enter your server URL.
              </p>
            </div>

            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 font-mono text-[10px] sm:text-[11px] flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <span>Results are indicative signals, not proof.</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playTick();
                setMenuState('main');
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span className="text-[10px] font-mono text-slate-400">Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
};
