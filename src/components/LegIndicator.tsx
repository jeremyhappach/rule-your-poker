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
              marginLeft: i > 0 ? '-8px' : '0',
              zIndex: displayLegs - i 
            }}
          >
            {/* Pulsing glow effect when close to winning */}
            {legs === maxLegs - 1 && (
              <div className="absolute inset-0 bg-amber-400 rounded-full blur-md animate-pulse opacity-75" />
            )}
            
            {/* Main leg indicator - white circle with L */}
            <div className="relative bg-white rounded-full shadow-2xl border-2 border-slate-400 flex items-center justify-center w-9 h-9">
              <span className="text-slate-800 font-bold text-sm">L</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
