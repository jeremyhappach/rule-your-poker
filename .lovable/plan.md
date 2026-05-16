## Goal

Eliminate stale-identity blind windows as a **class** by moving identity-boundary handling into the sync framework instead of patching each game.

The defining failure: a client subscribes / polls **only the currently known round**, but authoritative state advances to a new round on the server. The client's listeners cannot observe the new round and the local presentation stays internally consistent but globally stale, until a separate parent watcher hydrates a new `roundId` prop.

---

## Audit Findings

### 1. Subscription topology (per game)

| Game | Realtime channel filter | Polling key | Identity-boundary watcher |
|---|---|---|---|
| Cribbage (mobile) | `rounds id=eq.${currentRoundId}` | `rounds.id = currentRoundId` | `Game.tsx` watches `games` + `dealer_games` and re-derives `currentRound` from `rounds` list |
| Cribbage (desktop, deprecated) | `rounds id=eq.${roundId}` | — | parent prop |
| Gin Rummy | `rounds id=eq.${roundId}` | parent re-fetch | parent prop |
| Holm | parent-driven via `Game.tsx` (`games id=eq.${gameId}` + rounds re-fetch) | parent polling | parent prop |
| 3-5-7 | parent-driven; round_number cycles, hand_number is the identity dimension | parent polling | parent prop |
| Yahtzee | parent-driven, single continuous game (no round boundary) | parent polling | n/a |
| Horses / SCC | parent-driven, dice round identity from `dealer_games` + rounds | parent polling | parent prop |

### 2. Root structural defect

Game-table components scope their **own** realtime subscription to **the current round id only**. The only thing that can detect "round advanced" is the parent `Game.tsx` page, which watches the wider `games` / `dealer_games` rows and re-derives the `currentRound`. Between:

1. peer client writes new round → DB
2. parent page receives `games`/`dealer_games` update → re-fetches rounds → recomputes `currentRoundId`
3. new `currentRoundId` prop flows down → child resubscribes

…the child component is **structurally blind**. Its presentation state is correctly the OLD round; nothing locally can know it is stale. Cribbage manifests this most visibly because the OLD round's `phase==='complete'` state remains interactive (the stale-discard bug). Other games hide it behind freezes, overlays, or animation barriers — same underlying class.

### 3. Three-layer sync framework gap

`useGameStateSync` does the right thing **within an identity**: progress vector blocks regressive snapshots, optimistic→authoritative promotion is correct, visual contracts protect animations. But the framework has **no identity awareness**. `reset(newInitial)` is invoked externally by each game whenever the parent decides identity advanced. There is no canonical "authoritative actionable identity" feed that the framework owns.

### 4. Per-game identity-mismatch logic is duplicated and divergent

- Cribbage: `interactionsAllowed = renderHandKey === currentHandKey && currentRoundId === roundId && currentHandNumber === handNumber` + `isStaleCompleteAwaitingNext` latch + proactive reset effect.
- Gin Rummy: roundId-keyed reset, no equivalent stale-complete handling.
- Holm / 3-5-7 / Horses: ad hoc — rely on parent unmounting or rerender.

Every game reinvents the gate and the reset trigger. The conditions for "are we blind right now?" are not encoded anywhere reusable.

---

## Architectural Recommendation

### Canonical identity continuity model

Adopt a single **AuthoritativeIdentity** object as the framework-level progression source:

```ts
type AuthoritativeIdentity = {
  dealerGameId: string | null;
  handNumber: number | null;
  roundId: string | null;
  // optional, game-defined
  phaseOrdinal?: number;
};
```

**One feed, one writer, one identity comparator** — owned by `Game.tsx` (or a thin hook `useAuthoritativeIdentity(gameId)`), driven by a session-scoped subscription to `dealer_games` + `rounds` filtered by `dealer_game_id` (NOT by `round_id`). This subscription survives round boundaries by construction.

### Framework changes

Extend `useGameStateSync` with identity awareness:

```ts
useGameStateSync(initial, {
  ...,
  identity: AuthoritativeIdentity,      // current authoritative identity
  identityEquals?: (a, b) => boolean,   // default: deep equal on the 3 keys
});

handle.presentationIdentity            // identity attached to current presentation
handle.isIdentityStale                 // presentationIdentity !== identity
handle.interactionsAllowed             // !isFrozen && !isVisualContractActive && !isIdentityStale
```

Behavior:

1. **On identity change** (framework-detected, not game-detected):
   - If presentation was already in a terminal/complete phase for the OLD identity → **immediately** clear presentation + authoritative, mark `pendingPostResetHydration = true` (same path as today's `reset(null)`).
   - If presentation is mid-animation under a visual contract → contract abort with reason `'identity-advanced'`, then reset.
   - Hydration of the NEW identity proceeds via the next `receiveAuthoritativeUpdate` (now arriving from the long-lived `dealer_game_id`-scoped subscription).

2. **Render/action invariant** (framework-enforced, single source of truth):
   - `interactionsAllowed === false` ⇒ game tables must render a safe placeholder and short-circuit input handlers.
   - Replace every per-game `interactionsAllowed`/`activeHandBlocked`/`isStaleCompleteAwaitingNext` computation with the framework value.

3. **Per-game animation latches remain unchanged**:
   - Cut-card module registry, dice rollKeys, Chucky, held dice, announcements — all stay identity-scoped and survive on top of correct continuity (no change needed beyond keying by the framework's `presentationIdentity`).

### Subscription topology rule

Codify a single rule:

> **A game-table component MUST NOT scope its realtime subscription by `round_id`.**
> All identity-bearing subscriptions are scoped by `dealer_game_id` (or `game_id` for single-round games) and filtered client-side by the current authoritative identity.

The framework's `useAuthoritativeIdentity` hook owns this subscription and exposes `(identity, rounds[])`. Game tables consume the identity + read the matching round, so they cannot become blind when the round changes.

---

## Implementation Plan

Smallest safe change ordered for incremental rollout, starting with the games where this manifests:

### Phase 1 — Framework primitives (no game changes)

1. Add `src/lib/gameStateSync/authoritativeIdentity.ts`:
   - `type AuthoritativeIdentity`
   - `identityEquals(a, b)`
   - `useAuthoritativeIdentity(gameId)` hook: one realtime channel filtered by `dealer_game_id=eq.${dealerGameId}` on `rounds` + `dealer_games`, returns `{ identity, rounds }`. Survives round boundaries.

2. Extend `useGameStateSync` config to accept `identity: AuthoritativeIdentity` and add:
   - `presentationIdentityRef` (set on every accepted update + on reset)
   - `isIdentityStale` computed from current `identity` prop vs `presentationIdentityRef`
   - `interactionsAllowed` derived value
   - Auto-reset effect: when `identity` changes vs the last accepted one, call the existing reset path (with visual-contract abort if needed). Emits `framework-identity-advanced` event.

3. Unit tests covering: OLD→NEW direct advance, OLD→null→NEW bounce suppression, contract-active advance, complete-phase advance.

### Phase 2 — Cribbage cutover (highest-value, fix already half-built here)

4. `CribbageMobileGameTable` consumes `useAuthoritativeIdentity` instead of relying on parent props for `currentRoundId` / `currentHandNumber`.
5. Replace `interactionsAllowed`, `isStaleCompleteAwaitingNext`, and the proactive-reset effect with framework values.
6. Remove the round-scoped realtime subscription (`cribbage-mobile-${currentRoundId}`); polling and realtime now flow through the identity hook.
7. Keep cut-card module registry as-is.

### Phase 3 — Gin Rummy cutover

8. Same swap. Removes the `gin-rummy-${roundId}` channel.

### Phase 4 — Holm, 3-5-7, Horses, SCC cutover

9. Each game replaces its parent-driven prop-comparison checks with the framework `interactionsAllowed` gate. Subscriptions migrate to `dealer_game_id` scope.

### Phase 5 — Enforcement

10. Add an ESLint rule (or a CI grep guard) that fails on `\.channel\([^)]*\$\{[^}]*roundId\}` patterns in `src/components/*GameTable*.tsx`.
11. Update `INTEGRATION_CHECKLIST.md` with the new rule and the new framework hooks.

---

## Technical Notes

- `useAuthoritativeIdentity` MUST subscribe to `dealer_games` AND `rounds` (filter `dealer_game_id=eq.X`). `rounds` INSERT events are what announce new-round identity advance. Today, no per-game subscription listens for INSERT — only UPDATE on a known id — which is exactly why blind windows exist.
- Identity hashing must include `handNumber` because 3-5-7 cycles `round_number` 1/2/3 per hand and Cribbage hand identity needs both.
- The framework's auto-reset replaces the manually-wired `syncHandle.reset(null)` calls in each game. Games may still call `reset()` for non-identity reasons (debug, error recovery).
- Visual contracts already handle `reset-boundary` abort; the new path reuses that with reason `'identity-advanced'`.
- No DB/schema changes. No game-logic changes. No edge-function changes. Purely client-side framework + per-game wiring.

---

## Risk / Rollout

- Phase 1 ships dark (no game uses it). Zero risk.
- Phase 2 (Cribbage) is the canary; if it regresses, revert by un-wiring the identity prop — framework falls back to current `reset()`-driven behavior.
- Per-game migrations are independent; framework supports both old (manual reset) and new (identity-driven reset) modes during transition.
- Removing round-scoped channels reduces channel count per game from 2 to 1 — a small Realtime-server load reduction, not a regression risk.

---

## Out of Scope (explicit)

- No changes to game scoring, bot logic, or timeout policy.
- No changes to visual contract semantics.
- No changes to per-game animation latches (cut-card, dice, etc.).
- No desktop-path work (deprecated).

---

## Phase 2 Cribbage Cutover — Shipped

### Identity semantics

**A. Forward-identity dimensions (Cribbage):** `(handNumber, roundId)` scoped by `dealerGameId`. Compared via `isIdentityForward` from `authoritativeIdentityPure`. `handNumber` is the dominant axis; `roundId` is a tiebreaker for distinct rounds at the same hand number (transitional states).

**B. Stale snapshot after identity advance:** Rejected. The framework auto-reset effect fires on forward advance, stamping the new identity onto `presentationIdentityRef` and aborting any active visual contract with reason `reset-boundary`. The local `lastObservedIdentityRef` effect clears `cribbageState`. Any inbound snapshot whose progress vector regresses against the (just-reset) authoritative state is rejected by `compareProgress` in `receiveAuthoritativeUpdate`. No replay, no remount weirdness — animation latches (cut-card module registry) are keyed by `dealerGameId + handNumber`, not roundId, so they don't refire on the reset.

**C. Reconnect / restore serving older identity:** `isIdentityForward` returns false for non-forward changes. The framework's identity-advancement effect explicitly handles the non-forward branch by silently adopting the new identity (`setPresentationIdentity`) without firing the reset cascade. The local `lastObservedIdentityRef` effect requires `isIdentityForward(prev, next)` and therefore does NOT clear `cribbageState` on a restore-to-older path. The next round-id-scoped snapshot subscription rebinds normally.

**D. Identity feed = hand N+1 but snapshot feed = hand N:** During this window `syncHandle.isIdentityStale === true` and `syncHandle.interactionsAllowed === false`. Render path: `isStaleCompleteAwaitingNext` → `isBootstrapMode === true` → felt drops to "Preparing next hand…" shell. No stale gameplay surface; no interactive cards; writers short-circuit.

### Defense in depth (writer guards)

All three writers (`handleDiscard`, `handlePlayCard`, `handleGo`) require **both**:
- `interactionsAllowedRef.current` — local identity-chain match (renderHandKey == currentHandKey, currentRoundId == roundId prop, currentHandNumber == handNumber prop).
- `frameworkInteractionsAllowedRef.current` — framework gate (`!isFrozen && !isVisualContractActive && !isIdentityStale`).

A violation in either path suppresses the write and emits `crib-stale-action-suppressed` to `debug_events`.

### Listener lifecycle

- `useAuthoritativeIdentity` subscribes to `rounds` filtered by `dealer_game_id`. Tear-down via `supabase.removeChannel` in the effect cleanup. Re-keys ONLY on `dealerGameId` change.
- Per-round `cribbage-mobile-${currentRoundId}` subscription retained for snapshot delivery; tears down + recreates when `currentRoundId` changes (which now follows the dealer-game-scoped identity feed → no blind window).
- No orphan subscriptions across dealer-game transitions: identity hook tears down on `dealerGameId` change; snapshot channel tears down on `currentRoundId` change. Both have explicit cleanup paths.

### Out of scope (Phase 2)

No changes to Holm / Yahtzee / Gin / Horses / SCC / 3-5-7. Cribbage proves the architecture first; per-game identity semantics will be audited individually before broader rollout.

---

## Phase 2.5 — P0 fix: stuck client after asymmetric jitter

### Forensic root cause (proven from `debug_sync_events` repro game `b5d81d6d`)

- Auth identity feed correctly observed `{hand:3, round:d55bcb45}` (captured in `crib-identity-divergence` payloads).
- Local `currentRoundId` wedged at the old `d2ed0f5f`, because:
  1. `defaultPickActiveRound` was **not monotonic**; a `regressive-identity` event proves auth flipped backward from hand 3 → 2 on a realtime jitter.
  2. The Cribbage merge contained two regression vectors: an equal-hand branch that overwrote `currentRoundId` with whatever `incomingRoundId` happened to be that tick, and a fallback that defaulted `incomingRoundId` to the **stale parent prop** whenever auth was momentarily behind.
- Once `currentRoundId` regressed, the per-round subscription (`cribbage-mobile-${currentRoundId}`, filter `id=eq.${currentRoundId}`) re-keyed backward → structurally blind to the new round → "Preparing next hand" terminal state.

### Framework fixes

1. **`useAuthoritativeIdentity` is now monotonic-forward-only.**
   - A `monotonicIdentityRef` latches the highest observed identity for the current `dealerGameId`.
   - Regressive ticks are suppressed and emit `framework-regressive-identity-suppressed` (severity warn).
   - The latch resets only on `dealerGameId` change (no public rollback API yet; an explicit administrative rollback must clear it when introduced).

2. **`useGameStateSync` identity-advance reset fires on first actionable divergence.**
   - `presentationIdentityRef` is no longer seeded with the initial `identityProp` at mount (the previous seed could cause the auto-reset effect to early-return when its `prev` already equalled the first observation, even with stale presentation underneath).
   - First observation is adopted silently (no stale presentation to clear). Every subsequent forward divergence invokes `reset()` and emits both `framework-identity-advanced` and the new `framework-identity-reset-fired` event.

### Cribbage fixes

3. **Equal-hand regression branch removed.** `setCurrentRoundId` now only accepts an incoming round id when `isIdentityForward(prevIdent, nextIdent)` is true. Equal-hand-different-roundId is permitted only via the framework-monotonic auth feed (covers the race where `hand_number` lags a freshly inserted round row).

4. **Auth wins over lagging props.** The merge picks `authIdentity.roundId` whenever `authHand >= propHand` (i.e. auth is forward-of-or-equal). The prop is consulted only when auth has not yet caught up to the prop hand. Props are advisory; they may never overwrite a forward authoritative identity.

### Topology

5. **Per-round snapshot channel is retained**, now safe because `currentRoundId` advancement is provably monotonic and driven by the authoritative feed. Forward re-key is the only possible motion; backward re-key is impossible.

### Recovery guarantee

6. With monotonic identity + monotonic `currentRoundId`, the per-round channel always re-keys onto the latest authoritative round within one render of an auth advance. The existing polling fallback runs against the same `currentRoundId` so it also recovers automatically. Permanent bootstrap deadlock is structurally impossible.

### Observability

New deterministic events:
- `framework-regressive-identity-suppressed` (warn, `gameType: framework`) — fires whenever `pickActiveRound` would have moved the identity backward and the monotonic latch held the prior value.
- `framework-identity-reset-fired` (info, per game type) — fires after the framework auto-reset effect calls `reset()` in response to a forward identity divergence.

### Files changed

- `src/lib/gameStateSync/authoritativeIdentity.ts` — monotonic latch + suppressed-regression event.
- `src/lib/gameStateSync/useGameStateSync.ts` — drop init seed of `presentationIdentityRef`; emit `framework-identity-reset-fired`.
- `src/components/CribbageMobileGameTable.tsx` — strict forward-only merge using `isIdentityForward`; auth always wins over lagging props.
