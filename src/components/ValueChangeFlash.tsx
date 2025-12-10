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
}

/**
 * Reusable component that flashes a "+$X" indicator when a value increases.
 * Shows for 1 second, then fades over 1 second.
 */
export const ValueChangeFlash: React.FC<ValueChangeFlashProps> = ({
  value,
  prefix = '+$',
  position = 'top-right',
  className = '',
  disabled = false,
}) => {
  const [flashes, setFlashes] = useState<FlashItem[]>([]);
  const prevValueRef = useRef<number>(value);
  const isInitialRef = useRef(true);

  useEffect(() => {
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
  }, [value, disabled]);

  const positionClasses: Record<string, string> = {
    'top-right': 'top-0 right-1',
    'top-left': 'top-0 left-1',
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
        >
          <span
            className="text-poker-gold font-bold text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            style={{
              animation: 'valueChangeFlash 2s ease-out forwards',
            }}
          >
            {prefix}{flash.amount}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes valueChangeFlash {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-2px);
          }
          100% {
            opacity: 0;
            transform: translateY(-6px);
          }
        }
      `}</style>
    </>
  );
};

export default ValueChangeFlash;
