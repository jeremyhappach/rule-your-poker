import { useDeviceSize } from "@/hooks/useDeviceSize";

interface LegIndicatorProps {
  legs: number;
  maxLegs?: number;
}

export const LegIndicator = ({ legs, maxLegs = 3 }: LegIndicatorProps) => {
  const { isTablet, isDesktop } = useDeviceSize();
  
  if (legs <= 0) return null;

  // Limit display to maxLegs
  const displayLegs = Math.min(legs, maxLegs);
  const isLargeScreen = isTablet || isDesktop;

  return (
    <div className={`absolute z-30 ${isLargeScreen ? '-top-3 -left-5' : '-top-2 -left-4'}`}>
      <div className="relative flex">
        {Array.from({ length: displayLegs }).map((_, i) => (
          <div 
            key={i} 
            className="relative"
            style={{ 
              marginLeft: i > 0 ? (isLargeScreen ? '-6px' : '-5px') : '0',
              zIndex: displayLegs - i 
            }}
          >
            {/* Pulsing glow effect when close to winning */}
            {legs === maxLegs - 1 && (
              <div className="absolute inset-0 bg-amber-400 rounded-full blur-md animate-pulse opacity-75" />
            )}
            
            {/* Main leg indicator - gold outlined circle with L */}
            <div className={`relative bg-white rounded-full shadow-lg border-2 border-amber-500 flex items-center justify-center ${
              isLargeScreen ? 'w-8 h-8' : 'w-6 h-6'
            }`}>
              <span className={`text-slate-800 font-bold ${isLargeScreen ? 'text-xs' : 'text-[10px]'}`}>L</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
