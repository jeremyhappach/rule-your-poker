import { useMemo } from "react";

interface MobilePlayerTimerProps {
  timeLeft: number | null;
  maxTime: number;
  isActive: boolean;
  size?: number;
  children: React.ReactNode;
}

export const MobilePlayerTimer = ({ 
  timeLeft, 
  maxTime, 
  isActive, 
  size = 48,
  children 
}: MobilePlayerTimerProps) => {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const progress = useMemo(() => {
    if (!isActive || timeLeft === null || maxTime <= 0) return 0;
    return Math.max(0, Math.min(1, timeLeft / maxTime));
  }, [timeLeft, maxTime, isActive]);
  
  const strokeDashoffset = circumference * (1 - progress);
  
  // Determine urgency levels
  const isUrgent = isActive && timeLeft !== null && timeLeft <= 3;
  const isWarning = isActive && timeLeft !== null && timeLeft <= 5 && timeLeft > 3;
  const isNormal = isActive && timeLeft !== null && timeLeft > 5;
  
  // Color based on time remaining
  const getStrokeColor = () => {
    if (!isActive || timeLeft === null) return 'hsl(var(--muted))';
    if (progress > 0.5) return 'hsl(142, 76%, 36%)'; // Green
    if (progress > 0.25) return 'hsl(45, 93%, 47%)'; // Yellow/Gold
    return 'hsl(0, 84%, 60%)'; // Red
  };
  
  // Get glow color for the outer ring
  const getGlowStyle = () => {
    if (isUrgent) {
      return {
        borderColor: 'hsl(0, 84%, 60%)',
        boxShadow: '0 0 16px hsl(0, 84%, 60%), 0 0 32px hsl(0, 84%, 50% / 0.5), inset 0 0 8px hsl(0, 84%, 60% / 0.3)'
      };
    }
    if (isWarning) {
      return {
        borderColor: 'hsl(45, 93%, 47%)',
        boxShadow: '0 0 12px hsl(45, 93%, 47%), 0 0 24px hsl(45, 93%, 47% / 0.4)'
      };
    }
    if (isNormal) {
      return {
        borderColor: 'hsl(142, 76%, 36%)',
        boxShadow: '0 0 10px hsl(142, 76%, 36%), 0 0 20px hsl(142, 76%, 36% / 0.4)'
      };
    }
    return {};
  };

  return (
    <div 
      className="relative inline-flex items-center justify-center" 
      style={{ width: size + 8, height: size + 8 }}
    >
      {/* Flashing glow ring when active */}
      {isActive && timeLeft !== null && (
        <div 
          className={`absolute inset-0 rounded-full border-3 ${isUrgent ? 'animate-pulse' : isWarning ? 'animate-pulse' : ''}`}
          style={{ 
            ...getGlowStyle(),
            borderWidth: isUrgent ? '4px' : '3px',
            animation: isNormal ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined
          }}
        />
      )}
      
      {/* SVG Timer Ring */}
      <svg
        className="absolute -rotate-90"
        width={size}
        height={size}
        style={{ top: 4, left: 4 }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted) / 0.3)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        {isActive && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getStrokeColor()}
            strokeWidth={strokeWidth + (isUrgent ? 2 : 0)}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
            style={{
              filter: isUrgent 
                ? 'drop-shadow(0 0 8px hsl(0, 84%, 60%))' 
                : isWarning 
                  ? 'drop-shadow(0 0 6px hsl(45, 93%, 47%))' 
                  : isNormal 
                    ? 'drop-shadow(0 0 4px hsl(142, 76%, 36%))' 
                    : undefined
            }}
          />
        )}
      </svg>
      
      {/* Content inside the ring */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
