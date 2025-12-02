interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-4 -right-4 z-30">
      <div className="relative">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 bg-red-500 rounded-full blur-md animate-pulse opacity-75" />
        
        {/* Main buck indicator with Cubs logo */}
        <div className="relative bg-gradient-to-br from-red-600 to-red-800 rounded-full p-1.5 shadow-2xl border-3 border-red-400 animate-bounce flex items-center justify-center w-10 h-10">
          {/* Classic Cubs red circle with blue C */}
          <svg className="w-8 h-8" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="#CC0000"/>
            <text x="50" y="75" fontSize="70" fontFamily="Arial Black, sans-serif" fontWeight="900" fill="#003893" textAnchor="middle">C</text>
          </svg>
        </div>
        
        {/* Label */}
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] font-bold text-red-400 bg-black/70 px-2 py-0.5 rounded-full border border-red-500/50">
            BUCK
          </span>
        </div>
      </div>
    </div>
  );
};
