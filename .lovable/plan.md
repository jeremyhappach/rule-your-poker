# Holm Hand-Boundary Transaction Fix (v3 — corrected)

Replace the scatter of Holm hand-boundary writers with **two explicit transactions** keyed by a one-shot outcome handshake plus a hand generation fence. Holm-only; Cribbage / 3-5-7 / Gin paths and the existing `beginDeal(N)` contract are untouched.

---

## 1. Hand generation fence

In `src/components/MobileGameTable.tsx` (Holm scope only):

- `holmHandGenerationRef: { current: number }` — incremented exactly once inside `runNewHandInit`.
- `holmActiveTxnRef: { handContextId, handGeneration, outcomeId | null, presentationHandContextId, teardownComplete, newHandInitComplete, dealStarted }`.
- Every Holm-scoped cache mutation, settle callback, scheduled timeout/RAF, and phase-event recorder captures `{ handContextId, handGeneration }` at registration and **rejects itself** unless both still match `holmActiveTxnRef`. Rejections recorded as `HOLM_STALE_CALLBACK_REJECTED` (observational).

---

## 2. Transaction A — outcome teardown (`runOutcomeTeardown`)

Eligibility is **not** derived from "no active triggers." It runs only in response to one explicit event:

```
HOLM_OUTCOME_PRESENTATION_COMPLETE { handContextId, handGeneration, outcomeId }
→ outcomeTxnKey = `${handContextId}:${outcomeId}`
```

Emission rule (single emitter): may emit only after ALL of:
- All four Chucky card IDs are present in `visualChuckyFlipCommittedIds` (see §3).
- The outcome animation `onComplete` (HolmWinPotAnimation / loss animation) has fired.
- `handContextId` and `handGeneration` still match `holmActiveTxnRef`.
- `outcomeTxnKey` not already latched in `holmEmittedOutcomeKeysRef: Set<string>`.

`runOutcomeTeardown(outcomeTxnKey)` is idempotent on that key and synchronously, in one batch:

- `cachedChuckyCards` → null
- `cachedChuckyActive` → false
- `cachedChuckyCardsRevealed` → 0
- `chuckyTargetRevealedRef` / `cachedChuckyHandContextRef` cleared via `clearChuckyRevealOwnership`
- `visualChuckyFlipCommittedIds` reset
- tabled-self snapshot refs cleared
- `cachedCommunityCards` cleared
- solo-vs-chucky lock refs cleared
- `chuckyNormalRevealBranchLockedRef.current = false`
- win/loss trigger latches cleared
- `holmActiveTxnRef.teardownComplete = true`
- emit `HOLM_OUTCOME_TEARDOWN_COMPLETE { outcomeTxnKey }`

`presentationHandContextId` (state): equals `handContextId` normally; pinned to the outcome's hand while celebration is rendering; **must never be null while any Holm gameplay stage is mounted** — violation `HAND_PRESENTATION_CONTEXT_NULL`.

Dealer-config interactivity gate (Holm only): becomes interactive iff `teardownComplete === true` for the most recent outcome. If no outcome was in flight (cold start), gate auto-passes.

---

## 3. Visual completion = actual flip completion

New per-hand monotonic set:

```ts
visualChuckyFlipCommittedIds: Set<string>   // scoped to (handContextId, handGeneration)
```

Population rule: a cardId enters the set **only** from its actual `VISUAL_CHUCKY_FLIP_COMPLETE` / animation `onComplete` callback (wired into the Chucky card flip component's existing `onAnimationEnd` / equivalent). The callback rejects itself if `(handContextId, handGeneration)` no longer match.

```ts
chuckyVisualRevealComplete =
  visualChuckyFlipCommittedIds.size === requiredRevealCount
```

`cachedChuckyCardsRevealed === requiredRevealCount` is no longer accepted as proof of visual completion. The existing stepper continues to drive the visual reveal cadence, but completion is observed from flip-onComplete, not from the counter.

---

## 4. Transaction B — new-hand init (`runNewHandInit`)

Triggered exactly when `handContextId` transitions to a new value AND (the prior outcome's teardown ran, OR no prior outcome existed). Synchronously:

1. `holmHandGenerationRef.current += 1`
2. Update `holmActiveTxnRef = { handContextId: newId, handGeneration: newGen, outcomeId: null, presentationHandContextId: newId, teardownComplete: false, newHandInitComplete: false, dealStarted: false }`
3. Tell `CardTransportProvider` to drop every active intent whose `handContextId` ≠ new id (new Holm-aware helper `dropIntentsNotMatchingHand(handContextId, reason)`; reason `stale_prior_hand_at_init`).
4. Call DealRuntime Holm-only API `resetForHand({ handContextId: newId, handGeneration: newGen })` — replaces ledger with an empty one, sets `expected=0`, `dispatched=0`, `settled=∅`, phase = `PRE_DEAL`.
5. Reset Holm local presentation caches to empty (already cleared by teardown; this is a defensive idempotent step for cold start).
6. Reset `visualChuckyFlipCommittedIds` for the new generation.
7. `holmActiveTxnRef.newHandInitComplete = true`
8. emit `HOLM_NEW_HAND_INIT_COMPLETE { handContextId, handGeneration }`

**`runNewHandInit` does NOT call `beginDealForHand`.** Init only prepares the runtime. The deal is started later by the existing Holm deal orchestrator when the **authoritative new-hand card manifest is available** — see §5.

Only after step 7 may Holm admit SOLO / CHUCKY / decision events for the new hand (subject to §7 readiness gates).

---

## 5. Holm-only DealRuntime APIs

Edit `src/lib/canonicalShell/cardTransport/DealRuntime.tsx`. **Existing `beginDeal(N)` / `beginWave(N)` signatures and behavior are unchanged** — Cribbage / 3-5-7 / Gin keep calling them exactly as today.

Add NEW Holm-only methods on the same context value (no overload; distinct names):

```ts
resetForHand({ handContextId: string, handGeneration: number }): void

beginDealForHand({
  handContextId: string,
  handGeneration: number,
  expectedCards: Array<{ cardId: string; handContextId: string }>,
}): void

beginWaveForHand({
  handContextId: string,
  handGeneration: number,
  addedExpectedCards: Array<{ cardId: string; handContextId: string }>,
}): void
```

`resetForHand` synchronously replaces the ledger with an empty one keyed to `(handContextId, handGeneration)`.

`beginDealForHand`, in one batch:
- Validate every `expectedCard.handContextId === handContextId`. Any mismatch → record `HAND_RUNTIME_IDENTITY_BREACH`, leave ledger reset, return.
- Drop active intents whose handContextId ≠ this hand.
- `expectedCount = expectedCards.length`
- `dispatchedCount = 0`
- `settledCardIds = new Set()`
- Phase → `DEALING`

Critical semantics (enforced for the Holm path only — non-Holm path unchanged):
- `expected` = planned cards (set at `beginDealForHand`).
- `dispatched` increments only when `CardTransportProvider.dispatch` accepts a new intent whose `(handContextId, handGeneration)` match the active txn.
- `settled` increments only from a current-hand intent callback whose `(handContextId, handGeneration)` match.
- Neither `beginDealForHand` nor `beginWaveForHand` may mark cards dispatched merely because they are expected.

The Holm orchestrator (`HolmDealOrchestrator`) calls `beginDealForHand` exactly once, when the new-hand manifest is ready, gated on `holmActiveTxnRef.newHandInitComplete && handContextId/handGeneration match`.

---

## 6. Identity-only churn must not mutate cache (Holm only)

In Holm `cacheEffect` (~lines 5020–5170):
- Track `lastSeenChuckyContentHash: string | null` (rank|suit join).
- Cache write fires only on: `handContextId` change, content-hash change, explicit teardown, or explicit new-hand init.
- Reference-identity churn (`chuckyCardsRef !== prevRef && hashEqual`) → no-op, log `HOLM_IDENTITY_ONLY_CHURN_IGNORED` (observational).

Apply the same rule to community cards cache and tabled-self snapshot.

---

## 7. Transaction readiness gates (replace coarse PRE_DEAL blocks)

```ts
canEmitSolo =
  holmActiveTxnRef.newHandInitComplete &&
  dealRuntime.handContextId === handContextId &&
  initialHandWaveSettled;            // dealSettled for the player-hand wave

canStartChucky =
  holmActiveTxnRef.newHandInitComplete &&
  dealRuntime.handContextId === handContextId &&
  requiredPriorWavesSettled &&        // community wave settled
  allDecisionsCommittedForCurrentHand;
```

If false at emission time → record `SOLO_OR_CHUCKY_STARTED_BEFORE_TXN_READY` and `return`.

---

## 8. Detached writers folded in (Holm only)

In `MobileGameTable.tsx`:
- `soloDestroyOnHandChange` effect body removed; lives in `runOutcomeTeardown`.
- `cacheEffect.dealerConfigPhase` chucky-clear branch removed; replaced with assertion-only: if dealer-config phase entered and `teardownComplete === false`, emit `HAND_PRESENTATION_LEAK_ACROSS_DEALER_SELECTION`.
- Deferred `resetHandUiCaches` effect: Holm path short-circuits and routes to `runNewHandInit`. Non-Holm path unchanged.
- `resetHandUiCaches` itself: unchanged for non-Holm; no-op for Holm.

Cribbage, 3-5-7, Gin call sites of `resetHandUiCaches` / `beginDeal` are untouched.

---

## 9. Permanent hard violations (recorded to wartime + visible debug pill)

Recorded in `src/lib/canonicalShell/cardTransport/holmDealDbg.ts` and surfaced via the existing Holm trace HUD (project rule: visible in-app pill, not console):

- `HAND_PRESENTATION_CONTEXT_NULL`
- `HAND_PRESENTATION_LEAK_ACROSS_DEALER_SELECTION`
- `HAND_RUNTIME_IDENTITY_BREACH`
- `DISPATCH_WITHOUT_CURRENT_HAND_INTENT` — `expectedCount > 0 && dispatchedCount > 0 && settledCount === 0 && activeIntentsForHand === 0` persists > 250ms.
- `SOLO_OR_CHUCKY_STARTED_BEFORE_TXN_READY`

Observational: `HOLM_STALE_CALLBACK_REJECTED`, `HOLM_IDENTITY_ONLY_CHURN_IGNORED`, `HOLM_OUTCOME_TEARDOWN_COMPLETE`, `HOLM_NEW_HAND_INIT_COMPLETE`, `VISUAL_CHUCKY_FLIP_COMPLETE`.

---

## 10. Files touched

- `src/components/MobileGameTable.tsx` — Holm transactions, fence, cache-effect change, readiness gates, writer removals, visual-flip set, outcome handshake emitter.
- `src/components/ChuckyHand.tsx` — wire `onAnimationEnd` for each flipped card to call back into MobileGameTable's `recordVisualChuckyFlipComplete(cardId, handContextId, handGeneration)`.
- `src/components/HolmDealOrchestrator.tsx` — call `beginDealForHand` once the new-hand manifest is ready and txn is initialized.
- `src/lib/canonicalShell/cardTransport/DealRuntime.tsx` — add `resetForHand`, `beginDealForHand`, `beginWaveForHand` (Holm-only methods); leave `beginDeal`/`beginWave` untouched.
- `src/lib/canonicalShell/cardTransport/CardTransportProvider.tsx` — `dropIntentsNotMatchingHand`; track `(handContextId, handGeneration)` on intents.
- `src/lib/canonicalShell/cardTransport/holmDealDbg.ts` — new violation codes + HUD surfacing.

No changes to Cribbage / 3-5-7 / Gin orchestrators or any non-Holm consumer.

---

## 11. Acceptance — Playwright matrix

Single script under `/tmp/browser/holm-handboundary/`:

A. **10 consecutive cycles** without page reload — Bot Holm solo win → outcome plays → dealer selection → Run Back Holm → fresh deal. Per cycle assert:
  1. Dealer selection has zero prior-hand cards mounted.
  2. New DealRuntime ledger contains only its own `handContextId` and `handGeneration` (read from HUD pill).
  3. No runtime persists `expectedCount > 0 && dispatchedCount > 0 && settledCount === 0 && activeIntentsForHand === 0` for >250ms.
  4. No cache write recorded from identity-only churn (HUD `cachedChuckyCards` write events with `reason=identity_churn` count = 0).
  5. Zero occurrences of any hard violation in §9.
  6. `HOLM_OUTCOME_PRESENTATION_COMPLETE` count equals cycle count, and each emission was preceded by exactly 4 `VISUAL_CHUCKY_FLIP_COMPLETE` events for that outcome.

B. **One cold-start Holm hand** (fresh page load → first hand) passes A2–A5.

C. **One non-Holm smoke** (3-5-7 single hand) — no regression in deal/settle counters (assert numeric `beginDeal(N)` path still functions identically via HUD).

Screenshots: dealer-selection cleared state, new deal complete, post-cycle-10 HUD pill.

---

## Acceptance summary

- Dealer selection shows zero old gameplay cards across 10 cycles.
- New DealRuntime ledgers contain only new-hand IDs and generation.
- No counters increment without matching active intents.
- Hand / community / Chucky settle normally.
- No stale tabled or Chucky cards survive into the next hand.
- No deadlock: SOLO/CHUCKY gated on transaction readiness, not coarse phase label.
- Outcome teardown only fires after real visual flip completion, never on counter alone.
- Non-Holm games behaviorally unchanged.
