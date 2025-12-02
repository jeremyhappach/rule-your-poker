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
        <div className="relative bg-white rounded-full p-0.5 shadow-2xl border-3 border-red-600 animate-bounce flex items-center justify-center w-10 h-10">
          {/* Classic Cubs logo - red circle with blue C */}
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Red circle background */}
            <circle cx="50" cy="50" r="49" fill="#CC0033"/>
            
            {/* Blue C letter - authentic Cubs style */}
            <g transform="translate(50, 50)">
              <path d="M 15,-30 Q 25,-30 25,-20 Q 25,-10 15,-10 L 5,-10 L 5,10 L 15,10 Q 25,10 25,20 Q 25,30 15,30 L -15,30 Q -25,30 -25,20 L -25,-20 Q -25,-30 -15,-30 Z M -15,-20 L -15,20 L -5,20 L -5,-20 Z" 
                    fill="#0E3386" 
                    stroke="#0E3386" 
                    stroke-width="2"/>
            </g>
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
