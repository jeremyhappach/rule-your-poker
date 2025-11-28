import { useEffect, useState } from "react";
import { ChipStack } from "./ChipStack";

interface ChipAnimationProps {
  amount: number;
  fromId: string;
  toId: string;
  onComplete?: () => void;
}

export const ChipAnimation = ({ amount, fromId, toId, onComplete }: ChipAnimationProps) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Get positions of from and to elements
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Calculate the transform needed
    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;

    setIsAnimating(true);

    // Set CSS variables for animation
    const root = document.documentElement;
    root.style.setProperty('--chip-move-x', `${deltaX}px`);
    root.style.setProperty('--chip-move-y', `${deltaY}px`);

    // Complete animation after duration
    const timer = setTimeout(() => {
      setIsAnimating(false);
      onComplete?.();
    }, 800);

    return () => clearTimeout(timer);
  }, [fromId, toId, onComplete]);

  if (!isAnimating) return null;

  return (
    <div 
      className="fixed z-50 pointer-events-none animate-chip-slide"
      style={{
        left: `${document.getElementById(fromId)?.getBoundingClientRect().left}px`,
        top: `${document.getElementById(fromId)?.getBoundingClientRect().top}px`,
      }}
    >
      <ChipStack amount={amount} size="md" />
    </div>
  );
};
