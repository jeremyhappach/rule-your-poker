import cubsLogo from "@/assets/cubs-logo.png";

interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-3 -right-3 z-30">
      <div className="relative">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 bg-blue-600 rounded-full blur-sm animate-pulse opacity-75" />
        
        {/* Main buck indicator with Cubs logo - same size as dealer button (w-7 h-7) */}
        <div className="relative bg-white rounded-full p-0.5 shadow-lg border-2 border-blue-800 flex items-center justify-center w-7 h-7">
          <img src={cubsLogo} alt="Buck" className="w-full h-full rounded-full object-cover" />
        </div>
      </div>
    </div>
  );
};
