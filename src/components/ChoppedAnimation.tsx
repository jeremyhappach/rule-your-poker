import { useEffect, useState, useRef } from "react";

interface ChoppedAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

export const ChoppedAnimation = ({ show, onComplete }: ChoppedAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const hasShownRef = useRef(false);
  
  // Keep ref updated
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (show && !hasShownRef.current) {
      hasShownRef.current = true;
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onCompleteRef.current?.();
      }, 1000);
      return () => clearTimeout(timer);
    } else if (!show) {
      // Reset when show becomes false
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none overflow-hidden">
      {/* Cracked glass overlay */}
      <div className="absolute inset-0 bg-black/20" />
      
      {/* Crack lines radiating from center */}
      <svg className="absolute inset-0 w-full h-full animate-scale-in" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Main crack lines */}
        <line x1="50" y1="50" x2="0" y2="0" stroke="white" strokeWidth="0.3" opacity="0.9" />
        <line x1="50" y1="50" x2="100" y2="0" stroke="white" strokeWidth="0.3" opacity="0.9" />
        <line x1="50" y1="50" x2="0" y2="100" stroke="white" strokeWidth="0.3" opacity="0.9" />
        <line x1="50" y1="50" x2="100" y2="100" stroke="white" strokeWidth="0.3" opacity="0.9" />
        <line x1="50" y1="50" x2="50" y2="0" stroke="white" strokeWidth="0.4" opacity="0.95" />
        <line x1="50" y1="50" x2="50" y2="100" stroke="white" strokeWidth="0.4" opacity="0.95" />
        <line x1="50" y1="50" x2="0" y2="50" stroke="white" strokeWidth="0.4" opacity="0.95" />
        <line x1="50" y1="50" x2="100" y2="50" stroke="white" strokeWidth="0.4" opacity="0.95" />
        
        {/* Secondary cracks */}
        <line x1="50" y1="50" x2="20" y2="10" stroke="white" strokeWidth="0.2" opacity="0.7" />
        <line x1="50" y1="50" x2="80" y2="15" stroke="white" strokeWidth="0.2" opacity="0.7" />
        <line x1="50" y1="50" x2="15" y2="70" stroke="white" strokeWidth="0.2" opacity="0.7" />
        <line x1="50" y1="50" x2="85" y2="75" stroke="white" strokeWidth="0.2" opacity="0.7" />
        <line x1="50" y1="50" x2="30" y2="90" stroke="white" strokeWidth="0.2" opacity="0.7" />
        <line x1="50" y1="50" x2="70" y2="5" stroke="white" strokeWidth="0.2" opacity="0.7" />
        
        {/* Tertiary small cracks */}
        <line x1="25" y1="25" x2="15" y2="30" stroke="white" strokeWidth="0.15" opacity="0.5" />
        <line x1="75" y1="25" x2="85" y2="20" stroke="white" strokeWidth="0.15" opacity="0.5" />
        <line x1="25" y1="75" x2="20" y2="85" stroke="white" strokeWidth="0.15" opacity="0.5" />
        <line x1="75" y1="75" x2="90" y2="80" stroke="white" strokeWidth="0.15" opacity="0.5" />
        <line x1="50" y1="25" x2="45" y2="15" stroke="white" strokeWidth="0.15" opacity="0.5" />
        <line x1="50" y1="75" x2="55" y2="90" stroke="white" strokeWidth="0.15" opacity="0.5" />
        
        {/* Impact point circle */}
        <circle cx="50" cy="50" r="3" fill="none" stroke="white" strokeWidth="0.5" opacity="0.8" />
        <circle cx="50" cy="50" r="1.5" fill="white" opacity="0.6" />
      </svg>
      
      {/* Glass shatter effect overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent animate-pulse" />
      
      {/* YOU GOT CRACKED text */}
      <div className="flex flex-col items-center gap-2 animate-scale-in z-10">
        <div className="bg-black/80 px-6 py-3 rounded-lg border-2 border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
          <span className="text-white font-black text-2xl sm:text-3xl md:text-4xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            YOU GOT CRACKED
          </span>
        </div>
      </div>
    </div>
  );
};
