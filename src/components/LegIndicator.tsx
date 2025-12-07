interface LegIndicatorProps {
  legs: number;
  maxLegs?: number;
}

export const LegIndicator = ({ legs, maxLegs = 3 }: LegIndicatorProps) => {
  if (legs <= 0) return null;

  // Limit display to maxLegs
  const displayLegs = Math.min(legs, maxLegs);

  return (
    <div className="absolute -top-4 -right-4 z-30">
      <div className="relative flex">
        {Array.from({ length: displayLegs }).map((_, i) => (
          <div 
            key={i} 
            className="relative"
            style={{ 
              marginLeft: i > 0 ? '-5px' : '0',
              zIndex: displayLegs - i 
            }}
          >
            {/* Pulsing glow effect when close to winning */}
            {legs === maxLegs - 1 && (
              <div className="absolute inset-0 bg-amber-400 rounded-full blur-md animate-pulse opacity-75" />
            )}
            
            {/* Main leg indicator - smaller white circle with L */}
            <div className="relative bg-white rounded-full shadow-lg border border-slate-400 flex items-center justify-center w-5 h-5">
              <span className="text-slate-800 font-bold text-[9px]">L</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
