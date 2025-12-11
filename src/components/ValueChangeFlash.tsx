import React, { useEffect, useState, useRef } from 'react';

interface FlashItem {
  id: string;
  amount: number;
}

interface ValueChangeFlashProps {
  value: number;
  prefix?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  className?: string;
  disabled?: boolean;
  // Manual trigger - pass a unique trigger ID + amount to show flash on demand
  manualTrigger?: { id: string; amount: number } | null;
}

/**
 * Reusable component that flashes a "+$X" indicator when a value increases.
 * Shows for 1 second, then drifts upward while fading over 1 second.
 */
export const ValueChangeFlash: React.FC<ValueChangeFlashProps> = ({
  value,
  prefix = '+$',
  position = 'top-right',
  className = '',
  disabled = false,
  manualTrigger,
}) => {
  const [flashes, setFlashes] = useState<FlashItem[]>([]);
  const prevValueRef = useRef<number>(value);
  const isInitialRef = useRef(true);
  const lastManualTriggerIdRef = useRef<string | null>(null);

  // Manual trigger mode
  useEffect(() => {
    if (manualTrigger && manualTrigger.id !== lastManualTriggerIdRef.current) {
      lastManualTriggerIdRef.current = manualTrigger.id;
      
      const newFlash: FlashItem = {
        id: `flash-${Date.now()}-${Math.random()}`,
        amount: manualTrigger.amount,
      };
      
      setFlashes(prev => [...prev, newFlash]);

      // Remove after 2 seconds
      setTimeout(() => {
        setFlashes(prev => prev.filter(f => f.id !== newFlash.id));
      }, 2000);
    }
  }, [manualTrigger]);

  // Auto-detect mode (when not using manual trigger)
  useEffect(() => {
    // Skip if using manual trigger
    if (manualTrigger !== undefined) {
      prevValueRef.current = value;
      return;
    }

    // Skip initial render
    if (isInitialRef.current) {
      isInitialRef.current = false;
      prevValueRef.current = value;
      return;
    }

    if (disabled) {
      prevValueRef.current = value;
      return;
    }

    const increase = value - prevValueRef.current;
    
    if (increase > 0) {
      const newFlash: FlashItem = {
        id: `flash-${Date.now()}-${Math.random()}`,
        amount: increase,
      };
      
      setFlashes(prev => [...prev, newFlash]);

      // Remove after 2 seconds (1s display + 1s fade)
      setTimeout(() => {
        setFlashes(prev => prev.filter(f => f.id !== newFlash.id));
      }, 2000);
    }

    prevValueRef.current = value;
  }, [value, disabled, manualTrigger]);

  const positionClasses: Record<string, string> = {
    'top-right': '-top-2 right-0',
    'top-left': '-top-2 left-1',
    'bottom-right': 'bottom-0 right-1',
    'bottom-left': 'bottom-0 left-1',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  if (flashes.length === 0) return null;

  return (
    <>
      {flashes.map(flash => (
        <div
          key={flash.id}
          className={`absolute ${positionClasses[position]} pointer-events-none z-50 ${className}`}
          style={{
            animation: 'valueFlashDrift 2s ease-out forwards',
          }}
        >
          <span
            className={`font-bold text-[11px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${flash.amount < 0 ? 'text-red-400' : 'text-poker-gold'}`}
          >
            {flash.amount < 0 ? `-$${Math.abs(flash.amount)}` : `${prefix}${flash.amount}`}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes valueFlashDrift {
          0% {
            opacity: 0;
            transform: translateY(0);
          }
          10% {
            opacity: 1;
            transform: translateY(-5px);
          }
          50% {
            opacity: 1;
            transform: translateY(-30px);
          }
          100% {
            opacity: 0;
            transform: translateY(-60px);
          }
        }
      `}</style>
    </>
  );
};

export default ValueChangeFlash;
