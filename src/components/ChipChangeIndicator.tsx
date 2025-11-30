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

      setPreviousChips(currentChips);

      return () => clearTimeout(timer);
    } else if (previousChips === 0 || previousChips === currentChips) {
      // Initialize previous chips on first render
      setPreviousChips(currentChips);
    }
  }, [currentChips, previousChips]);

  if (!showAnimation || chipChange === null || chipChange === 0) {
    return null;
  }

  const isPositive = chipChange > 0;

  return (
    <div
      className={`absolute -right-12 top-1/2 -translate-y-1/2 font-bold text-sm sm:text-base md:text-lg whitespace-nowrap animate-fade-in ${
        isPositive ? "text-green-500" : "text-red-500"
      }`}
      style={{
        animationDelay: "0s, 1.2s",
        animationName: "fadeIn, fadeOut",
        animationDuration: "0.3s, 0.3s",
        animationTimingFunction: "ease-out, ease-out",
        animationFillMode: "both"
      }}
    >
      {isPositive ? "+" : ""}${chipChange}
    </div>
  );
};
