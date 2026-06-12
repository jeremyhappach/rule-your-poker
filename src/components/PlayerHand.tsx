import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Card as CardType, Rank, getBestFiveCardIndices } from "@/lib/cardUtils";
import { PlayingCard, getCardSize, CardSize } from "@/components/PlayingCard";
import { useCardRowLayout } from "@/lib/canonicalShell/useCardRowLayout";
import { supabase } from "@/integrations/supabase/client";

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
  expectedCardCount?: number;
  highlightedIndices?: number[];
  kickerIndices?: number[];
  hasHighlights?: boolean;
  gameType?: string | null;
  currentRound?: number;
  showSeparated?: boolean;
  tightOverlap?: boolean;
  unusedCardsBelow?: boolean;
  isRightSide?: boolean;
  isBottomPosition?: boolean;
  /**
   * Wave 2A (3-5-7). Vertical budget already net of the contract-owned
   * action-strip reservation. Pass the *unscaled* reserve when the
   * caller wraps PlayerHand in a CSS `transform: scale` (divide the
   * scaled reserve by the wrapper scale).
   */
  availableHeightPx?: number;
  /**
   * Wave 2A (3-5-7). Optional explicit horizontal budget. When omitted,
   * the hand walks up to the canonical `[data-357-active-pane-content]`
   * ancestor and uses its layout `clientWidth` as the resolver budget.
   * That ancestor is a non-shrink-wrapping pane container, so it does
   * not collapse around the cards (the immediate parent does, which
   * caused a feedback loop where the cards' own size drove the budget).
   * `clientWidth` returns unscaled CSS layout pixels even when a
   * `transform: scale` wrapper sits between the pane and PlayerHand,
   * so the resolver sizes in the same coordinate space inline styles
   * render in (pre-transform). When a wrapper scale is supplied via
   * `wrapperScale`, the measured pane width is divided by it so the
   * post-transform footprint still fits the pane.
   */
  availableWidthPx?: number;
  /**
   * Wave 2A (3-5-7). CSS `transform: scale` applied by the caller
   * around PlayerHand. Used only to convert the measured pane width
   * (in post-transform pixels) into the unscaled budget the resolver
   * works in. Defaults to 1.
   */
  wrapperScale?: number;
}



// Get wild rank based on round (3-5-7 game only)
const getWildRank = (round: number): string | null => {
  switch (round) {
    case 1: return '3';
    case 2: return '5';
    case 3: return '7';
    default: return null;
  }
};

export const PlayerHand = ({ 
  cards, 
  isHidden = false, 
  expectedCardCount,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
  gameType,
  currentRound = 0,
  showSeparated = false,
  tightOverlap = false,
  unusedCardsBelow = false,
  isRightSide = false,
  isBottomPosition = false,
  availableHeightPx,
  availableWidthPx,
  wrapperScale = 1,
}: PlayerHandProps) => {

  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  // Determine wild rank for 3-5-7 games
  const is357Game = gameType === '3-5-7' || gameType === '3-5-7-game';
  const wildRank = is357Game ? getWildRank(currentRound) : null;
  
  // For round 3 with 7 cards, separate into used and unused
  const isRound3With7Cards = is357Game && currentRound === 3 && cards.length === 7 && showSeparated && !isHidden;
  // For round 2 with 5 cards when unusedCardsBelow is requested
  const isRound2With5Cards = is357Game && currentRound === 2 && cards.length === 5 && unusedCardsBelow && !isHidden;
  // For round 3 with 7 cards when unusedCardsBelow is requested  
  const isRound3WithUnusedBelow = is357Game && currentRound === 3 && cards.length === 7 && unusedCardsBelow && !isHidden;
  const shouldSeparateCards = isRound3With7Cards || isRound2With5Cards || isRound3WithUnusedBelow;
  
  let usedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  let unusedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  
  if (shouldSeparateCards) {
    // For round 2: best 5 from 5 = all used (but we need to find unused from original sorting)
    // For round 3: best 5 from 7 = 5 used, 2 unused
    if (currentRound === 2 && cards.length === 5) {
      // In round 2, all 5 cards are used - no unused cards
      usedCards = cards.map((card, idx) => ({
        card,
        originalIndex: idx,
        isWild: wildRank !== null && card.rank === wildRank
      }));
      unusedCards = [];
    } else if (currentRound === 3 && cards.length === 7) {
      // Pass '7' as explicit wild rank for round 3 (important for correct 5-card subset evaluation)
      const { usedIndices, unusedIndices } = getBestFiveCardIndices(cards, true, '7' as Rank);
      
      usedCards = usedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
      
      unusedCards = unusedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
    }
    
    // Sort used cards: wild cards first, then by rank ascending
    usedCards.sort((a, b) => {
      if (a.isWild && !b.isWild) return -1;
      if (!a.isWild && b.isWild) return 1;
      return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
    });
    
    // Sort unused cards by rank ascending
    unusedCards.sort((a, b) => RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank]);
  }
  
  // Create sorted cards with original indices for highlighting (normal display)
  const cardsWithIndices = cards.map((card, index) => ({ 
    card, 
    originalIndex: index,
    isWild: wildRank !== null && card.rank === wildRank
  }));
  
  // Sort cards: wild cards first (descending by count), then by rank ascending
  const sortedCardsWithIndices = [...cardsWithIndices].sort((a, b) => {
    // Wild cards come first
    if (a.isWild && !b.isWild) return -1;
    if (!a.isWild && b.isWild) return 1;
    // Within same wild status, sort by rank ascending
    return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
  });
  
  const displayCardCount = cards.length > 0 ? cards.length : (expectedCardCount || 0);
  const cardSize = getCardSize(displayCardCount);

  // Round 1 (3-5-7) on mobile: cards were getting too wide when scaled.
  // Override the base w/h to be slightly narrower + taller to match a more natural playing-card ratio.
  const round1NarrowTallClass =
    is357Game && currentRound === 1 && displayCardCount === 3
      ? "w-10 h-16 sm:w-11 sm:h-[4.25rem]"
      : "";

  // Calculate overlap based on card count and tightOverlap flag
  const getOverlapClass = () => {
    if (tightOverlap) {
      // Tighter overlap for multi-player showdown
      if (displayCardCount >= 7) return '-ml-4 sm:-ml-4 first:ml-0';
      if (displayCardCount >= 5) return '-ml-3 sm:-ml-3 first:ml-0';
      return '-ml-2 first:ml-0';
    }
    if (displayCardCount >= 7) return '-ml-2 sm:-ml-2 first:ml-0';
    if (displayCardCount >= 5) return '-ml-2 sm:-ml-2 first:ml-0';
    return '-ml-1 first:ml-0';
  };

  const overlapClass = getOverlapClass();

  // ─── Wave 2A: 3-5-7 dynamic card row layout ───────────────────────────────
  // The active-player hand is a pane artifact, not a seat artifact. The
  // immediate parent is a shrink-wrapping transform/flex wrapper whose
  // width is *driven by the cards*, which created a feedback loop:
  //   ResizeObserver → smaller width → smaller cards → smaller wrapper.
  // We instead climb to the canonical `[data-357-active-pane-content]`
  // ancestor — a non-shrink-wrapping pane container — and divide its
  // post-transform width by the caller-supplied `wrapperScale` so the
  // resolver works in the same unscaled pixel space inline styles use.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [measuredPaneWidth, setMeasuredPaneWidth] = useState<number>(0);
  const [measuredParentWidth, setMeasuredParentWidth] = useState<number>(0);
  useLayoutEffect(() => {
    if (!is357Game) return;
    const el = measureRef.current;
    if (!el) return;
    const pane = el.closest<HTMLElement>('[data-357-active-pane-content]');
    const parent = el.parentElement;
    const update = () => {
      if (pane) {
        const w = pane.clientWidth;
        if (Number.isFinite(w) && w > 0) {
          setMeasuredPaneWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        }
      } else if (parent) {
        // Fallback for non-active-pane sites (seated players, etc.) —
        // those use static wrappers that don't shrink-wrap pathologically.
        const w = parent.clientWidth;
        if (Number.isFinite(w) && w > 0) {
          setMeasuredParentWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (pane) ro.observe(pane);
    else if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [is357Game, currentRound, displayCardCount, isHidden]);

  const safeWrapperScale = Number.isFinite(wrapperScale) && wrapperScale > 0 ? wrapperScale : 1;
  // Wild-card OUTSIDE footprint (unscaled CSS px). Decomposition:
  //   • border: 3px solid — uses border-box (shadcn Card default), so it
  //     paints INSIDE the box. Zero outside contribution.
  //   • box-shadow: 0 0 8px 2px — outset shadow with spread=2 + blur=8.
  //     Maximum theoretical extent is 10px, but the blur tail fades
  //     quadratically and is not visually present past ~the spread plus
  //     half the blur. The perceptible solid-glow halo is ≈ 6px.
  //   • inset shadow component — inside the box, no outside contribution.
  // We reserve only the perceptible halo, not the full mathematical
  // blur tail, so highlighted hands stay close to the non-highlighted
  // card size while still guaranteeing no collision with the action
  // strip or pane edges. Constant in pre-transform CSS px.
  const WILD_OUTSIDE_HALO_PX = 6;
  const reservesWildArtifact = is357Game && wildRank !== null;
  const widthArtifactReserve = reservesWildArtifact ? WILD_OUTSIDE_HALO_PX * 2 : 0;
  const heightArtifactReserve = reservesWildArtifact ? WILD_OUTSIDE_HALO_PX * 2 : 0;

  const rawEffectiveWidth =
    is357Game
      ? (typeof availableWidthPx === 'number' && availableWidthPx > 0
          ? availableWidthPx
          : measuredPaneWidth > 0
            ? measuredPaneWidth / safeWrapperScale
            : measuredParentWidth)
      : 0;
  const effectiveAvailableWidth = Math.max(0, rawEffectiveWidth - widthArtifactReserve);
  const rawEffectiveHeight =
    is357Game && typeof availableHeightPx === 'number' && availableHeightPx > 0
      ? availableHeightPx
      : undefined;
  const effectiveAvailableHeight =
    typeof rawEffectiveHeight === 'number'
      ? Math.max(20, rawEffectiveHeight - heightArtifactReserve)
      : undefined;

  const dyn357 = useCardRowLayout({
    availableWidth: effectiveAvailableWidth,
    availableHeight: effectiveAvailableHeight,
    count: displayCardCount,
    aspect: 0.71,
    minCardWidth: 28,
    // Pre-transform ceiling. With wrapper scales of ~1.6–2.8× in
    // MobileGameTable, this caps the rendered card width at ~160–220 px.
    maxCardWidth: 80,
    maxOverlapRatio: 0.6,
  });
  const dyn357Style: CSSProperties | null =
    is357Game && dyn357
      ? {
          width: `${dyn357.cardWidth}px`,
          height: `${dyn357.cardHeight}px`,
        }
      : null;
  const dyn357OverlapStyle: CSSProperties | null =
    is357Game && dyn357
      ? { marginLeft: `-${dyn357.overlapPx}px` }
      : null;
  const dynActive = !!dyn357Style;
  const effectiveOverlapClass = dynActive ? 'first:ml-0' : overlapClass;
  const effectiveRound1Class = dynActive ? '' : round1NarrowTallClass;
  const composeStyle = (base?: CSSProperties, includeOverlap = true): CSSProperties | undefined => {
    if (!dynActive) return base;
    return {
      ...(base || {}),
      ...(dyn357Style || {}),
      ...(includeOverlap ? (dyn357OverlapStyle || {}) : {}),
    };
  };

  // ─── Wave 2A measurement probe ────────────────────────────────────────────
  // Persists resolver output vs. actual rendered DOM size to debug_events.
  // Throttled per (round, count, parentWidth-rounded) signature per mount.
  const measureSentRef = useRef<Set<string>>(new Set());
  useLayoutEffect(() => {
    if (!is357Game || isHidden) return;
    const el = measureRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const firstCard = el.querySelector<HTMLElement>(':scope > *');
    if (!firstCard) return;
    const rowRect = el.getBoundingClientRect();
    const cardRect = firstCard.getBoundingClientRect();
    const parentClientWidth = parent.clientWidth;
    const parentRectWidth = parent.getBoundingClientRect().width;
    const activeHandRegion = el.closest<HTMLElement>('[data-357-active-hand-region]');
    const activePaneContent = el.closest<HTMLElement>('[data-357-active-pane-content]');
    const hudPane = el.closest<HTMLElement>('[data-hud-row="pane"]');
    const measureBox = (node: HTMLElement | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
      };
    };
    const wrapperScale =
      parentClientWidth > 0 ? parentRectWidth / parentClientWidth : null;
    const overlapRatio =
      dyn357 && dyn357.cardWidth > 0
        ? dyn357.overlapPx / dyn357.cardWidth
        : null;
    const sig = `${currentRound}|${displayCardCount}|${Math.round(parentClientWidth)}`;
    if (measureSentRef.current.has(sig)) return;
    measureSentRef.current.add(sig);
    const payload = {
      probe: '357-measure',
      round: currentRound,
      count: displayCardCount,
      availableWidth: effectiveAvailableWidth,
      parentClientWidth,
      parentRectWidth,
      wrapperScale,
      availableHeightPx: availableHeightPx ?? null,
      geometrySources: {
        measuredParent: measureBox(parent),
        activeHandRegion: measureBox(activeHandRegion),
        activePaneContent: measureBox(activePaneContent),
        hudPane: measureBox(hudPane),
      },
      resolver: dyn357
        ? {
            cardWidth: dyn357.cardWidth,
            cardHeight: dyn357.cardHeight,
            overlapPx: dyn357.overlapPx,
            overlapRatio,
            totalWidth: dyn357.totalWidth,
          }
        : null,
      rendered: {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        rowWidth: rowRect.width,
      },
      ts: new Date().toISOString(),
    };
    void supabase
      .from('debug_events')
      .insert({ event_type: '357-geometry-probe', payload })
      .then(() => {});
  });



  // Render card backs for hidden cards
  if (isHidden || (cards.length === 0 && expectedCardCount && expectedCardCount > 0)) {
    const count = isHidden ? displayCardCount : expectedCardCount!;
    
    
    // For 3-5-7 games with multiple cards, use fanned arc layout
    const useFannedArc = is357Game && count >= 3;
    
    // Calculate arc parameters for fanned layout
    const arcSpread = count >= 7 ? 45 : count >= 5 ? 35 : 25; // Total arc angle in degrees
    const startAngle = -arcSpread / 2;
    const angleStep = count > 1 ? arcSpread / (count - 1) : 0;
    
    return (
      <div className="flex justify-center relative" style={{ minHeight: '60px' }}>
        {Array.from({ length: count }, (_, index) => {
          // Calculate rotation and vertical offset for arc effect
          const rotation = useFannedArc ? startAngle + (index * angleStep) : (index * 2 - 2);
          const verticalOffset = useFannedArc 
            ? Math.abs(index - (count - 1) / 2) * 3 // Cards at edges are slightly higher
            : 0;
          
          return (
            <PlayingCard
              key={index}
              isHidden
              size={cardSize}
              className={`${useFannedArc ? (dynActive ? 'first:ml-0' : '-ml-4 first:ml-0') : effectiveOverlapClass} ${effectiveRound1Class} animate-fade-in`}
              style={composeStyle({
                transform: `rotate(${rotation}deg) translateY(${verticalOffset}px)`,
                animationDelay: `${index * 150}ms`,
                animationFillMode: 'backwards',
                transformOrigin: 'bottom center'
              }, useFannedArc) /* fanned arc: keep dyn overlap; otherwise use overlapClass */ }
            />
          );
        })}
      </div>
    );
  }

  // 3-5-7 showdown display with unused cards in separate row (on outer edge)
  if ((isRound2With5Cards || isRound3WithUnusedBelow) && unusedCardsBelow) {
    const usedCardSize: CardSize = 'lg'; // Larger size for used cards during showdown
    const unusedCardSize: CardSize = 'sm'; // Small size for dimmed unused cards
    
    // Unused cards element
    const unusedCardsElement = unusedCards.length > 0 && (
      <div className={`flex items-center ${isRightSide ? 'self-end' : 'self-start'}`}>
        {unusedCards.map(({ card, originalIndex }, displayIndex) => (
          <PlayingCard
            key={`unused-${card.rank}-${card.suit}-${originalIndex}`}
            card={card}
            size={unusedCardSize}
            isDimmed={true}
            isWild={false}
            className="-ml-2 first:ml-0"
            style={{ 
              opacity: 0.4,
              transform: 'scale(0.85)',
            }}
          />
        ))}
      </div>
    );
    
    // Used cards element
    const usedCardsElement = (
      <div className="flex items-end">
        {usedCards.map(({ card, originalIndex, isWild }, displayIndex) => {
          const isHighlighted = highlightedIndices.includes(originalIndex);
          const isKicker = kickerIndices.includes(originalIndex);
          const isDimmed = hasHighlights && !isHighlighted && !isKicker;
          
          return (
            <PlayingCard
              key={`used-${card.rank}-${card.suit}-${originalIndex}`}
              card={card}
              size={usedCardSize}
              isHighlighted={isHighlighted}
              isKicker={isKicker}
              isDimmed={isDimmed}
              isWild={isWild}
              className="-ml-3 first:ml-0"
              style={{ 
                transform: `rotate(${displayIndex * 2 - (usedCards.length - 1)}deg)`,
              }}
            />
          );
        })}
      </div>
    );
    
    return (
      <div className="flex flex-col gap-0.5">
        {/* For bottom positions: unused above, used below. For others: used above, unused below */}
        {isBottomPosition ? (
          <>
            {unusedCardsElement}
            {usedCardsElement}
          </>
        ) : (
          <>
            {usedCardsElement}
            {unusedCardsElement}
          </>
        )}
      </div>
    );
  }

  // Special round 3 display with unused cards dimmed but all together (old inline style)
  if (isRound3With7Cards && !unusedCardsBelow) {
    // Combine all cards: unused (dimmed) first, then used cards
    const allCardsOrdered = [...unusedCards, ...usedCards];
    
    return (
      <div className="flex items-end" ref={is357Game ? measureRef : undefined}>
        {allCardsOrdered.map(({ card, originalIndex, isWild }, displayIndex) => {
          const isUnused = displayIndex < unusedCards.length;
          const usedDisplayIndex = isUnused ? 0 : displayIndex - unusedCards.length;
          const isHighlighted = !isUnused && highlightedIndices.includes(originalIndex);
          const isKicker = !isUnused && kickerIndices.includes(originalIndex);
          const isDimmed = isUnused || (hasHighlights && !isHighlighted && !isKicker);
          
          return (
            <PlayingCard
              key={`r3-${card.rank}-${card.suit}-${originalIndex}`}
              card={card}
              size={cardSize}
              isHighlighted={isHighlighted}
              isKicker={isKicker}
              isDimmed={isDimmed}
              isWild={!isUnused && isWild}
              faceFillPx={dynActive && !isUnused ? dyn357!.cardWidth : undefined}
              className={`${effectiveOverlapClass} ${effectiveRound1Class}`}
              style={composeStyle({
                transform: `rotate(${displayIndex * 2 - (allCardsOrdered.length - 1)}deg)`,
                opacity: isUnused ? 0.4 : 1,
              })}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex" ref={is357Game ? measureRef : undefined}>

      {sortedCardsWithIndices.map(({ card, originalIndex, isWild }, displayIndex) => {
        const isHighlighted = highlightedIndices.includes(originalIndex);
        const isKicker = kickerIndices.includes(originalIndex);
        const isDimmed = hasHighlights && !isHighlighted && !isKicker;
        
        return (
          <PlayingCard
            key={`${card.rank}-${card.suit}-${originalIndex}`}
            card={card}
            size={cardSize}
            isHighlighted={isHighlighted}
            isKicker={isKicker}
            isDimmed={isDimmed}
            isWild={isWild}
            faceFillPx={dynActive ? dyn357!.cardWidth : undefined}
            className={`${effectiveOverlapClass} ${effectiveRound1Class}`}
            style={composeStyle({
              transform: `rotate(${displayIndex * 2 - (sortedCardsWithIndices.length - 1)}deg)`,
            })}
          />
        );
      })}
    </div>
  );
};
