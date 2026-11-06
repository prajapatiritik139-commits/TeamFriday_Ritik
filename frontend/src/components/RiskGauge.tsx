import React, { useState, MouseEvent } from 'react';
import { motion } from 'motion/react';
import { UncertaintyRange } from '../lib/types';

interface RiskGaugeProps {
  risk: number | null;
  calibrated: boolean;
  calibrationVersion: string | null;
  uncertainty: UncertaintyRange | null;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  risk,
  calibrated,
  calibrationVersion,
  uncertainty,
}) => {
  const [tilt, setTilt] = useState({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const isCalibrated = calibrated && Boolean(calibrationVersion);
  const scorePercent = risk !== null ? Math.round(risk * 100) : null;

  const lowPercent = uncertainty ? Math.round(uncertainty.low * 100) : null;
  const highPercent = uncertainty ? Math.round(uncertainty.high * 100) : null;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotX = -((y - rect.height / 2) / (rect.height / 2)) * 4.5;
    const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 4.5;
    setTilt({ rotX, rotY, hX: x, hY: y, active: true });
  };

  const handleMouseLeave = () => {
    setTilt({ rotX: 0, rotY: 0, hX: -1000, hY: -1000, active: false });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: tilt.active
          ? `perspective(1000px) rotateX(${tilt.rotX.toFixed(2)}deg) rotateY(${tilt.rotY.toFixed(2)}deg)`
          : 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
      }}
      className="w-full glass-panel rounded-2xl p-6 md:p-8 border border-white/10 shadow-lg relative overflow-hidden tilt-card transition-all duration-150"
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 z-10 relative">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight font-display">
            {isCalibrated ? 'Estimated Synthetic Probability' : 'Uncalibrated Model Score'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isCalibrated
              ? `Platt/Isotonic calibrated risk estimate (${calibrationVersion})`
              : 'Raw logistic sigmoid output; not calibrated against real-world prior odds'}
          </p>
        </div>

        <div className="text-left sm:text-right">
          {scorePercent !== null ? (
            <div className="flex items-baseline gap-1 sm:justify-end">
              <span className="text-3xl md:text-4xl font-bold font-mono text-white tabular-nums">
                {scorePercent}
              </span>
              <span className="text-sm font-mono text-cyan-400">%</span>
            </div>
          ) : (
            <span className="text-sm font-mono text-amber-400">Indeterminate</span>
          )}

          {uncertainty && lowPercent !== null && highPercent !== null && (
            <p className="text-[11px] font-mono text-slate-400 tabular-nums">
              95% CI: [{lowPercent}%, {highPercent}%]
            </p>
          )}
        </div>
      </div>

      {/* Visual Bar Gauge with Decision Boundaries */}
      <div className="space-y-2 mt-4 z-10 relative">
        <div className="relative w-full h-4.5 rounded-full bg-white/5 border border-white/10 overflow-hidden shadow-inner">
          {/* Background zones: [0-0.35 Likely Human] [0.35-0.65 Verification] [0.65-1.0 Synthetic] */}
          <div className="absolute inset-0 flex opacity-20 pointer-events-none">
            <div className="w-[35%] bg-[#34D399]" title="Human zone" />
            <div className="w-[30%] bg-[#FBBF24]" title="Verification zone" />
            <div className="w-[35%] bg-[#F87171]" title="Synthetic zone" />
          </div>

          {/* Uncertainty range band if available */}
          {uncertainty && lowPercent !== null && highPercent !== null && (
            <div
              className="absolute top-0 bottom-0 bg-white/20 border-x border-white/40 pointer-events-none transition-all duration-300"
              style={{
                left: `${lowPercent}%`,
                width: `${Math.max(2, highPercent - lowPercent)}%`,
              }}
            />
          )}

          {/* Point estimate bar that animates and fills once */}
          {scorePercent !== null && (
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: `${scorePercent}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 relative shadow-[0_0_15px_rgba(34,211,238,0.5)]"
            >
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-white shadow-sm" />
            </motion.div>
          )}
        </div>

        {/* Legend */}
        <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1">
          <span className="text-[#34D399]">0% Organic</span>
          <span className="text-[#FBBF24]">50% Ambiguous</span>
          <span className="text-[#F87171]">100% Synthetic</span>
        </div>
      </div>
    </div>
  );
};
