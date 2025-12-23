import { useEffect, useState, useRef } from "react";
import sweepTheLegImage from "@/assets/sweep-the-leg.png";

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
      }, 4000); // 4 seconds display
      return () => clearTimeout(timer);
    } else if (!show) {
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none overflow-hidden">
      {/* Dark dramatic overlay */}
      <div className="absolute inset-0 bg-black/80" />
      
      {/* Karate leg sweep image - the hero visual */}
      <div className="relative z-10 animate-[imageSlideIn_0.6s_ease-out_forwards] flex-1 flex items-center justify-center w-full">
        <img 
          src={sweepTheLegImage} 
          alt="Karate leg sweep" 
          className="max-w-[80%] max-h-[60%] object-contain drop-shadow-[0_0_30px_rgba(220,38,38,0.8)]"
        />
        
        {/* Impact flash overlay on the image */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-32 h-32 bg-yellow-500/30 rounded-full blur-3xl animate-ping" style={{ animationDuration: '1s' }} />
        </div>
      </div>
      
      {/* Text at the bottom - not blocking the image */}
      <div className="relative z-10 pb-8 animate-[textSlideUp_0.5s_ease-out_0.3s_forwards] opacity-0">
        {/* Main banner */}
        <div className="relative">
          {/* Banner ribbons */}
          <div className="absolute -left-3 top-1/2 w-3 h-10 bg-gradient-to-b from-red-800 to-red-900 -translate-y-1/2 transform -skew-y-12" />
          <div className="absolute -right-3 top-1/2 w-3 h-10 bg-gradient-to-b from-red-800 to-red-900 -translate-y-1/2 transform skew-y-12" />
          
          <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-900 px-6 py-3 border-y-4 border-yellow-500 shadow-[0_0_40px_rgba(220,38,38,0.6)]">
            <span className="text-yellow-400 font-black text-xl sm:text-2xl md:text-3xl tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] uppercase animate-[textGlow_0.5s_ease-in-out_infinite_alternate]">
              "Sweep the Legs"
            </span>
          </div>
        </div>
        
        {/* Cobra Kai subtitle */}
        <div className="mt-2 text-center">
          <span className="text-yellow-400/90 font-bold text-xs sm:text-sm tracking-wider uppercase bg-black/60 px-3 py-1 rounded">
            🐍 Cobra Kai — No Mercy 🥋
          </span>
        </div>
      </div>
      
      {/* Action lines radiating from center */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[120%] w-0.5 bg-gradient-to-t from-transparent via-red-500/20 to-transparent origin-center"
            style={{
              transform: `translate(-50%, -50%) rotate(${i * 22.5}deg)`,
              animation: `actionLinePulse 0.8s ease-out ${i * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
      
      {/* Sparks */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-400"
            style={{
              left: `${30 + Math.random() * 40}%`,
              top: `${20 + Math.random() * 40}%`,
              fontSize: `${8 + Math.random() * 6}px`,
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
        @keyframes imageSlideIn {
          0% {
            transform: scale(1.3) translateX(-20%);
            opacity: 0;
          }
          60% {
            transform: scale(1.05) translateX(2%);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes textSlideUp {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
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
        
        @keyframes actionLinePulse {
          0%, 100% {
            opacity: 0;
          }
          50% {
            opacity: 0.4;
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
