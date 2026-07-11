/**
 * countingTruthLedger — instrumentation-only bounded store proving the
 * relationship between Cribbage counting announcements, scoring-combo
 * highlight state, and scoring-card DOM state across a full hand+crib
 * counting round.
 *
 * NO behavior. NO backend writes. NO local/session storage.
 * NO console logs. NO incident pipeline.
 *
 * Consumers subscribe via useSyncExternalStore in CribbageCountingTruthPill.
 */

export interface CountingTruthDomCard {
  cardId: string;
  rank: string;
  suit: string;
  owner: string | null;
  role: 'self' | 'opponent' | 'crib' | 'cut' | 'unknown';
  scoringOwnerMatch: boolean;
  comboMember: boolean;
  highlighted: boolean;
  dimmed: boolean;
  transform: string;
  opacity: string;
  zIndex: string;
  rect: { x: number; y: number; w: number; h: number } | null;
  mounted: boolean;
  dataAttrs: Record<string, string>;
}

export interface CountingTruthEntry {
  ts: number;
  source:
    | 'baseline_init'
    | 'combo_announce'
    | 'zero_announce'
    | 'total_announce'
    | 'highlight_cleared'
    | 'target_advance'
    | 'exit_start'
    | 'completion'
    | 'win_frozen'
    | 'dom_sample';

  // Identity
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  scoringOwnerPlayerId: string | null;
  scoringOwnerRole: 'self' | 'opponent' | 'crib' | 'dealer' | null;
  scoringPhase: string | null;
  scoringSubphase: string | null;
  scoringHandKey: string | null;
  scoringStepIndex: number | null;
  totalCombosForOwner: number | null;
  isFinalComboForOwner: boolean | null;
  nextOwnerPlayerId: string | null;

  // Announcement
  announcementText: string | null;
  announcementCategory: 'combo' | 'zero' | 'total' | null;
  announcementOwnerPlayerId: string | null;
  announcementComboKey: number | null;
  announcementVisible: boolean;
  announcementMounted: boolean;
  announcementStartedAt: number | null;
  announcementHiddenAt: number | null;
  announcementClearReason: string | null;
  staleAnnouncementOwnerMismatch: boolean;
  staleAnnouncementComboMismatch: boolean;

  // Combo/highlight
  currentComboLabel: string | null;
  currentComboPoints: number | null;
  currentComboCardIds: string[];
  comboHighlightActive: boolean;
  comboRaiseActive: boolean;
  comboHighlightStartedAt: number | null;
  comboHighlightEndedAt: number | null;
  comboTransitionReason: string | null;
  previousComboIndex: number | null;
  nextComboIndex: number | null;

  // DOM cards (sampled by pill)
  domCards: CountingTruthDomCard[];

  // Total summary
  totalSummaryVisible: boolean;
  totalSummaryOwnerPlayerId: string | null;
  totalSummaryText: string | null;
  totalSummaryPoints: number | null;
  totalSummaryMountedAt: number | null;
  finalComboAnnouncementVisibleWhenSummaryMounts: boolean;
  finalComboAnnouncementVisibleWhenNextOwnerStarts: boolean;

  // Contradictions
  contradictions: {
    announcementVisibleAfterComboLowered: boolean;
    announcementOwnerMismatch: boolean;
    announcementComboMismatch: boolean;
    announcementVisibleDuringNextCombo: boolean;
    announcementVisibleDuringNextOwner: boolean;
    comboRaisedWithoutAnnouncement: boolean;
    announcementWithoutRaisedCombo: boolean;
    totalSummaryDelayedAfterFinalComboLowered: boolean;
    nextOwnerStartedBeforePriorAnnouncementCleared: boolean;
    domRaisedCardsDoNotMatchComboCardIds: boolean;
    domCardOwnerMismatch: boolean;
    duplicateScoringCardDomNodes: boolean;
    noRaisedCardsForActiveCombo: boolean;
  };
}

const MAX_ENTRIES = 400;

let entries: CountingTruthEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const countingTruthLedger = {
  get(): CountingTruthEntry[] {
    return entries;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  record(entry: Omit<CountingTruthEntry, 'ts'>): void {
    const next: CountingTruthEntry = { ts: Date.now(), ...entry };
    entries = entries.length >= MAX_ENTRIES
      ? [...entries.slice(entries.length - MAX_ENTRIES + 1), next]
      : [...entries, next];
    emit();
  },
  clear(): void {
    entries = [];
    emit();
  },
};

export function makeEmptyContradictions(): CountingTruthEntry['contradictions'] {
  return {
    announcementVisibleAfterComboLowered: false,
    announcementOwnerMismatch: false,
    announcementComboMismatch: false,
    announcementVisibleDuringNextCombo: false,
    announcementVisibleDuringNextOwner: false,
    comboRaisedWithoutAnnouncement: false,
    announcementWithoutRaisedCombo: false,
    totalSummaryDelayedAfterFinalComboLowered: false,
    nextOwnerStartedBeforePriorAnnouncementCleared: false,
    domRaisedCardsDoNotMatchComboCardIds: false,
    domCardOwnerMismatch: false,
    duplicateScoringCardDomNodes: false,
    noRaisedCardsForActiveCombo: false,
  };
}
