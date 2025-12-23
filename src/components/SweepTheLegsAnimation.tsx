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
      {/* Dramatic background flash */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-900/40 via-black/50 to-red-900/40 animate-pulse" />
      
      {/* Karate Kid themed decorative elements */}
      <div className="absolute inset-0">
        {/* Bonsai-inspired decorative lines */}
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Japanese-style brush strokes */}
          <path d="M 10,80 Q 30,70 50,75 T 90,70" stroke="white" strokeWidth="0.3" fill="none" opacity="0.6" />
          <path d="M 10,20 Q 30,30 50,25 T 90,30" stroke="white" strokeWidth="0.3" fill="none" opacity="0.6" />
          {/* Circular zen pattern */}
          <circle cx="50" cy="50" r="35" fill="none" stroke="white" strokeWidth="0.2" opacity="0.3" strokeDasharray="2,2" />
        </svg>
      </div>
      
      {/* Main text container */}
      <div className="flex flex-col items-center gap-3 animate-scale-in z-10">
        {/* Rising sun / crane silhouette effect */}
        <div className="absolute -top-8 text-4xl opacity-80 animate-bounce" style={{ animationDuration: '1s' }}>
          🥋
        </div>
        
        {/* Main message */}
        <div className="bg-gradient-to-r from-red-900/90 via-red-800/95 to-red-900/90 px-6 py-4 rounded-lg border-2 border-yellow-500/70 shadow-[0_0_40px_rgba(220,38,38,0.5),_inset_0_0_20px_rgba(0,0,0,0.3)]">
          <div className="text-center">
            <span className="text-yellow-400 font-black text-xl sm:text-2xl md:text-3xl tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase">
              "Sweep the Leg"
            </span>
          </div>
        </div>
        
        {/* Mr. Miyagi quote */}
        <div className="bg-black/60 px-4 py-2 rounded border border-white/20">
          <span className="text-white/90 font-medium text-sm sm:text-base italic">
            — Cobra Kai, 1984
          </span>
        </div>
        
        {/* Leg sweep motion lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-1/4 left-1/4 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-sweep-line" />
          <div className="absolute bottom-1/4 left-1/4 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-400 to-transparent animate-sweep-line-delayed" />
        </div>
      </div>
      
      {/* Sparkle effects */}
      <div className="absolute inset-0">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-400 animate-ping"
            style={{
              left: `${15 + Math.random() * 70}%`,
              top: `${15 + Math.random() * 70}%`,
              animationDelay: `${Math.random() * 1}s`,
              animationDuration: `${0.8 + Math.random() * 0.4}s`,
              fontSize: '8px'
            }}
          >
            ✦
          </div>
        ))}
      </div>

      {/* Custom keyframes */}
      <style>{`
        @keyframes sweep-line {
          0% {
            transform: translateX(-100%) scaleX(0);
            opacity: 0;
          }
          50% {
            transform: translateX(0) scaleX(1);
            opacity: 1;
          }
          100% {
            transform: translateX(100%) scaleX(0);
            opacity: 0;
          }
        }
        
        @keyframes sweep-line-delayed {
          0%, 20% {
            transform: translateX(-100%) scaleX(0);
            opacity: 0;
          }
          60% {
            transform: translateX(0) scaleX(1);
            opacity: 1;
          }
          100% {
            transform: translateX(100%) scaleX(0);
            opacity: 0;
          }
        }
        
        .animate-sweep-line {
          animation: sweep-line 1.5s ease-out forwards;
        }
        
        .animate-sweep-line-delayed {
          animation: sweep-line-delayed 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
