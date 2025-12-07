import { useEffect, useState } from "react";

interface BucksOnYouAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

export const BucksOnYouAnimation = ({ show, onComplete }: BucksOnYouAnimationProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      // Immediately hide if show becomes false
      setVisible(false);
    }
  }, [show, onComplete]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-[fadeOut_0.3s_ease-out_1.2s_forwards]">
      {/* Dark red flash overlay - quick flash */}
      <div className="absolute inset-0 bg-red-900/30 animate-[pulse_0.1s_ease-in-out_3]" />
      
      {/* Target/crosshair and text container */}
      <div className="flex flex-col items-center gap-2 animate-scale-in">
        {/* Target crosshair icon - smaller, faster spin */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 animate-[spin_0.3s_ease-out]">
          {/* Outer ring */}
          <div className="absolute inset-0 border-3 border-red-500 rounded-full" />
          {/* Inner ring */}
          <div className="absolute inset-3 border-2 border-red-400 rounded-full" />
          {/* Center dot */}
          <div className="absolute inset-1/2 w-3 h-3 -ml-1.5 -mt-1.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]" />
          {/* Crosshairs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-red-500" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-red-500" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-0.5 bg-red-500" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-0.5 bg-red-500" />
        </div>
        
        {/* BUCK'S ON YOU text */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-2 rounded-lg border-3 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]">
          <span className="text-red-400 font-black text-lg sm:text-xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            BUCK'S ON YOU
          </span>
        </div>
      </div>
    </div>
  );
};
