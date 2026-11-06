import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface RippleItem {
  id: number;
  x: number;
  y: number;
}

export const CustomPointerOverlay: React.FC = () => {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [isPointerVisible, setIsPointerVisible] = useState(false);
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const handlePointerMove = (e: PointerEvent) => {
      // Use clientX and clientY directly without pageX/pageY or scroll offsets
      setPointer({ x: e.clientX, y: e.clientY });
      setIsPointerVisible(true);
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Center ripple exactly at event.clientX and event.clientY
      const newRipple: RippleItem = {
        id: Date.now() + Math.random(),
        x: e.clientX,
        y: e.clientY,
      };

      setRipples((prev) => [...prev.slice(-8), newRipple]);

      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 620);
    };

    const handlePointerLeave = () => {
      setIsPointerVisible(false);
    };

    const handlePointerEnter = () => {
      setIsPointerVisible(true);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    document.documentElement.addEventListener('pointerenter', handlePointerEnter);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      document.documentElement.removeEventListener('pointerenter', handlePointerEnter);
    };
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {/* 1) Custom Circle Cursor Ring (Follows clientX / clientY, hidden on touch) */}
      {pointer && (
        <div
          className="custom-cursor-wrapper"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 999999,
            transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`,
            opacity: isPointerVisible ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
          aria-hidden="true"
        >
          <div className="custom-cursor-ring" />
        </div>
      )}

      {/* 2) Tap / Click Ripples (Centered exactly at event.clientX and event.clientY) */}
      {ripples.map((rip) => (
        <div
          key={rip.id}
          className="click-ripple-wrapper"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 999998,
            transform: `translate3d(${rip.x}px, ${rip.y}px, 0) translate(-50%, -50%)`,
          }}
          aria-hidden="true"
        >
          <div className="click-ripple-circle" />
        </div>
      ))}
    </>,
    document.body
  );
};
