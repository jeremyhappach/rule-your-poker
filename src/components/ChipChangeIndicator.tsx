import { useEffect, useState, useRef } from "react";
import { formatChipValue } from "@/lib/utils";

interface ChipChangeIndicatorProps {
  currentChips: number;
  playerId: string;
}

export const ChipChangeIndicator = ({ currentChips, playerId }: ChipChangeIndicatorProps) => {
  const [chipChange, setChipChange] = useState<number | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const previousChipsRef = useRef<number>(currentChips);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousChipsRef.current = currentChips;
      return;
    }

    // Only show change if chips actually changed
    if (previousChipsRef.current !== currentChips) {
      const change = currentChips - previousChipsRef.current;
      setChipChange(change);
      setShowAnimation(true);

      // Hide animation after 2.5 seconds
      const timer = setTimeout(() => {
        setShowAnimation(false);
        setChipChange(null);
      }, 2500);

      previousChipsRef.current = currentChips;

      return () => clearTimeout(timer);
    }
  }, [currentChips]);

  if (!showAnimation || chipChange === null || chipChange === 0) {
    return null;
  }

  const isPositive = chipChange > 0;

  return (
    <div
      className={`font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap mr-1 ${
        isPositive ? "text-green-500" : "text-red-500"
      }`}
      style={{
        animation: "fadeOut 2.5s ease-out forwards"
      }}
    >
      {isPositive ? "+" : "-"}${formatChipValue(Math.abs(chipChange))}
    </div>
  );
};
