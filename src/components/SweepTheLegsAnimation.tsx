import { useEffect, useState, useRef } from "react";

interface SweepTheLegsAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

export const SweepTheLegsAnimation = ({ show, onComplete }: SweepTheLegsAnimationProps) => {
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
      }, 2000); // 2 seconds display
      return () => clearTimeout(timer);
    } else if (!show) {
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden">
      {/* Dramatic dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950/80 via-black/90 to-red-950/80" />
      
      {/* Japanese dojo floor lines */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-amber-900/40 to-transparent" />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Dojo mat lines */}
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(234,179,8,0.3)" strokeWidth="0.3" />
          <line x1="0" y1="85" x2="100" y2="85" stroke="rgba(234,179,8,0.2)" strokeWidth="0.2" />
          <line x1="20" y1="60" x2="20" y2="100" stroke="rgba(234,179,8,0.15)" strokeWidth="0.2" />
          <line x1="80" y1="60" x2="80" y2="100" stroke="rgba(234,179,8,0.15)" strokeWidth="0.2" />
        </svg>
      </div>
      
      {/* Karate kick silhouette - the hero visual */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg 
          viewBox="0 0 200 200" 
          className="w-48 h-48 sm:w-64 sm:h-64 animate-[kickSlide_1.5s_ease-out_forwards]"
          style={{ filter: 'drop-shadow(0 0 20px rgba(234,179,8,0.6))' }}
        >
          {/* Karate figure doing a leg sweep - stylized silhouette */}
          <defs>
            <linearGradient id="karateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          
          {/* Dynamic karate figure in sweep pose */}
          <g fill="url(#karateGrad)" className="animate-[figureGlow_0.5s_ease-in-out_infinite_alternate]">
            {/* Head */}
            <circle cx="85" cy="55" r="12" />
            {/* Body - leaning back for sweep */}
            <ellipse cx="80" cy="85" rx="15" ry="25" transform="rotate(-20 80 85)" />
            {/* Back arm (balance) */}
            <rect x="45" y="65" width="35" height="8" rx="4" transform="rotate(-45 62 69)" />
            {/* Front arm (guard) */}
            <rect x="90" y="70" width="25" height="7" rx="3" transform="rotate(30 102 73)" />
            {/* Standing leg (bent) */}
            <rect x="65" y="105" width="10" height="35" rx="5" transform="rotate(15 70 122)" />
            {/* Sweeping leg - extended horizontal */}
            <rect x="75" y="125" width="55" height="12" rx="6" transform="rotate(-5 102 131)" />
            {/* Foot on sweeping leg */}
            <ellipse cx="135" cy="127" rx="12" ry="6" transform="rotate(-5 135 127)" />
          </g>
          
          {/* Motion blur lines behind sweep leg */}
          <g stroke="#fbbf24" strokeWidth="2" opacity="0.6" className="animate-[sweepMotion_0.3s_ease-out_infinite]">
            <line x1="60" y1="130" x2="100" y2="128" strokeDasharray="5,5" />
            <line x1="55" y1="135" x2="95" y2="133" strokeDasharray="3,7" />
            <line x1="50" y1="140" x2="90" y2="138" strokeDasharray="2,8" />
          </g>
          
          {/* Impact burst at sweep point */}
          <g className="animate-[impactBurst_0.4s_ease-out_0.3s_forwards]" opacity="0">
            <circle cx="140" cy="130" r="8" fill="#fef08a" />
            <circle cx="140" cy="130" r="15" fill="none" stroke="#fbbf24" strokeWidth="3" />
            <circle cx="140" cy="130" r="25" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.5" />
          </g>
        </svg>
      </div>
      
      {/* Main text container */}
      <div className="flex flex-col items-center gap-3 z-10 mt-32 sm:mt-40">
        {/* Main message with dojo banner style */}
        <div className="relative">
          {/* Banner ribbons */}
          <div className="absolute -left-4 top-1/2 w-4 h-12 bg-gradient-to-b from-red-800 to-red-900 -translate-y-1/2 transform -skew-y-12" />
          <div className="absolute -right-4 top-1/2 w-4 h-12 bg-gradient-to-b from-red-800 to-red-900 -translate-y-1/2 transform skew-y-12" />
          
          <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-900 px-8 py-4 border-y-4 border-yellow-500 shadow-[0_0_50px_rgba(220,38,38,0.5),_inset_0_0_30px_rgba(0,0,0,0.5)]">
            <div className="text-center">
              <span className="text-yellow-400 font-black text-2xl sm:text-3xl md:text-4xl tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] uppercase animate-[textGlow_0.5s_ease-in-out_infinite_alternate]">
                "Sweep the Leg"
              </span>
            </div>
          </div>
        </div>
        
        {/* Cobra Kai quote */}
        <div className="bg-black/80 px-4 py-2 rounded border border-yellow-500/40 animate-[fadeSlideUp_0.5s_ease-out_0.3s_forwards] opacity-0">
          <span className="text-yellow-400/90 font-bold text-xs sm:text-sm tracking-wider uppercase">
            🐍 Cobra Kai — No Mercy 🥋
          </span>
        </div>
      </div>
      
      {/* Dramatic action lines radiating from center */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[150%] w-0.5 bg-gradient-to-t from-transparent via-yellow-500/20 to-transparent origin-center"
            style={{
              transform: `translate(-50%, -50%) rotate(${i * 30}deg)`,
              animation: `actionLinePulse 0.8s ease-out ${i * 0.05}s infinite`,
            }}
          />
        ))}
      </div>
      
      {/* Impact sparks */}
      <div className="absolute inset-0">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-400"
            style={{
              left: `${40 + Math.random() * 30}%`,
              top: `${30 + Math.random() * 40}%`,
              fontSize: `${10 + Math.random() * 8}px`,
              animation: `sparkBurst 0.6s ease-out ${0.2 + Math.random() * 0.4}s forwards`,
              opacity: 0,
            }}
          >
            ✦
          </div>
        ))}
      </div>

      {/* Custom keyframes */}
      <style>{`
        @keyframes kickSlide {
          0% {
            transform: translateX(-100%) scale(0.5);
            opacity: 0;
          }
          30% {
            transform: translateX(0%) scale(1.1);
            opacity: 1;
          }
          50% {
            transform: translateX(5%) scale(1);
          }
          100% {
            transform: translateX(0%) scale(1);
            opacity: 1;
          }
        }
        
        @keyframes figureGlow {
          0% {
            filter: brightness(1);
          }
          100% {
            filter: brightness(1.3);
          }
        }
        
        @keyframes sweepMotion {
          0%, 100% {
            opacity: 0.4;
            transform: translateX(0);
          }
          50% {
            opacity: 0.8;
            transform: translateX(-5px);
          }
        }
        
        @keyframes impactBurst {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0.8;
            transform: scale(1);
          }
        }
        
        @keyframes textGlow {
          0% {
            text-shadow: 0 0 10px rgba(234,179,8,0.5), 0 2px 4px rgba(0,0,0,0.9);
          }
          100% {
            text-shadow: 0 0 20px rgba(234,179,8,0.8), 0 0 40px rgba(234,179,8,0.4), 0 2px 4px rgba(0,0,0,0.9);
          }
        }
        
        @keyframes fadeSlideUp {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes actionLinePulse {
          0%, 100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--rotation)) scaleY(0.5);
          }
          50% {
            opacity: 0.3;
            transform: translate(-50%, -50%) rotate(var(--rotation)) scaleY(1);
          }
        }
        
        @keyframes sparkBurst {
          0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.5) rotate(180deg);
          }
          100% {
            opacity: 0;
            transform: scale(0.5) rotate(360deg) translateY(-20px);
          }
        }
      `}</style>
    </div>
  );
};
