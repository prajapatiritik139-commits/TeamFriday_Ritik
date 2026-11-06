import React, { useState, MouseEvent } from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';
import { motion } from 'motion/react';
import { Verdict } from '../lib/types';

interface VerdictCardProps {
  verdict: Verdict;
  explanation: string;
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ verdict, explanation }) => {
  const [tilt, setTilt] = useState({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const getVerdictConfig = () => {
    switch (verdict as any) {
      case 'GREEN':
      case 'likely_human':
        return {
          title: 'Likely Human',
          colorClass: 'text-[#34D399]',
          bgClass: 'bg-[#34D399]/10 border-[#34D399]/30 shadow-[0_8px_30px_rgba(52,211,153,0.12)]',
          badgeText: 'No synthetic-voice signal detected by the model.',
          Icon: ShieldCheck,
        };
      case 'AMBER':
      case 'needs_verification':
        return {
          title: 'Needs Verification',
          colorClass: 'text-[#FBBF24]',
          bgClass: 'bg-[#FBBF24]/10 border-[#FBBF24]/30 shadow-[0_8px_30px_rgba(251,191,36,0.12)]',
          badgeText: 'Suspicious but not confirmed. Verify the caller through another channel.',
          Icon: AlertTriangle,
        };
      case 'RED':
      case 'likely_synthetic':
      default:
        return {
          title: 'Likely Synthetic',
          colorClass: 'text-[#F87171]',
          bgClass: 'bg-[#F87171]/10 border-[#F87171]/30 shadow-[0_8px_30px_rgba(248,113,113,0.12)]',
          badgeText: "Strong synthetic-voice signal. Verify through another channel.",
          Icon: AlertOctagon,
        };
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotX = -((y - rect.height / 2) / (rect.height / 2)) * 5;
    const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 5;
    setTilt({ rotX, rotY, hX: x, hY: y, active: true });
  };

  const handleMouseLeave = () => {
    setTilt({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });
  };

  const config = getVerdictConfig();
  const { Icon } = config;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: tilt.active
          ? `perspective(1000px) rotateX(${tilt.rotX.toFixed(2)}deg) rotateY(${tilt.rotY.toFixed(2)}deg)`
          : 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
      }}
      className={`w-full rounded-2xl p-6 md:p-8 border glass-panel ${config.bgClass} transition-all duration-150 relative overflow-hidden tilt-card`}
    >
      {/* Moving Specular Highlight */}
      {tilt.active && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-150"
          style={{
            background: `radial-gradient(circle 320px at ${tilt.hX}px ${tilt.hY}px, rgba(255,255,255,0.08), transparent 70%)`,
          }}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10 z-10 relative">
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${config.colorClass}`}>
            <Icon className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
              Forensic Verdict
            </span>
            <h2 className={`text-2xl md:text-3xl font-bold tracking-tight font-display ${config.colorClass}`}>
              {config.title}
            </h2>
          </div>
        </div>

        <div className="text-left md:text-right">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-200">
            {config.badgeText}
          </span>
        </div>
      </div>

      <div className="pt-4 z-10 relative">
        <p className="text-sm md:text-base text-slate-200 leading-relaxed">
          {explanation}
        </p>
      </div>
    </motion.div>
  );
};
