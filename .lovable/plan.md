# Cribbage Canonical Migration — Architectural Plan (v2)

Invariant target (same as Gin proved):

> ONE TABLE · ONE FELT · ONE STAGE · NEVER REMOUNTS

PersistentTableShell stays mounted from session start to session end. PlayfieldSlotController owns the stage. Cribbage lifecycle states repopulate slot content; the shell, felt, and seat geometry never snap. All transient/ambient context flows through the canonical announcement system. Observer parity is mandatory at every state.

This is the plan only — no code changes in this wave.

**v2 refinements (locked in):**
1. Phase order revised so announcement primitives land before dealer-selection migration.
2. Cribbage progress-vector identity audit is **mandatory**, not conditional.
3. **Cribbage owns the slot for its entire lifecycle**: no intra-Cribbage neutral fallback.

---

## 0. Critical Lifecycle Ownership Rule

Once the dealer selects Cribbage, **Cribbage owns the slot continuously until match end.**

Acceptable transitions:

```text
Cribbage(A) ──▶ neutral dwell ──▶ Cribbage(B)        OK (dealerGame boundary)
Cribbage(A) ──▶ neutral dwell ──▶ Holm(B)            OK (game-type rollover)
```

Forbidden transitions:

```text
Cribbage dealer-select ──▶ neutral ──▶ Cribbage discard      FORBIDDEN
Cribbage discard       ──▶ neutral ──▶ Cribbage pegging      FORBIDDEN
Cribbage pegging       ──▶ neutral ──▶ Cribbage count        FORBIDDEN
```

Implications enforced throughout this plan:

- The slot identity for the entire match is `{ gameType: 'cribbage', dealerGameId }`. It does NOT change for dealer-selection / discard / cut / pegging / counting. Those are *internal* slot states represented by Cribbage-owned presentation data, not by slot identity churn.
- `PlayfieldSlotController.desiredIdentity` is set once Cribbage is chosen and held until dealerGame end. Lifecycle phases drive Cribbage internal rendering only.
- `SurfaceReadinessContract` for Cribbage reports `ready=true` for the slot at first paintable state (dealer-selection canonical layout) and stays ready for the duration of the match — readiness must not flap on intra-match phase transitions.
- Any code path that today nulls slot identity mid-Cribbage (returning to neutral or unmounting `CribbageMobileGameTable`) is a defect to fix during migration.

---

## 1. Lifecycle Inventory

```text
S0   session waiting                 (already canonical — out of Cribbage scope)
S1   dealer setup modal              (shell-overlay; dealer chooses Cribbage)
S2   dealer-selection: high-card draw — initial cohort
S2a  high-card reveal
S2b  high-card tie  → redraw cohort
S2c  high-card winner resolved → button assigned
S3   make-it-take-it edge / re-deal  (rules-permitting)
S4   deal hand (6 cards each)
S5   discard-to-crib
S5a  waiting on opponent discard      (ambient)
S6   cut card reveal (his-heels jack scores 2 to dealer)
S7   pegging
S7a  pegging — your turn
S7b  pegging — opponent turn (ambient)
S7c  go / 31 / last card events       (chip awards)
S8   hand scoring — count phase
S8a  non-dealer counts
S8b  dealer counts
S8c  crib counts (dealer)
S9   hand transition                  (advance handNumber, rotate dealer)
S10  round transition                 (config-dependent)
S11  match end                        (skunk / double-skunk + winner)
S12  next-game selection              (dealer setup, mid-session)
S13  same-game replay (Cribbage → Cribbage)
S14  observer-only passive states across all of the above
```

All of S2–S10 are **internal Cribbage slot states**. None of them release slot ownership.

---

## 2. Surface Ownership Audit

| Lifecycle | Current renderer | Disposition |
|---|---|---|
| S1 dealer setup | `DealerGameSetup` / `DealerConfig` | Shell modal overlay (interactive) — keep |
| S2 high-card draw | `HighCardDealerSelection`, `CribbageHighCardSelection` | Bespoke transient surface — **migrate into Cribbage slot content** |
| S2a/b/c reveals | `CribbageCutCardReveal` (partly), high-card internals | Slot reveal layer + announcement |
| S4 deal | `CribbageGameTable` / `CribbageMobileGameTable` | Slot content — already canonical-shaped, but currently re-mounts |
| S5 discard | `CribbageMobileCardsTab` + felt | Slot + seat content |
| S5a waiting | none / blank felt | **Gap → ambient `waiting_for_player`** |
| S6 cut reveal | `CribbageCutCardReveal` | Slot reveal + chip_award if his-heels |
| S7 pegging | `CribbageMobileGameTable`, `CribbagePlayingCard` | Slot content |
| S7c go/31/last | `CribbageChipTransferAnimation` | Chip transport + canonical `chip_award` |
| S8 counting | `CribbageCountingPhase` | Slot-internal reveal layer |
| S8 spotlight | `CribbageTurnSpotlight` | Keep, presentation-state-driven |
| S9/S10 transitions | implicit | **Gap → ambient `waiting_for_next_round`** |
| S11 match end | `CribbageWinnerAnnouncement`, `CribbageSkunkOverlay` | **Migrate → `match_win` (skunk via payload)** |
| S12 next-game | `DealerConfig` modal | Shell overlay + ambient `dealer_configuring` underneath |
| S13 replay | not explicitly handled | Identity boundary work (see §4) |
| S14 observer | sparse / blank | Ambient announcements at every state |

Components retired after migration:

- `CribbageWinnerAnnouncement.tsx`
- `CribbageSkunkOverlay.tsx` (folded into `match_win` payload renderer)
- `HighCardDealerSelection.tsx` (replaced by canonical Cribbage dealer-selection slot content)

Components retained (presentation-state-driven only):

- `CribbageMobileGameTable`, `CribbageFeltContent`, `CribbagePegBoard`, `CribbageMobileCardsTab`, `CribbageCountingPhase`, `CribbageTurnSpotlight`, `CribbagePlayingCard`, `CribbageChipTransferAnimation`.

Out of scope: hand history, desktop path, rule changes.

---

## 3. Canonical Mapping (per state)

Three render channels:

- **Slot content** — owned by `PlayfieldSlotController`, persistent across the Cribbage match.
- **Canonical announcements** — `CanonicalAnnouncementProvider` (transient + ambient).
- **Seat content** — per-seat hand / interaction inside shell seat anchors.

| State | Slot content | Announcement | Seat content |
|---|---|---|---|
| S2 draw | dealer-selection canonical layout (central draw zone) | ambient `dealer_selection_in_progress` `{ cohort }` | drawn card per seat |
| S2b tie | same slot, tie payload | ambient updated, new cohort id | redraw subset highlight |
| S2c winner | brief slot reveal | transient `dealer_selected` | button marker |
| S4 deal | Cribbage table | — | hand fills |
| S5 discard | Cribbage table + crib zone | ambient `waiting_for_player` when waiting | discard tray |
| S6 cut | starter card slot reveal | transient `chip_award` if his-heels | — |
| S7 peg | Cribbage table + peg row | ambient `waiting_for_player` on opponent's turn | active peg cards |
| S7c | — | transient `chip_award` | — |
| S8 count | counting overlay (slot-internal) | transient `round_win` for hand winner | — |
| S9/S10 | felt persists | ambient `waiting_for_next_round` | — |
| S11 match end | felt persists | transient `match_win` (skunk in payload) | — |
| S12 next-game | felt persists | ambient `dealer_configuring` | — |

### 3a. Announcement contract additions required (Phase B deliverable)

Today: `match_win`, `round_win`, `chip_award`, ambient `dealer_configuring`, `dealer_selection_in_progress`, `waiting_for_players`, `waiting_for_player`, `waiting_for_next_round`.

Cribbage adds:

- New transient `dealer_selected` — id `${dealerGameId}:dealer_selected`.
- `match_win` payload: `{ winnerName, score: { winner, loser }, skunk?: 'single' | 'double' }`.
- `round_win` payload: `{ winnerName, kind: 'hand' | 'crib', counts: { fifteens, pairs, runs, flush, his_nobs } }`.
- `dealer_selection_in_progress` ambient payload: `{ cohort: number, tie?: boolean }`.

Additive only — no behavior change for Gin/Holm/Yahtzee/Dice.

---

## 4. Identity Boundary Audit (mandatory pre-implementation)

Cribbage identity stack:

```text
sessionId
  └─ dealerGameId               (one Cribbage match)
       └─ handNumber            (one deal/peg/count cycle)
            └─ roundNumber      (Cribbage = 1 round per hand; field still required)
```

### 4a. Cribbage progress-vector audit

Required progress dimensions (existing `cribbageProgress.ts` must be verified to include ALL of these — gaps are migration work, not optional):

| Dim | Purpose | Identity expression |
|---|---|---|
| `dealerGameId` | match-level identity | uuid |
| `handNumber` | hand boundary | int |
| `roundNumber` | scope key compliance (Triple-Key Scoping) | int |
| `dealerSelectionCohort` | high-card cohort, increments on each tie redraw | int (0 = initial) |
| `dealerResolved` | dealer chosen latch | boolean / userId |
| `phase` | discrete sub-state: `dealer-select` \| `dealing` \| `discard` \| `cut` \| `pegging` \| `count-non-dealer` \| `count-dealer` \| `count-crib` \| `hand-complete` \| `match-complete` | enum |
| `peggingTurnOwner` | whose turn during pegging | userId |
| `peggingTurnSeq` | monotonic per-card play index in current pegging segment | int |
| `peggingSegmentSeq` | increments on go / 31 reset | int |
| `countOwner` | who is actively counting in S8 | userId |
| `cribCountOwner` | dealer (resolved separately for clarity) | userId |
| `handCompleteLatch` | hand fully scored & accounted | boolean |
| `matchCompleteLatch` | match terminal state reached | boolean |

Missing dims = pre-implementation migration item, not "if missing." This is a hard gate before Phase C.

Tiebreakers (per existing progress-vector tiebreaker memory): when two clients have equal vectors, content tiebreakers must include `peggingSegmentSeq` and `countOwner` so observers don't lock to a stale presentation.

### 4b. Boundary teardown rules

- **dealerGameId change** → clears all Cribbage slot internal state, ambient, transient, dedupe buckets. Slot identity flips to `{ cribbage, newDealerGameId }` via neutral dwell.
- **handNumber change within a dealerGame** → clears per-hand discard/peg/count local state. Slot stays mounted. Identity key for hand-bound state is `${dealerGameId}:${handNumber}`.
- **dealerSelectionCohort change** → clears per-cohort draw state and dedupe bucket for `dealer_selection_in_progress`. Identity key is `${dealerGameId}:dealer-selection:${cohort}`.
- **phase change** → presentation re-derives; no announcement teardown (ambient state replaces by type).
- **match end** → `match_win` transient + `matchCompleteLatch`. Slot stays mounted until either same-game replay (S13) or game-type rollover.

### 4c. Risk classes (carried from Gin lessons)

- **Null identity gap** — between dealerGame N teardown and N+1 bootstrap. Provider boundary teardown already handles ambient/transient cleanup. Confirm Cribbage hooks reset on `dealerGameId` flip, not on `gameType`.
- **Stale presentation hydrate** — Cribbage hooks must NOT replay completed-hand animations on hydrate. `useRef` source-level guards on every animation trigger.
- **Same-game replay bootstrap** — see §8.
- **Intra-match slot release** — see §0; any code path that nulls slot identity mid-match is a defect.

---

## 5. Observer-First Plan

| State | Active player | Observer |
|---|---|---|
| S2 draw | own draw + reveal | ambient `dealer_selection_in_progress` + per-seat draw cards |
| S2b tie | redraw prompt | ambient updated `{ tie: true, cohort }` |
| S2c winner | button assigned | transient `dealer_selected` |
| S5 discard (mine) | discard tray | ambient `waiting_for_player { name }` |
| S5 discard (theirs) | ambient `waiting_for_player` | same |
| S6 cut | reveal | reveal + his-heels chip_award if applicable |
| S7 my peg | hand UI | ambient `waiting_for_player` |
| S7 their peg | ambient `waiting_for_player` | same |
| S8 count | count overlay | count overlay (read-only) + transient `round_win` |
| S9/S10 | ambient `waiting_for_next_round` | same |
| S11 match end | `match_win` (with skunk payload) | same |
| S12 next-game | dealer modal over ambient `dealer_configuring` | ambient `dealer_configuring` only |

Acceptance check: an observer staring at the felt for 10s at any state knows what is happening. Blank felt is a defect.

---

## 6. Sync Framework Audit (Phase A deliverable)

Audit pass output = checklist of every raw-authoritative read in Cribbage rendering paths (memory rule: derive UI from `viewState`, never raw state).

Files in scope for read-only audit:

- `src/lib/cribbageGameLogic.ts`, `cribbageRoundLogic.ts`, `cribbageScoring.ts`
- `src/lib/cribbageBotLogic.ts` (must derive from authoritative DB state per existing rule)
- `src/lib/gameStateSync/cribbageProgress.ts` — verify §4a dims
- `src/components/CribbageMobileGameTable.tsx`, `CribbageFeltContent.tsx`
- `src/components/CribbageCountingPhase.tsx`, `CribbageCutCardReveal.tsx`, `CribbageTurnSpotlight.tsx`
- `src/lib/cribbageHandoffTrace.ts`, `cribbageSyncDiagnostics.ts` (presentation-side; verify only)

The deliverable is a written checklist; remediation lands during Phase C–F as each surface migrates.

---

## 7. Announcement Ownership (Cribbage day-1)

No bespoke announcement components allowed in Cribbage post-migration:

- Match winner → `match_win`.
- Skunk / double-skunk → `match_win` payload variant rendered by canonical renderer.
- Dealer selected → `dealer_selected` transient.
- Cut / his-heels → slot reveal + `chip_award`.
- Go / 31 / last card → `chip_award`.
- Hand winner → `round_win` `{ kind: 'hand' }`.
- Crib winner → `round_win` `{ kind: 'crib' }`.
- Waiting on X → ambient `waiting_for_player`.
- Between hands → ambient `waiting_for_next_round`.
- Dealer configuring → ambient `dealer_configuring`.

---

## 8. Same-Game Replay (Cribbage → Cribbage)

Mirrors Gin replay fix:

1. Old dealerGameId terminal state persisted (round inserted, accounting settled, `matchCompleteLatch` true).
2. Slot controller: `active(cribbage/A) → neutral(dwell) → active(cribbage/B)` after readiness probe binds B.
3. New dealerGameId bootstrap must not reuse stale Cribbage state:
   - All `useEffect` resets keyed on `dealerGameId` AND `handContextId` (`${dealerGameId}:${handNumber}`).
   - Bot/async controllers re-read authoritative state from DB on new dealerGame mount.
   - Announcement provider scope teardown drops all ambient/transient/dedupe for old dealerGameId.
   - `dealerSelectionCohort` resets to 0 in new dealerGame (it's part of the new dealerGameId's progress vector).
4. Verification: trigger Cribbage → Cribbage twice consecutively; confirm clean cohort id, clean peg/discard/count, observer parity.

---

## 9. Migration Sequencing (revised v2)

**Phase A — Audit & contract scaffolding** (no game code changes)
- Mandatory progress-vector audit per §4a; deliver dim checklist with remediation tasks.
- Sync framework raw-read audit per §6; deliver checklist.
- No edits to Cribbage rendering code in this phase.

**Phase B — Canonical announcement primitives readiness**
- Add `dealer_selected` transient type + renderer payload.
- Extend `match_win` payload + renderer (skunk variant).
- Extend `round_win` payload + renderer (`kind`, counts).
- Verify ambient `dealer_selection_in_progress`, `waiting_for_player`, `waiting_for_next_round`, `dealer_configuring` are fully wired and observer-visible end-to-end.
- Smoke via shell debug trigger across all 8 announcement types.
- Phase B exit gate: every announcement primitive Cribbage will use exists, has a renderer, and works with scoped dedupe + boundary teardown.

**Phase C — Cribbage dealer-selection canonical migration**
- Replace `HighCardDealerSelection` with canonical Cribbage slot content.
- Slot identity locks to `{ cribbage, dealerGameId }` at game-type selection and stays there for the entire match (§0 rule).
- Wire ambient `dealer_selection_in_progress { cohort }` and transient `dealer_selected`.
- Tie redraw spawns `dealerSelectionCohort + 1`.
- Observer parity verified.

**Phase D — Passive ambient lifecycle coverage**
- Emit ambient `waiting_for_player` from presentation state during S5a / S7b.
- Emit ambient `waiting_for_next_round` between hands (S9/S10).
- Emit ambient `dealer_configuring` while next-game modal is open (S12).
- Observer felt is never context-less after Phase D.

**Phase E — Match-end migration**
- Replace `CribbageWinnerAnnouncement` with `match_win` emit at `matchCompleteLatch`.
- Fold `CribbageSkunkOverlay` into `match_win` payload renderer.
- Delete `CribbageWinnerAnnouncement.tsx` and `CribbageSkunkOverlay.tsx`.
- Verify same-game-replay teardown.

**Phase F — Pegging chip_award + round_win wiring + replay validation + polish**
- His-heels → `chip_award` (2, "his heels").
- Pegging go/31/last → `chip_award`.
- Hand/crib count completion → `round_win` `{ kind }`.
- Same-game replay (S13) verification: Cribbage → Cribbage twice, no contamination.
- Confirm zero shell remounts and zero felt geometry snaps across full lifecycle.
- Remove temporary debug triggers and `HighCardDealerSelection.tsx`.

Each phase is independently shippable. No phase deletes a bespoke surface until its canonical replacement is wired and verified.

---

## 10. Acceptance Criteria

- `data-canonical-shell-root` is the same DOM node from session start through Cribbage match end through Cribbage replay start (mount-counter telemetry).
- Slot identity is `{ cribbage, dealerGameId }` continuously from game selection to match end. Zero intra-match slot identity flips. Zero intra-match neutral interstitial.
- Felt geometry does not snap between Cribbage states.
- Every passive lifecycle state produces an ambient announcement visible to observers.
- No Cribbage-bespoke announcement components remain in the import graph.
- Same-game replay (Cribbage → Cribbage) bootstraps cleanly with fresh dealer-selection cohort.
- Observer parity audit passes at every state.

---

## 11. Out of Scope

- Desktop path (deprecated).
- Hand history surfaces.
- Cribbage rule changes (muggins toggle, scoring corrections).
- Visual redesign — migration is structural; visual tuning is a separate wave.
