// @vitest-environment jsdom
// @ts-nocheck
/**
 * P0 DOM-count proof — Cribbage user-visible hand invariant.
 *
 * The prior helper-only tests locked the pure decision layer. This suite
 * exercises the component tree in jsdom so we assert the *rendered* card
 * node count under the exact live conditions that produced empty hands
 * on both clients ("cardsTabMounted:false / wouldBeGameplayMode:false
 * while phase=discarding & authoritative hand=6").
 *
 * Acceptance invariant (from user):
 *   Once phase is post-deal AND authoritative hand is non-empty:
 *     - parent must enter gameplay/card-render mode via authoritative fallback
 *     - CribbageMobileCardsTab must mount
 *     - visible local hand count must equal authoritative count
 *     - DealRuntime may animate but cannot clip visible hand to 0/1
 *       once activeIntentsForHand === 0
 *   During a healthy in-flight deal (activeIntentsForHand > 0) staged
 *   subset rendering is preserved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import {
  deriveCribbageParentRenderMode,
  isCribbagePostDealPhase,
  hasAnyCribbageAuthoritativeHand,
} from '@/lib/cribbage/cribbageRenderGuards';

// ── Mock heavy visual + side-effect deps so DOM counts are stable ────────
//
// ActiveHandFan is the seat of card rendering. In jsdom the real resolver
// returns a null layout (getBoundingClientRect is 0×0, no ResizeObserver
// fires), which would produce an empty container. We replace it with a
// stub that renders one `[data-testid="crib-card"]` node per card and
// invokes `renderCard` so click handlers still wire up.
vi.mock('@/components/activeHand/ActiveHandFan', () => ({
  ActiveHandFan: ({ cards, renderCard }: any) => (
    <div data-testid="crib-active-hand-fan">
      {cards.map((card: any, index: number) => (
        <div key={index} data-testid="crib-card" data-crib-card-index={index}>
          {renderCard
            ? renderCard({
                card,
                index,
                cardWidthPx: 60,
                cardHeightPx: 90,
                rotationDeg: 0,
                overlapPx: 0,
                tier: 'medium',
                card_node: (
                  <span data-testid="crib-card-face">{card.rank}{card.suit}</span>
                ),
              })
            : <span data-testid="crib-card-face">{card.rank}{card.suit}</span>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/lib/persistSyncDebugEvent', () => ({
  persistSyncDebugEvent: vi.fn(),
  isSyncDebugEnabled: () => false,
  refreshSyncDebugFlag: () => {},
}));

vi.mock('@/lib/activeHand/activeHandLayoutSettings', () => ({
  useActiveHandLayoutPolicy: () => ({
    preferredOverlap: 0,
    maxOverlap: 0.4,
    minCardWidthPx: 24,
  }),
  resolveActiveHandLayout: () => ({
    cardWidth: 60,
    cardHeight: 90,
    overlapPx: 0,
    fanArchDeg: 0,
    stageRect: { width: 320, height: 120 },
  }),
}));

// Mutable deal-runtime fake — each test flips it before render.
type FakeDeal = {
  phase: 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY';
  expectedCount: number;
  activeIntentsForHand: number;
  settledCountForPlayer: number;
} | null;
let fakeDeal: FakeDeal = null;
vi.mock('@/lib/canonicalShell/cardTransport/DealRuntime', () => ({
  useDealRuntime: () => {
    if (!fakeDeal) return null;
    return {
      phase: fakeDeal.phase,
      expectedCount: fakeDeal.expectedCount,
      activeIntentsForHand: fakeDeal.activeIntentsForHand,
      getSettledCountForPlayer: () => fakeDeal!.settledCountForPlayer,
      getSettledCardIdsForPlayer: () => [],
      settledCardIds: new Set<string>(),
      isSettled: () => false,
      readyReleased: false,
      releaseEligible: false,
      releaseBlockReason: null,
      dealSettledNow: () => {},
      beginDeal: () => {},
      beginWave: () => {},
      enterGameplay: () => {},
      holmHandGeneration: 0,
      resetForHand: () => {},
      beginDealForHand: () => {},
      beginWaveForHand: () => {},
    };
  },
  DealRuntime: ({ children }: any) => <>{children}</>,
}));

import { CribbageMobileCardsTab } from './CribbageMobileCardsTab';

// ── Fixtures ─────────────────────────────────────────────────────────────

const suits = ['spades', 'hearts', 'diamonds', 'clubs', 'spades', 'hearts'] as const;
const ranks = ['A', '2', '3', '4', '5', '6'] as const;
const makeHand = (): CribbageCard[] =>
  ranks.map((rank, i) => ({
    rank,
    suit: suits[i],
    value: rank === 'A' ? 1 : Number(rank) || 10,
  }));

function makeState(overrides: Partial<CribbageState> = {}): CribbageState {
  const p1Hand = makeHand();
  const p2Hand = makeHand();
  return {
    phase: 'discarding',
    dealerPlayerId: 'p1',
    cribOwnerPlayerId: 'p1',
    playerStates: {
      p1: { playerId: 'p1', hand: p1Hand, pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
      p2: { playerId: 'p2', hand: p2Hand, pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
    },
    turnOrder: ['p2', 'p1'],
    crib: [],
    cutCard: null,
    pegging: {
      playedCards: [],
      currentCount: 0,
      currentTurnPlayerId: 'p2',
      lastToPlay: null,
      goCalledBy: [],
      sequenceStartIndex: 0,
    },
    anteAmount: 10,
    pot: 0,
    pointsToWin: 121,
    skunkEnabled: true,
    skunkThreshold: 91,
    doubleSkunkEnabled: true,
    doubleSkunkThreshold: 61,
    winnerPlayerId: null,
    loserScore: null,
    payoutMultiplier: 1,
    ...overrides,
  };
}

const currentPlayer = {
  id: 'p1',
  user_id: '11111111-2222-3333-4444-555555555555',
  position: 0,
  chips: 1000,
  is_bot: false,
  profiles: { username: 'Reed' },
};

let container: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  fakeDeal = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  container = null;
  root = null;
});

function countCards(): number {
  return container!.querySelectorAll('[data-testid="crib-card"]').length;
}

// ─────────────────────────────────────────────────────────────────────────
// The former "child DOM render under stale presentation" describe was
// deleted together with the fixed opening-deal grace and PRE_DEAL/
// DEALING-idle self-heal contract. Under the current lifecycle-only
// visibility contract (see cribbageRenderGuards + CardTransportRuntime
// dropped-intent recovery) PRE_DEAL and DEALING-idle render empty; only
// GAMEPLAY / READY render the authoritative full hand. The tests that
// asserted otherwise were obsolete and are removed here rather than
// left as `describe.skip` (which hides coverage).
// ─────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────
// REGRESSION — the tab preserves in-flight deal animation subset when
// DealRuntime is actively dealing (activeIntentsForHand > 0).
// ─────────────────────────────────────────────────────────────────────────

describe('CribbageMobileCardsTab — healthy in-flight deal is not clobbered by self-heal', () => {
  it('renders exactly the settled subset (2) when DealRuntime is DEALING with active intents', () => {
    fakeDeal = { phase: 'DEALING', expectedCount: 12, activeIntentsForHand: 3, settledCountForPlayer: 2 };
    const state = makeState({ phase: 'discarding' });
    const auth = state.playerStates.p1.hand;
    act(() => {
      root!.render(
        <CribbageMobileCardsTab
          cribbageState={state}
          currentPlayerId="p1"
          playerCount={2}
          isProcessing={false}
          onDiscard={() => {}}
          onPlayCard={() => {}}
          currentPlayer={currentPlayer}
          gameId="game-1"
          isDealer
          roundId="round-1"
          selectedCards={[]}
          renderTrace={{
            renderHandKey: 'p1:A,2,3,4,5,6',
            currentHandKey: 'p1:A,2,3,4,5,6',
            dealerGameId: 'dg-1',
            isFrozen: false,
            authoritativeHand: auth,
            renderSource: 'sync-presentation',
            expectedRoundId: 'round-1',
            sourceRoundId: 'round-1',
            handNumber: 1,
            isGameplayMode: true,
            viewStateIsCurrentRound: true,
            interactionsAllowed: true,
          }}
        />,
      );
    });
    expect(countCards()).toBe(2);
  });

  it('renders full 6 once DealRuntime enters GAMEPLAY', () => {
    fakeDeal = { phase: 'GAMEPLAY', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 6 };
    const state = makeState({ phase: 'discarding' });
    const auth = state.playerStates.p1.hand;
    act(() => {
      root!.render(
        <CribbageMobileCardsTab
          cribbageState={state}
          currentPlayerId="p1"
          playerCount={2}
          isProcessing={false}
          onDiscard={() => {}}
          onPlayCard={() => {}}
          currentPlayer={currentPlayer}
          gameId="game-1"
          isDealer
          roundId="round-1"
          selectedCards={[]}
          renderTrace={{
            renderHandKey: 'p1:A,2,3,4,5,6',
            currentHandKey: 'p1:A,2,3,4,5,6',
            dealerGameId: 'dg-1',
            isFrozen: false,
            authoritativeHand: auth,
            renderSource: 'sync-presentation',
            expectedRoundId: 'round-1',
            sourceRoundId: 'round-1',
            handNumber: 1,
            isGameplayMode: true,
            viewStateIsCurrentRound: true,
            interactionsAllowed: true,
          }}
        />,
      );
    });
    expect(countCards()).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The former "opening-deal grace prevents pre-transport flash" describe
// (six tests) was deleted. It exclusively asserted the fixed 2000ms
// opening-deal grace, which was deliberately removed. Visibility is
// now strictly lifecycle-driven: PRE_DEAL / DEALING renders empty and
// GAMEPLAY renders the authoritative hand; transport-dropped intents
// recover via CardTransportRuntime's canonical MAX_PENDING_MS path.
// Retained lifecycle assertions live in the "healthy in-flight deal"
// describe above.
// ─────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────
// PARENT-LEVEL RTL — mirrors the exact mount gate in
// CribbageMobileGameTable.tsx (`primaryMountOk || selfHealMountOk`) and
// proves that when viewState is null/stale but authoritative Cribbage
// state is post-deal with a non-empty hand, the Cards surface mounts
// and produces user-visible cards.
//
// Mounting the full 5,900-line CribbageMobileGameTable in jsdom is not
// tractable (dozens of contexts, geometry lab, realtime, seat ring …).
// The harness below is intentionally a faithful mirror of the mount
// expression at CribbageMobileGameTable.tsx:6983–7014, so any drift in
// the parent gate will require this test to move in lock-step.
// ─────────────────────────────────────────────────────────────────────────

function ParentSelfHealHarness({
  authoritativeState,
  viewState,
  activeTab = 'cards',
  currentPlayerId = 'p1',
  interactionsAllowed = true,
  isTransitioning = false,
  isHighCardMode = false,
}: {
  authoritativeState: CribbageState | null;
  viewState: CribbageState | null;
  activeTab?: 'cards' | 'other';
  currentPlayerId?: string;
  interactionsAllowed?: boolean;
  isTransitioning?: boolean;
  isHighCardMode?: boolean;
}) {
  // Mirrors the parent's gameplay-mode derivation.
  const mode = deriveCribbageParentRenderMode({
    isDealerSelection: false,
    isHighCardMode,
    initialLoadComplete: false, // <-- deliberately false: stale bootstrap gate
    renderHandKey: '', // <-- deliberately empty: presentation not caught up
    currentHandKey: viewState ? 'live-key' : '',
    currentPlayerId,
    isObserver: false,
    isStaleCompleteAwaitingNext: false,
    authoritativeState,
  });

  // Mirrors mount gate at CribbageMobileGameTable.tsx:6983–7014.
  const primaryMountOk = !!(
    activeTab === 'cards' &&
    mode.isGameplayMode &&
    viewState &&
    !isTransitioning &&
    interactionsAllowed
  );
  const authHandLen =
    authoritativeState?.playerStates?.[currentPlayerId]?.hand?.length ?? 0;
  const selfHealMountOk = !!(
    !primaryMountOk &&
    activeTab === 'cards' &&
    authoritativeState &&
    isCribbagePostDealPhase(authoritativeState.phase) &&
    authHandLen > 0
  );
  if (!primaryMountOk && !selfHealMountOk) {
    return <div data-testid="parent-not-mounted" />;
  }
  const stateForRender = primaryMountOk ? viewState! : authoritativeState!;
  return (
    <div data-testid="parent-mounted" data-mount-path={primaryMountOk ? 'primary' : 'self-heal'}>
      <CribbageMobileCardsTab
        cribbageState={stateForRender}
        currentPlayerId={currentPlayerId}
        playerCount={2}
        isProcessing={false}
        onDiscard={() => {}}
        onPlayCard={() => {}}
        currentPlayer={currentPlayer}
        gameId="game-1"
        isDealer
        roundId="round-1"
        renderTrace={{
          renderHandKey: primaryMountOk ? 'live-key' : 'p1:A,2,3,4,5,6',
          currentHandKey: primaryMountOk ? 'live-key' : 'p1:A,2,3,4,5,6',
          dealerGameId: 'dg-1',
          isFrozen: false,
          authoritativeHand: stateForRender.playerStates[currentPlayerId]?.hand ?? null,
          renderSource: primaryMountOk ? 'sync-presentation' : 'self-heal-authoritative',
          expectedRoundId: 'round-1',
          sourceRoundId: 'round-1',
          handNumber: 1,
          isGameplayMode: mode.isGameplayMode,
          viewStateIsCurrentRound: primaryMountOk,
          interactionsAllowed: primaryMountOk ? interactionsAllowed : false,
        }}
      />
    </div>
  );
}

describe('Parent authoritative-fallback mount (RTL mirror of CribbageMobileGameTable gate)', () => {
  it('mounts Cards surface via self-heal when viewState is null but authoritative phase=discarding with 6 cards', () => {
    fakeDeal = { phase: 'PRE_DEAL', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 0 };
    const auth = makeState({ phase: 'discarding' });
    // Sanity — the fallback helper agrees the fallback fires.
    expect(hasAnyCribbageAuthoritativeHand(auth)).toBe(true);
    expect(
      deriveCribbageParentRenderMode({
        isDealerSelection: false,
        isHighCardMode: false,
        initialLoadComplete: false,
        renderHandKey: '',
        currentHandKey: '',
        currentPlayerId: 'p1',
        isObserver: false,
        isStaleCompleteAwaitingNext: false,
        authoritativeState: auth,
      }).parentAuthoritativeGameplayFallback,
    ).toBe(true);

    act(() => {
      root!.render(<ParentSelfHealHarness authoritativeState={auth} viewState={null} />);
    });

    // Cards surface is present …
    expect(container!.querySelector('[data-testid="parent-mounted"]')).not.toBeNull();
    expect(
      container!.querySelector('[data-testid="parent-mounted"]')!.getAttribute('data-mount-path'),
    ).toBe('self-heal');
    // … and it produced 6 visible card DOM nodes.
    expect(countCards()).toBe(6);
  });

  it('renders 6 visible cards for the local player when viewState is stale during pegging', () => {
    fakeDeal = { phase: 'PRE_DEAL', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 0 };
    const auth = makeState({ phase: 'pegging' });
    act(() => {
      root!.render(<ParentSelfHealHarness authoritativeState={auth} viewState={null} />);
    });
    expect(countCards()).toBe(6);
  });

  it('mounts Cards surface when stale high-card mode remains true after authoritative discarding state arrives', () => {
    fakeDeal = { phase: 'PRE_DEAL', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 0 };
    const auth = makeState({ phase: 'discarding' });
    act(() => {
      root!.render(
        <ParentSelfHealHarness
          authoritativeState={auth}
          viewState={null}
          isHighCardMode
        />,
      );
    });
    expect(container!.querySelector('[data-testid="parent-mounted"]')).not.toBeNull();
    expect(countCards()).toBe(6);
  });

  it('does NOT mount via self-heal when phase is pre-deal (dealer-select / dealing)', () => {
    fakeDeal = { phase: 'PRE_DEAL', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 0 };
    const auth = makeState({ phase: 'dealing' });
    act(() => {
      root!.render(<ParentSelfHealHarness authoritativeState={auth} viewState={null} />);
    });
    expect(container!.querySelector('[data-testid="parent-not-mounted"]')).not.toBeNull();
    expect(countCards()).toBe(0);
  });

  it('opponent authoritative hand count is available from the same state used to mount (proxy for card-back count)', () => {
    // The opponent card-back surface lives on the shared felt inside
    // CribbageMobileGameTable and cannot be re-hosted in this harness
    // without pulling in the full seat ring. We instead assert that the
    // authoritative state used by the mount gate exposes 6 cards for the
    // opponent, which the felt renders 1:1 as card backs. If this drifts,
    // opponent card-back rendering drifts with it.
    const auth = makeState({ phase: 'discarding' });
    expect(auth.playerStates.p2.hand.length).toBe(6);
    // And parent gate mounts (proof that opponent count is authoritative
    // during the same window that produces the local visible hand).
    fakeDeal = { phase: 'PRE_DEAL', expectedCount: 12, activeIntentsForHand: 0, settledCountForPlayer: 0 };
    act(() => {
      root!.render(<ParentSelfHealHarness authoritativeState={auth} viewState={null} />);
    });
    expect(container!.querySelector('[data-testid="parent-mounted"]')).not.toBeNull();
  });
});
