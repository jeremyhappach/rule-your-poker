
Two independent patches. Existing forensics stay in place. No new instrumentation.

## A. Self-timer ownership correction

**Server owns when the countdown begins. Client never starts it earlier.**

1. **Server: defer + atomically reissue `decision_deadline` at every actionability commit**
   - Audit every Holm writer touching `rounds.decision_deadline` — round insert, post-deal status flip, turn handoff, **pause/resume**, **reconnect/recovery**, retry.
   - PRE_DEAL / DEALING / paused / pending-recovery states: `decision_deadline = null`; `status ≠ 'betting'` and/or `current_turn_position = null` as applicable.
   - Every actionability commit (initial deal completion, normal turn handoff, resume-from-pause, reconnect re-entry, recovery retry) is one atomic mutation writing all three together:
     - `status = 'betting'`
     - `current_turn_position = <actor>`
     - `decision_deadline = now() + fullTurnDurationSeconds`
   - No split commits (no earlier `status='betting'` followed later by a deadline write).

2. **Client gate (belt-and-suspenders)** — `src/pages/Game.tsx:3206–3345`
   - Gate countdown projection purely on authoritative server fields: `round.status === 'betting'` AND `current_turn_position != null` AND `decision_deadline != null`. Else `setTimeLeft(null)`, skip interval.
   - Remaining seconds: `Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))`. Never floor.
   - Do NOT observe DealRuntime here. No child state leakage upward.

3. **Presentation/actionability gate stays canonical** — `src/lib/canonicalShell/ActivePlayerHUD.tsx:120–129`
   - Remove the `isHolm` short-circuit; always call `getCanonicalTimerEligibility`. The Holm branch already requires `dealSettled && readyReleased`.

4. **MobilePlayerTimer: authoritative deadline + segment identity** — `src/components/MobilePlayerTimer.tsx`
   - New prop `deadlineMs: number | null` (epoch ms). When present, `runActivationCapture` seeds `segmentDeadlineMsRef = deadlineMs`, `segmentDurationMsRef = fullTurnDurationMs`. Never seed from `timeLeft`.
   - `timeLeft` becomes display-only.
   - Activation/reset identity (current `activationKey`) must include `{ roundId, currentTurnPosition, decisionDeadlineMs }`. Any change = exactly one new segment.
   - `ActivePlayerHUD` forwards `deadlineMs` derived from the authoritative `decisionDeadline` already threaded `Game.tsx` → `MobileGameTable`.

**Acceptance.** No countdown before actionability. Every fresh server deadline produces exactly one fresh segment. Under sub-second server-to-client propagation the first visible label is full; under longer propagation it reflects the authoritative remaining time via ceiling projection and never invents client-owned grace. Descent is monotonic. Pause/resume + reconnect each create a new full server segment.

## B. Run-Back: physical-provenance admission + fail-closed stale invalidation + pending-HCI suppression

1. **Fail-closed stale-stage reads** — `src/components/MobileGameTable.tsx`
   - Inline at every read site of `tabledSelfStickyRef` and `lonePlayerStageSnapshotRef`, before deriving `activeSnap` or mounting `HolmLonePlayerFan`:
     ```
     const stickyIsCurrent =
       currentHandContextId != null &&
       sticky.handContextId === currentHandContextId;
     ```
     When false: do not read sticky, do not mount fan from it, clear immediately where safe.
   - Update release predicate at 8969–8974 to use the same check (drop `handContextId &&` truthiness).
   - Boundary-clear effect on `[handContextId, dealerGameId]` is hygiene only; correctness lives at the read site.

2. **Server-issued physical provenance on player-cards**
   - **Provisioning**: insert the new round's `player_cards` rows **before, or atomically with**, the server transition that makes the hand advance. Client admission is fail-closed, never the sole guarantor of delivery.
   - **Identity columns**: `player_cards` rows carry `round_id` already; add immutable `hand_context_id` if not present.
   - **`source_version` is a coherent hand-payload revision** — server-issued, generated **once per `(player_id, round_id, hand_context_id)` provisioning/update transaction**, and stamped **identically on every card row** in that payload batch. Do **not** use independently incrementing per-row versions. The value is monotonic for the `(player_id, round_id, hand_context_id)` tuple.
   - **Server-side fetch scope**: every Holm player-cards fetch/subscription filter is `player_id + round_id` (and `hand_context_id` where stored) — not just a client-side selector.
   - **Coherent assembly**: fetch/subscription assembly returns cards from **one coherent payload revision only**. Never merge rows from differing `source_version` values into one admitted hand. If a batch read straddles a revision boundary, discard and refetch.
   - **Payload shape**: `{ cards, roundId, handContextId, sourceVersion }` (single `sourceVersion` for the whole payload).
   - **Acceptance rules in client**:
     - Different `handContextId`/`roundId` than active HCI → reject unconditionally.
     - Same HCI but `sourceVersion < latestAcceptedSourceVersion[HCI]` → reject.
     - Mixed `sourceVersion` across rows of one assembled payload → reject (assembly bug); refetch.
     - Else accept; update `latestAcceptedSourceVersion[HCI]`.

3. **Client state + HCI-bound idempotent refetch**
   - `playerCards` in `Game.tsx` stores the structured payload, not bare card arrays.
   - Selector `rawCurrentPlayerCards` filters by `player_id` AND current `roundId`/HCI.
   - On every new HCI, issue exactly one HCI-bound fetch. **Dedupe by HCI** with a per-HCI in-flight ref/map so React rerenders or effect replay cannot launch multiple logically independent admissions for one hand. Prior-HCI in-flight requests are abandoned (responses rejected by the acceptance rules).

4. **Pending-HCI suppression — hard boundary** — `src/components/MobileGameTable.tsx` + `src/components/HolmDealOrchestrator.tsx`
   - `selfHand === null` is a hard PENDING boundary. While pending for the current HCI:
     - No prior-HCI DealRuntime instance remains mounted/active (identity-keyed unmount of orchestrator/runtime on HCI change).
     - No prior-HCI lone-player fan, tabled sticky, or transport artifact may be mountable (enforced by §B1).
     - Orchestrator runs none of `resetForHand` / `beginDealForHand` / `beginWaveForHand`, dispatches nothing.
   - Caller passes `selfHand = null` until `admitted === true`; never `[]`.

5. **`useHolmHandAdmission`** — new `src/lib/canonicalShell/cardTransport/holmHandAdmission.ts`
   - Signature: `useHolmHandAdmission({ handContextId, expectedHandSize, selfHandPayload, communityPayload })` with `selfHandPayload = { cards, roundId, handContextId, sourceVersion } | null`.
   - `admitted = true` iff:
     - `handContextId != null`,
     - `selfHandPayload.handContextId === handContextId` AND `selfHandPayload.cards.length === expectedHandSize`,
     - `communityPayload.handContextId === handContextId` (or equivalent round-id match).
   - Per-HCI admission latch — each HCI admits exactly once. On admission edge fire the single `resetForHand` → `beginDealForHand` → `beginWaveForHand` sequence.

**Acceptance.** No stale stage cards while HCI is null or mismatched. New hand never PRE_DEAL-stalls on an empty self-hand. Out-of-order or revision-mixed payloads (older `sourceVersion`, prior HCI, straddled revisions) are physically rejected, not merely ignored downstream. Transport launches the same frame both sources match the new HCI by physical provenance.

## Out of scope (untouched)
Chucky reveal, outcome flow, Bucks animation, opponent timer geometry, non-Holm games, Geometry Lab, lifecycle ordering, existing forensic exports.

## Files touched
- Holm round-mutation paths under `src/lib/` (defer + atomically reissue `decision_deadline` at all actionability commits incl. pause/resume/reconnect)
- Holm player-cards provisioning + fetch/subscription path (provision pre/atomic with hand advance; scoped queries; structured payload; coherent per-transaction `source_version`; coherent assembly)
- DB schema migration: add `hand_context_id` (if missing) and `source_version` to `player_cards`
- `src/pages/Game.tsx` (server-field countdown gate; ceiling projection; structured `playerCards`)
- `src/lib/canonicalShell/ActivePlayerHUD.tsx` (remove Holm bypass; forward `deadlineMs`)
- `src/components/MobilePlayerTimer.tsx` (`deadlineMs` prop + segment identity incl. `{roundId, currentTurnPosition, decisionDeadlineMs}`; `timeLeft` display-only)
- `src/components/MobileGameTable.tsx` (fail-closed `stickyIsCurrent` at every sticky read; identity-keyed orchestrator unmount on HCI change; pending-admission wiring; HCI-deduped fetch)
- `src/components/HolmDealOrchestrator.tsx` (treat `selfHand == null` as PENDING)
- `src/lib/canonicalShell/cardTransport/holmHandAdmission.ts` (new)
