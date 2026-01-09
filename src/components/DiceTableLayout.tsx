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
// Organic scatter pattern utilizing corners - not perfect geometric shapes
const UNHELD_POSITIONS: Record<number, { x: number; y: number; rotate: number }[]> = {
  // 5 unheld dice - rough pentagon using corners + center
  5: [
    { x: -48, y: -22, rotate: -15 },  // upper-left area
    { x: 52, y: -18, rotate: 12 },    // upper-right area
    { x: 3, y: 8, rotate: 5 },        // center-ish
    { x: -45, y: 38, rotate: -8 },    // lower-left corner
    { x: 48, y: 42, rotate: 11 },     // lower-right corner
  ],
  // 4 unheld dice - rough rectangle using corners
  4: [
    { x: -44, y: -15, rotate: -12 },  // upper-left
    { x: 50, y: -10, rotate: 14 },    // upper-right
    { x: -48, y: 35, rotate: -6 },    // lower-left
    { x: 45, y: 40, rotate: 9 },      // lower-right
  ],
  // 3 unheld dice - loose triangle (bottom corners + top center)
  3: [
    { x: 5, y: -18, rotate: 8 },      // top center-ish
    { x: -42, y: 35, rotate: -10 },   // lower-left
    { x: 46, y: 38, rotate: 6 },      // lower-right
  ],
  // 2 unheld dice - rough diagonal
  2: [
    { x: -38, y: 8, rotate: -7 },     // left-ish
    { x: 42, y: 18, rotate: 10 },     // right-ish lower
  ],
  // 1 unheld die - slightly off-center with tilt
  1: [
    { x: 5, y: 12, rotate: -4 },
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
  
  // Get die dimensions based on size (reduced for less overlap)
  const dieSizes = {
    sm: 36,
    md: 48,
    lg: 72,
  };
  const dieWidth = dieSizes[size];
  const gap = 6;
  
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
  
  // Special case: all 5 dice held
  // The last held die (5th) should stay in its rolling position but show as held
  const allHeld = heldCount === 5;
  
  // When all 5 are held, we show 4 in the held row and 1 in the rolling area
  const effectiveHeldCount = allHeld ? 4 : heldCount;
  const heldDiceForRow = allHeld ? heldDice.slice(0, 4) : heldDice;
  const lastHeldDie = allHeld ? heldDice[4] : null; // The 5th die stays in scatter
  
  // Get positions for held dice (horizontal line)
  const heldPositions = getHeldPositions(effectiveHeldCount, dieWidth, gap);
  
  // Get positions for unheld dice (staggered scatter)
  // When all 5 held, we use position for 1 die in the scatter area for the 5th die
  const effectiveUnheldCount = allHeld ? 1 : unheldCount;
  const unheldPositions = UNHELD_POSITIONS[effectiveUnheldCount] || [];
  
  // Calculate vertical offset for the two groups
  // Held dice go at the top (tighter to pot), unheld dice go below
  const heldYOffset = -35; // Move held dice up closer to pot
  const unheldYOffset = effectiveHeldCount > 0 ? 50 : 5; // Push unheld down more to avoid overlap
  
  return (
    <div className="relative" style={{ width: '200px', height: '120px' }}>
      {/* Held dice - horizontal line (up to 4 dice) */}
      {heldDiceForRow.map((item, displayIdx) => {
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
      
      {/* The 5th held die - stays in rolling area but shows as held */}
      {lastHeldDie && (
        <div
          key={`held-last-${lastHeldDie.originalIndex}`}
          className="absolute transition-all duration-300 ease-out"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${unheldPositions[0]?.x || 0}px), calc(-50% + ${(unheldPositions[0]?.y || 0) + unheldYOffset}px)) rotate(${unheldPositions[0]?.rotate || 0}deg)`,
          }}
        >
          <HorsesDie
            value={lastHeldDie.die.value}
            isHeld={true}
            isRolling={false}
            canToggle={canToggle && !isObserver}
            onToggle={() => onToggleHold?.(lastHeldDie.originalIndex)}
            size={size}
            showWildHighlight={showWildHighlight && !isSCC}
            isSCCDie={isSCC && 'isSCC' in (lastHeldDie.die as SCCDieType) && (lastHeldDie.die as SCCDieType).isSCC}
          />
        </div>
      )}
      
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
