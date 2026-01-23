import { useEffect, useState, useRef } from "react";

interface LegEarnedAnimationProps {
  show: boolean;
  playerName: string;
  legValue?: number; // Dollar value of the leg
  targetPosition?: { top: string; left: string }; // Target coordinates for the leg indicator
  isWinningLeg?: boolean; // Is this the final leg that wins the game?
  suppressWinnerOverlay?: boolean; // Don't show "WINNER!" text (used for 3-5-7 games with separate win animation)
  onComplete?: () => void;
}

export const LegEarnedAnimation = ({ show, playerName, legValue = 0, targetPosition, isWinningLeg = false, suppressWinnerOverlay = false, onComplete }: LegEarnedAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  // Track the UNIQUE animation cycle - keyed by a timestamp set when animation starts
  const animationCycleIdRef = useRef<string | null>(null);
  // Track if the current cycle has completed (prevents restart on prop flicker)
  const cycleCompletedRef = useRef(false);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keep ref updated
  onCompleteRef.current = onComplete;

  // Default target if not provided
  const finalTarget = targetPosition || { top: '85%', left: '65%' };

  // Animation duration - lock at cycle start to prevent mid-flight changes
  const animationDurationRef = useRef<number | null>(null);

  // Format leg value for display
  const formattedValue = legValue > 0 ? `$${legValue}` : 'L';

  useEffect(() => {
    if (show) {
      // If we already completed this animation cycle, ignore further show=true signals
      if (cycleCompletedRef.current) {
        return;
      }
      
      // If animation is already running for this cycle, ignore
      if (animationCycleIdRef.current !== null) {
        return;
      }
      
      // Start a NEW animation cycle
      const cycleId = `cycle-${Date.now()}`;
      animationCycleIdRef.current = cycleId;
      cycleCompletedRef.current = false;
      
      // Lock duration at cycle start
      animationDurationRef.current = isWinningLeg ? 1800 : 1500;
      const animationDuration = animationDurationRef.current;
      
      setVisible(true);
      
      // Clear any existing timer to prevent double-fires
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
      }
      
      // Hide after fly-in completes
      activeTimerRef.current = setTimeout(() => {
        // Validate this is still the same animation cycle
        if (animationCycleIdRef.current !== cycleId) {
          return;
        }
        
        activeTimerRef.current = null;
        cycleCompletedRef.current = true; // Mark cycle as complete BEFORE any state changes
        setVisible(false);
        onCompleteRef.current?.();
      }, animationDuration);
      
      return () => {
        if (activeTimerRef.current) {
          clearTimeout(activeTimerRef.current);
          activeTimerRef.current = null;
        }
      };
    } else {
      // show=false: Only reset refs if the animation cycle completed naturally
      // This allows a new animation to start on next show=true
      if (cycleCompletedRef.current) {
        animationCycleIdRef.current = null;
        cycleCompletedRef.current = false;
        animationDurationRef.current = null;
      }
    }
  }, [show, isWinningLeg]);

  if (!visible) return null;

  return (
    <>

      {/* Flying L chip - positioned to land at player's leg indicator position */}
      <div 
        className={`absolute z-50 pointer-events-none ${isWinningLeg ? 'animate-[flyToTargetWinning_1.8s_ease-out_forwards]' : 'animate-[flyToTarget_1.5s_ease-out_forwards]'}`}
        style={{
          // Start position - will animate to target
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Glow effect during flight - more dramatic for winning leg */}
        <div className={`absolute inset-0 rounded-full blur-lg animate-pulse ${
          isWinningLeg 
            ? 'bg-yellow-400 opacity-90 scale-[2.5]' 
            : 'bg-amber-400 opacity-60 scale-150'
        }`} />
        
        {/* Extra glow rings for winning leg */}
        {isWinningLeg && (
          <>
            <div className="absolute inset-0 bg-orange-400 rounded-full blur-xl opacity-50 scale-[3] animate-ping" />
            <div className="absolute inset-0 bg-yellow-300 rounded-full blur-2xl opacity-40 scale-[4]" />
          </>
        )}
        
        {/* L chip - bigger for winning leg, shows value if available */}
        <div className={`relative rounded-full bg-white flex items-center justify-center ${
          isWinningLeg 
            ? 'w-14 h-14 border-4 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.9)]' 
            : 'w-10 h-10 border-3 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.8)]'
        }`}>
          <span className={`text-slate-800 font-black ${isWinningLeg ? (legValue > 0 ? 'text-lg' : 'text-2xl') : (legValue > 0 ? 'text-xs' : 'text-xl')}`}>
            {formattedValue}
          </span>
        </div>
        
        {/* Sparkles during flight - more for winning leg */}
        <div className="absolute -top-1 -right-1 text-sm animate-ping">✨</div>
        {isWinningLeg && !suppressWinnerOverlay && (
          <>
            <div className="absolute -top-2 -left-1 text-lg animate-ping" style={{ animationDelay: '0.1s' }}>⭐</div>
            <div className="absolute top-0 left-0 text-sm animate-ping" style={{ animationDelay: '0.3s' }}>✨</div>
          </>
        )}
      </div>
      
      {/* Winner text overlay for winning leg (suppress for 3-5-7 which has its own win animation) */}
      {isWinningLeg && !suppressWinnerOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none animate-[fadeInScale_0.5s_ease-out_0.5s_forwards] opacity-0">
          <div className="bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-500 text-white font-black text-2xl px-6 py-3 rounded-xl shadow-2xl animate-pulse">
            🏆 WINNER! 🏆
          </div>
        </div>
      )}
      
      {/* Custom keyframes - fly from center to target position */}
      <style>{`
        @keyframes flyToTarget {
          0% {
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%) scale(2) rotate(-20deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            top: ${finalTarget.top};
            left: ${finalTarget.left};
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        
        @keyframes flyToTargetWinning {
          0% {
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%) scale(3) rotate(-30deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(3.5) rotate(-15deg);
          }
          30% {
            transform: translate(-50%, -50%) scale(3) rotate(15deg);
          }
          50% {
            top: 35%;
            transform: translate(-50%, -50%) scale(2.5) rotate(-10deg);
          }
          70% {
            transform: translate(-50%, -50%) scale(2) rotate(5deg);
          }
          100% {
            top: ${finalTarget.top};
            left: ${finalTarget.left};
            transform: translate(-50%, -50%) scale(1.2) rotate(0deg);
            opacity: 1;
          }
        }
        
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes announceSlideIn {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </>
  );
};
