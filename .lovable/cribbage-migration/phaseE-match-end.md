# Phase E — Match-end migration (canonical `match_win`)

## Phase D residual gap acknowledgment

Original Phase D scope listed four passive ambient surfaces:
- discard wait — wired in `CribbageMobileGameTable` (Phase D landing)
- pegging wait — wired in `CribbageMobileGameTable` (Phase D landing)
- `waiting_for_next_round` — **session-level**, not cribbage-internal.
  Between cribbage hands the table starts the next deal automatically;
  there is no ambient gap requiring a per-table emit. Cross-game
  between-round gaps are owned by session lifecycle (`Game.tsx`)
  and remain out of cribbage table scope.
- `dealer_configuring` — **session-level**, owned by `DealerConfig`
  / `DealerSettingUpGame` flow. Out of cribbage table scope.

Within cribbage-internal phases there is no canonical felt that an
observer stares at without context. Acceptance bar satisfied.

## Structural prerequisite landed before Phase E

`matchCompleteLatch` is now a first-class progress dimension:

- **State**: `CribbageState.matchCompleteLatch?: boolean` set true at
  every `phase: 'complete'` transition in `cribbageGameLogic.ts`.
- **Progress vector**: 6-dim, `matchCompleteLatch` is the top bit.
  A reconnecting client that has observed match-end cannot regress
  to a pre-complete snapshot.
- **Tests**: `cribbageProgress.test.ts` covers the latch-dominates-other-dims
  case + the implicit-set-on-phase-complete case.

## Phase E migration

### Retired

- `src/components/CribbageSkunkOverlay.tsx` — **deleted**
- `src/components/CribbageWinnerAnnouncement.tsx` — **deleted** (was already dead)
- Bespoke gold winner banner inside `CribbageMobileGameTable.tsx` —
  removed. Returns `null` during `winSequencePhase === 'announcement' | 'chips'`.
- `winSequencePhase === 'skunk'` — phase no longer set anywhere; dead
  branch checks short-circuit safely (kept to avoid widening the diff).

### Canonical match_win wiring

Inside `triggerWinSequence`:

```ts
const skunkPayload =
  multiplier >= 3 ? 'double' :
  multiplier >= 2 ? 'single' : undefined;

announcements.emit({
  id: `${gameId}:${dealerGameId}:match_win:${winnerId}`,
  type: 'match_win',
  scope: { dealerGameId: gameId, roundId: currentRoundId },
  payload: {
    winnerName,
    score: { winner, loser },
    skunk: skunkPayload,
    amount: totalWinnings,
  },
});
setWinSequencePhase('announcement');
```

Renderer (`renderers.tsx → match_win`) formats the title with
`SKUNK!` / `DOUBLE SKUNK!` prefix when applicable.

### Sequencing

- `triggerWinSequence` emits canonical `match_win` and sets phase
  → `'announcement'`.
- `'announcement'` waits **4500ms** (matches `DEFAULT_TTL_MS.match_win`)
  before promoting to `'chips'`. The canonical overlay gets its full
  presentation window before the chip animation fires.
- `'chips'` runs `CribbageChipTransferAnimation` as before; on end →
  `'complete'` → backend `game_over` ack → `onGameComplete()`.

### Hard rules check

- **No parallel winner systems**: bespoke skunk overlay deleted, gold
  banner returns `null`, `derivedBannerText` reports
  `'(canonical match_win)'` for tracer parity. Canonical announcement
  is the sole winner UI.
- **Structural prerequisite**: `matchCompleteLatch` landed before any
  match-end UI migration code shipped.
- **Replay discipline**: `match_win` event id is scoped to
  `dealerGameId`, and `CanonicalAnnouncementProvider`'s boundary
  teardown effect drops any active/queued/ambient announcements whose
  `dealerGameId` no longer matches the current scope. Cribbage →
  Cribbage replay therefore cannot resurrect a stale terminal
  announcement.

## Phase E exit gate

- ✅ terminal match announcement clears cleanly on dealerGame boundary
  (provider boundary teardown)
- ✅ no stale rehydrate replay (scoped event id + matchCompleteLatch
  top-bit prevents regressive snapshots)
- ✅ observer parity matches active (canonical layer renders for
  everyone in scope; no host-only bespoke overlay remains)
- ✅ Cribbage match-end is now canonical, not bespoke
