# Phase 4 — MobileGameTable Gameplay Announcement Migration

Target file: `src/components/MobileGameTable.tsx` (covers Holm, 3-5-7, Ship Captain Crew, Horses).
Goal: move every remaining local gameplay announcement into canonical semantic emits and retire the shared local gold plate (`bg-poker-gold/95 ...`) inside the `ShellHudChrome announcementFallback` block (lines ~6336–6444).

Scope guardrails: gameplay announcements only. No shell geometry, no tab bar, no CTA/lifecycle refactors, no telemetry mutations.

---

## 1. Inventory — local announcements still rendered in MobileGameTable

All inside `<ShellHudChrome announcementFallback={ ... }>` at line 6336:

| # | Block (line) | Render condition | Current text |
|---|---|---|---|
| A | 6341 — Horses turn announcement | `isDiceGame && horsesController.enabled && horsesController.turnAnnouncement` | `horsesController.turnAnnouncement` (e.g. `"Hap's turn"`, `"Hap rolled a 6 — added to bank"`, dealer roll callouts) |
| B | 6380 — Game-over result plate | `isGameOver && lastRoundResult && !(357 win-suppression)` | `lastRoundResult.split('|||')[0]` (Holm) or `format357ShowdownAnnouncement` or `🏆 Game Complete!` (Holm "beat Chucky" filter for non-Holm) |
| C | 6397 — Round result plate (mid-game) | `!isGameOver && lastRoundResult && not sweep/won-the-game/won-a-leg && gameStatus not configuring/ante_decision && (Holm: holmCommunityFullyRevealed) && (awaitingNextRound \|\| showdown \|\| completed \|\| allDecisionsIn \|\| chuckyActive)` | Same projection as B — round outcome string (Holm chop / Chucky beats / 3-5-7 showdown summary) |
| D | 6422 — Re-ante message | `reAnteMessage` (3-5-7 subsequent-round-1 re-ante prompt) | `reAnteMessage` (e.g. `"Re-ante required"`) |
| E | 6437 — dealerSelectionAnnouncement | already `null` | (retired stub — confirm prop callsites no longer rely on render) |
| F | 6416 — `gameStatus === 'ante_decision'` | already `null` | (retired stub) |
| G | 6429 — `dealerSetupMessage` | already `null` | (retired stub) |

Only A–D produce visible UI today; E–G are already retired placeholders kept for prop-shape stability.

Out of scope (already canonical or non-rail UI):
- TimerBar (6379), PAUSED badge (6375), horses timer chip (6349) — non-announcement UI, leave alone.
- Holm/3-5-7 overlays (`HolmWinPotAnimation`, `SweepsPotAnimation`, `ChoppedAnimation`, `LegEarnedAnimation`) — celebration overlays, not rail.

---

## 2. Semantic mapping

### A. Horses turn announcement
- Trigger: `horsesController.turnAnnouncement` transitions to a non-empty string.
- Canonical event: **`peg_notice`** (transient, priority 55, TTL 1.5–2.5s — match current controller timeout).
  - Rationale: lightweight non-blocking gameplay notice, identical class to Cribbage "Go" / pegging callouts.
- Payload: `{ text, kind: 'horses_turn' | 'horses_roll' | 'horses_dealer' }`.
- Observer behavior: emit unconditionally (no actor gate) — observers should see who is up and what was rolled, exactly like seated players today.
- Emit site: a small `useEffect` inside `MobileGameTable` keyed on `horsesController.turnAnnouncement` identity; dedupe via `useRef(lastEmittedTurnAnnouncementKey)`.

### B + C. Round / game-over result plate (Holm + 3-5-7)
Single semantic family. Two emit shapes based on `isGameOver`:

- **Mid-hand round outcome (C):** canonical `round_win` (transient, priority 80, TTL 3000ms).
  - Payload: `{ text, gameType, handNumber, winnerName?, summary? }`.
  - Renderer reuses existing `LifecycleAnnouncement` plate; for 3-5-7 use the already-computed `format357ShowdownAnnouncement` string; for Holm use `lastRoundResult.split('|||')[0]`.
- **Game-over result (B):** canonical `match_win` (transient, priority 100, extended TTL like Cribbage so it persists through chip-transfer overlays — 10s non-skunk-equivalent, longer if a celebration overlay is active).
  - Payload: `{ text, winnerName?, gameType }`.
  - The shell-owned celebration overlay (`CanonicalCelebrationLayer`) already handles confetti-tier; this emit only owns the rail plate text.
- Observer behavior: identical for active and observer (no actor gating) — round/match results are shared state.
- Suppression rules preserved: continue to skip when `lastRoundResult.startsWith('357_SWEEP:')`, when `won the game` / `won a leg` is being celebrated by a dedicated win overlay/trigger, and the Holm `holmCommunityFullyRevealed` gate. These gates move into the emit `useEffect`, NOT the renderer.
- Dedupe: keyed by `${gameId}:${handContextId}:${currentRound}:${isGameOver ? 'match' : 'round'}:${hash(lastRoundResult)}`.
- Boundary teardown: relies on shell scope (dealerGameId/roundId) — already handled by `CanonicalAnnouncementProvider`.

### D. Re-ante message (3-5-7)
- Canonical event: **`peg_notice`** (transient, priority 55, TTL 2000ms) with `payload.kind: 'reante'`.
  - Rationale: short non-blocking notice; the ante decision itself is already canonical `awaiting_ante` ambient elsewhere — this is the additional "re-ante required" call-out only.
- Observer behavior: visible to all (everyone needs context that re-ante is occurring).
- Emit on `reAnteMessage` transition to non-empty; dedupe by identity ref.

### E / F / G — already retired
- Confirm no consumer relies on rendered output. Remove the dead `null` branches and the matching `dealerSetupMessage`, `dealerSelectionAnnouncement`, and `gameStatus === 'ante_decision'` arms from the fallback JSX entirely. Props remain on the interface (call-site compatibility) but stop participating in render.

### Renderer additions
`src/lib/canonicalShell/announcements/renderers.tsx`:
- Extend the `round_win` renderer to accept a free-form `payload.text` fallback (currently Cribbage-shaped). Holm/3-5-7 will pass `text`.
- `peg_notice` already exists and is text-driven — no change beyond passing `payload.text`.
- `match_win` already restored in Phase 3; reuse as-is, with optional `payload.text` override when `winnerName`/`score` cannot be cleanly parsed from Holm/3-5-7 strings.

---

## 3. Retirement plan

After emits are wired and parity confirmed:

1. Delete the entire JSX subtree passed as `announcementFallback` (lines ~6336–6444).
2. Replace with `<ShellHudChrome announcementFallback={undefined} />` (or drop the prop — same as `CribbageMobileGameTable`).
3. Remove now-unused locals: `format357ShowdownAnnouncement` reference inside fallback (the memo itself stays — emit effect uses it), the gold-plate divs, and the `dealerSetupMessage` / `dealerSelectionAnnouncement` render branches.
4. Keep prop signatures (`lastRoundResult`, `reAnteMessage`, `dealerSetupMessage`, `dealerSelectionAnnouncement`, `horsesController.turnAnnouncement`) — they are now strictly inputs to emit effects, not render.
5. Audit other surfaces that may also render `lastRoundResult` as a plate (search confirms it is only this fallback + overlays).

---

## 4. QA checklist

### Holm
- [ ] 1v1 Chucky win — round result appears in canonical rail; observers see same plate.
- [ ] Chop scenario — chop announcement appears (text via `lastRoundResult.split('|||')[0]`); no double-render with `ChoppedAnimation` overlay.
- [ ] "Beat Chucky" game-over — match-win plate appears AND persists through `HolmWinPotAnimation` (extended TTL behavior, same pattern as Cribbage Phase 3 fix).
- [ ] Community-card-4 gate: round plate must NOT appear before card 4 finishes flipping (emit effect respects `holmCommunityFullyRevealed`).
- [ ] No old gold plate visible in DOM (`data-testid` / class assertion).

### 3-5-7
- [ ] Showdown of R1/R2/R3 — round_win plate shows `format357ShowdownAnnouncement` text.
- [ ] "Won a leg" event — plate is suppressed (overlay owns it); no flash of leg text in rail.
- [ ] "Won the game" event — plate is suppressed for round_win path; match_win emits instead and persists through `LegsToPlayerAnimation` / `SweepsPotAnimation`.
- [ ] Sweep (`357_SWEEP:` prefix) — no rail plate (overlay owns it).
- [ ] Re-ante prompt — `peg_notice` plate appears for ~2s, dismisses, ambient `awaiting_ante` (already canonical) takes over.
- [ ] Pussy-tax message — round_win plate carries the text.
- [ ] Observer sees identical sequence to seated player.

### Ship Captain Crew
- [ ] Turn announcements (`horsesController.turnAnnouncement` reused by SCC controller) appear as `peg_notice` for active and observer.
- [ ] Round/match-end overlays unaffected; rail clean during animation.

### Horses
- [ ] Turn-of-player announcement appears in rail.
- [ ] Roll callout (`"Hap rolled a 6"`) appears, then dismisses by TTL.
- [ ] Dealer roll callout appears for both seated and observer.
- [ ] Match win (`isGameOver` + `lastRoundResult`) emits canonical `match_win` and persists through pot transfer.
- [ ] No 3× flash on game-over transition (current code comments warn about this — emit dedupe must hold).

### Cross-cutting (all four games)
- [ ] No console emit warnings (`[canonical-rail] emit dropped — scope mismatch`).
- [ ] No double announcements (overlay + rail) for celebration-tier events.
- [ ] Scope teardown on new hand clears any leftover rail plate within one frame.
- [ ] `CanonicalAnnouncementProvider` scope already wraps these tables via `PersistentTableShell` — verify before emitting (failure mode is the dev-throw in `useAnnouncements`).

---

## Technical notes (implementation order, for the next loop)

1. Add emit effects (parallel, no removals yet) — A, B+C, D. Verify all four games in preview while the legacy plate still renders. Duplicate plates during this window are expected.
2. Once parity is observed for every game, delete the fallback JSX in one focused edit and pass `announcementFallback={undefined}`.
3. Sweep dead-locals + run QA checklist.
4. Update `mem://architecture/canonical-shell/consumer-registry-and-onboarding` to record MobileGameTable as a fully migrated consumer.

No DB migrations, no edge-function changes, no schema work. Pure client-side renderer→emit migration.
