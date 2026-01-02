import { useEffect, useState, useRef } from "react";
import noQualifyBg from "@/assets/no-qualify-bg.jpg";

interface NoQualifyAnimationProps {
  show: boolean;
  playerName?: string;
  onComplete?: () => void;
}

export const NoQualifyAnimation = ({ show, playerName, onComplete }: NoQualifyAnimationProps) => {
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
      }, 2000);
      return () => clearTimeout(timer);
    } else if (!show) {
      // Reset when show becomes false
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center animate-scale-in"
        style={{ 
          backgroundImage: `url(${noQualifyBg})`,
          filter: 'brightness(0.6) saturate(1.2)'
        }}
      />
      
      {/* Red overlay */}
      <div className="absolute inset-0 bg-red-900/40" />
      
      {/* Vignette effect */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/70" />
      
      {/* NO QUALIFY text */}
      <div className="flex flex-col items-center gap-2 animate-scale-in z-10">
        {playerName && (
          <div className="text-white/90 text-lg sm:text-xl font-bold mb-2 bg-black/60 px-4 py-1 rounded">
            {playerName}
          </div>
        )}
        <div className="bg-black/80 px-6 py-4 rounded-lg border-2 border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.5)]">
          <span className="text-red-500 font-black text-3xl sm:text-4xl md:text-5xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase">
            NO QUALIFY
          </span>
        </div>
        <div className="text-white/80 text-sm sm:text-base font-medium mt-2 bg-black/60 px-4 py-1 rounded">
          船長がいない! (No Captain!)
        </div>
      </div>
      
      {/* Shake animation for dramatic effect */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};
