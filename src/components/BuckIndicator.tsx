import cubsLogo from "@/assets/cubs-logo.png";

interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-4 -right-4 z-30">
      <div className="relative">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 bg-blue-600 rounded-full blur-md animate-pulse opacity-75" />
        
        {/* Main buck indicator with Cubs logo */}
        <div className="relative bg-white rounded-full p-0.5 shadow-2xl border-2 border-blue-800 animate-bounce flex items-center justify-center w-11 h-11">
          <img src={cubsLogo} alt="Cubs Logo" className="w-full h-full rounded-full" />
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
