interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-4 -right-4 z-30">
      <div className="relative">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 bg-blue-500 rounded-full blur-md animate-pulse opacity-75" />
        
        {/* Main buck indicator */}
        <div className="relative bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-full p-2 shadow-2xl border-3 border-blue-300 animate-bounce flex items-center justify-center">
          {/* Cubs C Logo */}
          <svg className="w-6 h-6" viewBox="0 0 100 100" fill="currentColor">
            <text x="50" y="72" fontSize="80" fontFamily="serif" fontWeight="bold" textAnchor="middle">C</text>
          </svg>
        </div>
        
        {/* Label */}
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] font-bold text-blue-400 bg-black/70 px-2 py-0.5 rounded-full border border-blue-500/50">
            BUCK
          </span>
        </div>
      </div>
    </div>
  );
};
