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
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
      {/* Flash overlay */}
      <div className="absolute inset-0 bg-yellow-400/30 animate-[pulse_0.1s_ease-in-out_3]" />
      
      {/* Lightning bolt and text container */}
      <div className="flex flex-col items-center gap-2 animate-scale-in">
        {/* Lightning bolt */}
        <div className="text-7xl sm:text-8xl md:text-9xl animate-[pulse_0.15s_ease-in-out_infinite] drop-shadow-[0_0_30px_rgba(250,204,21,1)]">
          ⚡
        </div>
        
        {/* YOU GOT CHOPPED text */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 px-6 py-3 rounded-lg border-4 border-yellow-400 shadow-[0_0_40px_rgba(239,68,68,0.8)]">
          <span className="text-white font-black text-2xl sm:text-3xl md:text-4xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-[pulse_0.2s_ease-in-out_infinite]">
            YOU GOT CHOPPED
          </span>
        </div>
      </div>
    </div>
  );
};
