import { DollarSign } from "lucide-react";

interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-4 -right-4 z-30">
      <div className="relative">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 bg-green-500 rounded-full blur-md animate-pulse opacity-75" />
        
        {/* Main buck indicator */}
        <div className="relative bg-gradient-to-br from-green-500 to-green-700 text-white rounded-full p-2.5 shadow-2xl border-3 border-green-300 animate-bounce">
          <DollarSign className="w-5 h-5 stroke-[3]" />
        </div>
        
        {/* Label */}
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] font-bold text-green-400 bg-black/70 px-2 py-0.5 rounded-full border border-green-500/50">
            BUCK
          </span>
        </div>
      </div>
    </div>
  );
};
