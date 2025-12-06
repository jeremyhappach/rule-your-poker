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
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const progress = useMemo(() => {
    if (!isActive || timeLeft === null || maxTime <= 0) return 0;
    return Math.max(0, Math.min(1, timeLeft / maxTime));
  }, [timeLeft, maxTime, isActive]);
  
  const strokeDashoffset = circumference * (1 - progress);
  
  // Color based on time remaining
  const getStrokeColor = () => {
    if (!isActive || timeLeft === null) return 'hsl(var(--muted))';
    if (progress > 0.5) return 'hsl(142, 76%, 36%)'; // Green
    if (progress > 0.25) return 'hsl(45, 93%, 47%)'; // Yellow/Gold
    return 'hsl(0, 84%, 60%)'; // Red
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* SVG Timer Ring */}
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
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
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
            style={{
              filter: timeLeft !== null && timeLeft <= 3 ? 'drop-shadow(0 0 4px hsl(0, 84%, 60%))' : undefined
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
