import { cn } from "@/lib/utils";
import { HorsesDie } from "./HorsesDie";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";

interface DiceTableLayoutProps {
  dice: (HorsesDieType | SCCDieType)[];
  isRolling?: boolean;
  canToggle?: boolean;
  onToggleHold?: (index: number) => void;
  size?: "sm" | "md" | "lg";
  gameType?: string;
  showWildHighlight?: boolean;
  /** If true, use the SCC display order (frozen 6-5-4 first) */
  useSCCDisplayOrder?: boolean;
  /** The full SCCHand for display order calculation */
  sccHand?: SCCHand;
  /** If true, this is the observer view (not my turn) */
  isObserver?: boolean;
  /** If true, show "You are rolling" message instead of dice (for active roller's own view) */
  showRollingMessage?: boolean;
  /** If true, hide dice that haven't been rolled yet (value === 0) */
  hideUnrolledDice?: boolean;
}

// Staggered positions for unheld dice (as pixel offsets from center)
// These create the scattered "random-looking" pattern matching the reference images
// Expanded horizontally to use more space (but not too far to leave room for result displays)
const UNHELD_POSITIONS: Record<number, { x: number; y: number; rotate: number }[]> = {
  // 5 unheld dice - full scatter pattern (first roll, no held dice)
  5: [
    { x: -55, y: -20, rotate: -12 },  // far left
    { x: 55, y: -25, rotate: 15 },    // far right
    { x: -25, y: 15, rotate: -8 },    // middle-left
    { x: 30, y: 10, rotate: 10 },     // middle-right
    { x: 0, y: 40, rotate: -3 },      // bottom-center
  ],
  // 4 unheld dice - scatter pattern (1 held)
  4: [
    { x: -50, y: -5, rotate: -10 },
    { x: 50, y: -10, rotate: 12 },
    { x: -20, y: 30, rotate: -6 },
    { x: 25, y: 35, rotate: 8 },
  ],
  // 3 unheld dice - triangle scatter (2 held)
  3: [
    { x: -40, y: 10, rotate: -8 },
    { x: 40, y: 5, rotate: 10 },
    { x: 0, y: 40, rotate: -4 },
  ],
  // 2 unheld dice - diagonal scatter (3 held)
  2: [
    { x: -35, y: 20, rotate: -6 },
    { x: 35, y: 25, rotate: 8 },
  ],
  // 1 unheld die - centered below (4 held)
  1: [
    { x: 0, y: 35, rotate: 0 },
  ],
  // 0 unheld dice - empty
  0: [],
};

// Calculate held dice positions (horizontal line, centered)
// Tighter gap for held dice
function getHeldPositions(count: number, dieWidth: number, gap: number): { x: number; y: number }[] {
  if (count === 0) return [];
  
  const tightGap = Math.max(2, gap - 4); // Tighter padding
  const totalWidth = count * dieWidth + (count - 1) * tightGap;
  const startX = -totalWidth / 2 + dieWidth / 2;
  
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (dieWidth + tightGap),
    y: 0,
  }));
}

export function DiceTableLayout({
  dice,
  isRolling = false,
  canToggle = false,
  onToggleHold,
  size = "sm",
  gameType,
  showWildHighlight = true,
  useSCCDisplayOrder = false,
  sccHand,
  isObserver = false,
  showRollingMessage = false,
  hideUnrolledDice = false,
}: DiceTableLayoutProps) {
  const isSCC = gameType === 'ship-captain-crew';
  
  // If showing "You are rolling" message, render that instead of dice
  if (showRollingMessage) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: '200px', height: '120px' }}>
        <div className="text-center">
          <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
            You are rolling
          </p>
        </div>
      </div>
    );
  }
  
  // Get die dimensions based on size
  const dieSizes = {
    sm: 40,
    md: 56,
    lg: 80,
  };
  const dieWidth = dieSizes[size];
  const gap = 8;
  
  // For SCC games, use display order if available
  let orderedDice: { die: HorsesDieType | SCCDieType; originalIndex: number }[] = [];
  
  if (useSCCDisplayOrder && sccHand) {
    orderedDice = getSCCDisplayOrder(sccHand).map(({ die, originalIndex }) => ({
      die: die as SCCDieType,
      originalIndex,
    }));
  } else {
    orderedDice = dice.map((die, i) => ({ die, originalIndex: i }));
  }
  
  // Filter out unrolled dice if hideUnrolledDice is true
  if (hideUnrolledDice) {
    orderedDice = orderedDice.filter(d => d.die.value !== 0);
  }
  
  // If no dice to show, return empty container
  if (orderedDice.length === 0) {
    return <div className="relative" style={{ width: '200px', height: '120px' }} />;
  }
  
  // Separate held and unheld dice
  const heldDice = orderedDice.filter(d => d.die.isHeld);
  const unheldDice = orderedDice.filter(d => !d.die.isHeld);
  
  const heldCount = heldDice.length;
  const unheldCount = unheldDice.length;
  
  // Get positions for held dice (horizontal line)
  const heldPositions = getHeldPositions(heldCount, dieWidth, gap);
  
  // Get positions for unheld dice (staggered scatter)
  const unheldPositions = UNHELD_POSITIONS[unheldCount] || [];
  
  // Special case: all 5 dice held - move down to rolling area
  const allHeld = heldCount === 5;
  
  // Calculate vertical offset for the two groups
  // Held dice go at the top (under pot), unheld dice go below
  // When all 5 are held, they move to the center (rolling area)
  const heldYOffset = allHeld ? 15 : -20; // Higher up unless all held
  const unheldYOffset = heldCount > 0 ? 45 : 5; // Push down to utilize bottom space
  
  return (
    <div className="relative" style={{ width: '200px', height: '120px' }}>
      {/* Held dice - horizontal line */}
      {heldDice.map((item, displayIdx) => {
        const pos = heldPositions[displayIdx];
        if (!pos) return null;
        
        const sccDie = item.die as SCCDieType;
        const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;
        
        return (
          <div
            key={`held-${item.originalIndex}`}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
            }}
          >
            <HorsesDie
              value={item.die.value}
              isHeld={true}
              isRolling={false}
              canToggle={canToggle && !isObserver}
              onToggle={() => onToggleHold?.(item.originalIndex)}
              size={size}
              showWildHighlight={showWildHighlight && !isSCC}
              isSCCDie={isSCCDie}
            />
          </div>
        );
      })}
      
      {/* Unheld dice - staggered scatter */}
      {unheldDice.map((item, displayIdx) => {
        const pos = unheldPositions[displayIdx];
        if (!pos) return null;
        
        const sccDie = item.die as SCCDieType;
        const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;
        
        return (
          <div
            key={`unheld-${item.originalIndex}`}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + unheldYOffset}px)) rotate(${pos.rotate}deg)`,
            }}
          >
            <HorsesDie
              value={item.die.value}
              isHeld={false}
              isRolling={isRolling}
              canToggle={canToggle && !isObserver && !isSCC}
              onToggle={() => onToggleHold?.(item.originalIndex)}
              size={size}
              showWildHighlight={showWildHighlight && !isSCC}
              isSCCDie={isSCCDie}
            />
          </div>
        );
      })}
    </div>
  );
}
