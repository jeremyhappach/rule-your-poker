# 3-5-7 · Opponent Showdown Hold — presentation-only hold

## Contract recap

- Real game, real flow. No fixtures, no route, no fake shell.
- Selecting the harness in Game Defaults arms a single client-presentation hold at the real 3-5-7 opponent-exposed showdown boundary.
- CONTINUE HAND releases the hold once and yields back to the live pipeline. No RPC, no server writes, no recompute, no timers, no new round.

## Entry point

`src/lib/debugHarness/profiles.ts` — under existing `'3-5-7'` key add:

```ts
{ id: 'opponent_showdown_hold',
  label: 'Opponent Showdown Hold',
  description: 'Real-game presentation hold at the opponent exposed showdown boundary. CONTINUE HAND releases.' }
```

`useDebugHarness('3-5-7')` already validates against the registry, so the dropdown picks it up automatically. No change to `GameDefaultsConfig.tsx`.

## Hold boundary

The real boundary already exists in `src/components/MobileGameTable.tsx`:

- `is357MultiPlayerShowdown` (line ~2953) — `(round 2 || 3) && stayedPlayersCount>=2 && (allDecisionsIn || awaitingNextRound)`
- `is357Round3MultiPlayerShowdown` (line ~2950)
- per-seat `isShowdown` derivation (line ~7025) gated on real exposed cards present.

The hold ARMS when **all** of:
1. `gameType` is the 3-5-7 family
2. `useDebugHarness('3-5-7') === 'opponent_showdown_hold'`
3. `is357MultiPlayerShowdown === true`
4. At least one opponent seat has rendered exposed cards (`hasExposedCards`) — confirms the row is fully eligible and mounted.

Once armed, the hold latches:
- `heldHandContextId` (current `handContextId`)
- `heldGameId` (current `gameId`)
- `heldRound` (`currentRound` snapshot)
- `heldDealerGameId` (current `dealerGameId`)

The hold does NOT cache cards — the live exposed-card subtree continues to render from authoritative state until the round transitions; only the *post-showdown presentation transition* is suppressed. (Server is free to advance; if it does, the auto-release rules below fire.)

## What the hold suppresses (presentation only)

While `holdActive`:
- Win-celebration overlay (`LegEarnedAnimation`, `LegsToPlayerAnimation`, `PotToPlayerAnimation` for 3-5-7 — gated by `threeFiveSevenWinPhase`/`threeFiveSevenWinTriggerId`) is masked at render time via a prop passed to MobileGameTable: `threeFiveSevenPresentationHold: boolean`.
- Active-player decision strip render (the `currentPlayer.auto_fold / canDecide` block at ~line 10611) is hidden for the local viewer when the hold is active (replaced by the CONTINUE HAND row described below).
- Next-hand presentation (the `awaitingNextRound`-driven UI swap to ante/deal of the next hand) is masked behind the same prop: keep showing the held showdown layout until release.

No game-logic decisions change. No timer is suppressed; the deadline enforcer is server-side and out of scope. If the server progresses anyway, auto-release fires (see Safety).

## Action Pane integration

The real shell "Action Pane" for 3-5-7 today is the stable-height strip at `MobileGameTable.tsx:10611-10721`. While the hold is active and `gameType` is 3-5-7, that strip renders a single CONTINUE HAND button instead of the decision/auto-fold/badge variants:

```tsx
{holdActive ? (
  <Button onClick={releaseHold} className="...">CONTINUE HAND</Button>
) : (
  /* existing 10624-10720 ladder unchanged */
)}
```

This reuses the real shell pane — no new container, no portal.

## Hold owner

A new minimal hook + ref lives at the Game.tsx scope (the shell-owned coordinator):

`src/lib/threeFiveSeven/useOpponentShowdownHold.ts` (new, ~60 LOC) — owns:
- `holdActive: boolean`
- `armIfEligible({gameId, gameType, dealerGameId, handContextId, currentRound, isShowdown, hasAnyExposedCards, harnessId})`
- `release()` — single-shot; clears latch
- auto-release rules (see Safety).

Game.tsx imports the hook, calls `armIfEligible` in a `useEffect` keyed on its existing showdown signals, and threads `holdActive` + `releaseHold` into `<MobileGameTable>` as two new optional props:
- `threeFiveSevenPresentationHold?: boolean`
- `onThreeFiveSevenPresentationHoldRelease?: () => void`

MobileGameTable uses them only in:
1. The Action Pane swap above.
2. Three `&&`-guards around the 3-5-7 win-overlay components.
3. One guard around the next-hand swap (suppress the `awaitingNextRound` driven re-mount of the active-self-hand pane while held).

No edits in `PlayerHand`, `CanonicalSeatCluster`, `showdownConfig`, server, RPC layer, or game logic.

## Safety / teardown (auto-release, all in the hook)

`release()` is called immediately when ANY of these change away from the latched identity:
- `harnessId !== 'opponent_showdown_hold'`
- `gameId !== heldGameId`
- `dealerGameId !== heldDealerGameId`
- `handContextId !== heldHandContextId`
- `currentRound !== heldRound`
- `gameType` family changes off 3-5-7
- MobileGameTable unmounts (hook cleanup)
- Run It Back fires (existing `runItBack` trigger observed by Game.tsx — we hook the same signal)

After auto-release the latch is empty and nothing is preserved.

## Toggle-off contract

When `useDebugHarness('3-5-7') !== 'opponent_showdown_hold'`:
- `armIfEligible` no-ops, `holdActive` stays `false`.
- All three MobileGameTable guards collapse to their existing branches.
- No CONTINUE HAND button. No code path differs from today.

## Files touched (final list)

1. `src/lib/debugHarness/profiles.ts` — +1 profile entry.
2. `src/lib/threeFiveSeven/useOpponentShowdownHold.ts` — NEW, ~60 LOC.
3. `src/pages/Game.tsx` — import hook, call `armIfEligible`, pass 2 props into MobileGameTable. ~15 LOC.
4. `src/components/MobileGameTable.tsx` — accept 2 props; gate Action Pane swap + 3-5-7 win overlays + awaiting-next swap. ~25 LOC, no logic refactor.

Total: 4 files, ~100 LOC additive, no edits to PlayerHand / CanonicalSeatCluster / showdownConfig / RPC / edge functions / timers / deal pipeline / game rules.

## Confirmation

- No server / RPC / edge function / migration code touched.
- No timer, deadline, or scheduler touched.
- No deal-pipeline, orchestrator, or game-rule logic touched.
- No PlayerHand / CanonicalSeatCluster / showdownConfig changes.
- Typecheck only — no Playwright run unless requested.

## Return on completion

- Final changed files / line ranges
- Registry entry id + label
- Exact `holdActive` arm condition expression
- Real Action Pane swap site (MobileGameTable.tsx line range)
- Identity fields retained for safety (list)
- Typecheck status
