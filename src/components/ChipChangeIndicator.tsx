import { useEffect, useState } from "react";

interface ChipChangeIndicatorProps {
  currentChips: number;
  playerId: string;
}

export const ChipChangeIndicator = ({ currentChips, playerId }: ChipChangeIndicatorProps) => {
  const [chipChange, setChipChange] = useState<number | null>(null);
  const [previousChips, setPreviousChips] = useState<number>(currentChips);
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    // Only show change if chips actually changed and it's not the initial render
    if (previousChips !== currentChips && previousChips !== 0) {
      const change = currentChips - previousChips;
      setChipChange(change);
      setShowAnimation(true);

      // Hide animation after 1.5 seconds
      const timer = setTimeout(() => {
        setShowAnimation(false);
        setChipChange(null);
      }, 1500);

      return () => clearTimeout(timer);
    }
    
    setPreviousChips(currentChips);
  }, [currentChips, previousChips]);

  if (!showAnimation || chipChange === null || chipChange === 0) {
    return null;
  }

  const isPositive = chipChange > 0;

  return (
    <div
      className={`absolute -left-10 sm:-left-12 top-0 font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap ${
        isPositive ? "text-green-500" : "text-red-500"
      }`}
      style={{
        animation: "fadeOut 1.5s ease-out forwards"
      }}
    >
      {isPositive ? "+" : ""}${chipChange}
    </div>
  );
};
