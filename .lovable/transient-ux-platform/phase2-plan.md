# Transient UX Platform — Phase 2 Plan (Rail Migration Only)

Status: PLAN. No code yet. Phase 1 inventory is the input.

## Hard boundary

Phase 2 migrates **only** non-blocking rail surfaces. Phase 2 must NOT touch:

- Cribbage skunk / double-skunk overlays
- Holm cracked overlay
- SCC no-qualify / midnight overlays
- Horses natural overlay
- 3-5-7 instant win overlay
- Yahtzee roll / upper-bonus / winner overlays
- Chip transport animations
- Any `fixed inset-0` / full-screen blocking surface
- Any class-A ambient/persistent gameplay-state surface (counting strips, hand-result strips, "Bot thinking", auto-roll indicator, turn spotlights)

Those are Phase 3 (overlays) or stay where they are (ambient gameplay surfaces). Overlay migration is blocked on the 5 legacy-asset questions from Phase 1.

## Phase 2 scope (rail-eligible only)

From the Phase 1 inventory, rail-eligible surfaces:

| Game | Event | Current owner | Target rail type |
|---|---|---|---|
| All | Waiting for players (pre-deal) | per-game LifecycleAnnouncement plates | ambient `waiting_for_players` (exists) |
| All | Dealer configuring next game | `DealerConfig` / felt plates | ambient `dealer_configuring` (exists) |
| All | Dealer selection in progress (high-card draw) | `useHighCardDealerSelection` consumers | ambient `dealer_selection_in_progress` (exists) |
| All | Dealer selected (winner reveal) | per-game plates | transient `dealer_selected` (exists) |
| All | Awaiting ante decisions | per-game plates | ambient `awaiting_ante` (NEW) |
| All | Waiting for specific player decision | per-game plates | ambient `waiting_for_player` (exists) |
| All | Waiting for next round | per-game plates | ambient `waiting_for_next_round` (exists) |
| Cribbage | "Discard to crib" actor CTA | discard strip | ambient `cta_prompt` (NEW, variant=discard_to_crib) |
| Cribbage | GO declared (non-blocking notice) | inline plate | transient `peg_notice` (NEW, variant=go) |
| Gin Rummy | "Draw / discard / knock" actor CTA | felt strip | ambient `cta_prompt` (variant=gin_action) |
| Holm | "Pass / Take" actor CTA | inline | ambient `cta_prompt` (variant=holm_decision) |
| Horses / SCC | "Roll now" actor CTA | felt plate | ambient `cta_prompt` (variant=roll_now) |
| Yahtzee | "Roll / hold / score" actor CTA | inline | ambient `cta_prompt` (variant=yahtzee_action) |

Class-A surfaces that look rail-ish but are explicitly **out of Phase 2**:
counting/result/scoring strips, bot-thinking, auto-roll indicator, turn
spotlights, persistent leg/buck indicators. They stay where they are.

## Architectural rules added in Phase 2

1. **Single rail consumer.** The shell-mounted `CanonicalAnnouncementLayer` is the only renderer that paints into the rail slot. Per-game `LifecycleAnnouncement` JSX inside `*GameTable.tsx` / felt-content files is retired *for the surfaces above*. (Surfaces outside Phase 2 scope keep their local plate.)
2. **Semantic emits only.** Games emit `{ id, type, scope, payload }` via `useAnnouncements().emit(...)`. No game renders rail JSX, no game positions the rail slot, no game owns rail timing.
3. **Non-blocking guarantee.** A rail event MUST NOT gate gameplay progression. If a surface needs to block, it is an overlay (Phase 3), not a rail event.
4. **Actor-only CTAs are still rail events.** The rail renderer decides visibility (e.g. only paint the `cta_prompt` plate when `payload.actorUserId === viewerUserId`). Observers see the corresponding ambient `waiting_for_player` text instead. This keeps observer parity explicit and shell-owned.
5. **Fail loudly.** Emitting an unknown `type` is a development-mode throw. Emitting from a tree without `CanonicalAnnouncementProvider` already returns no-op stubs — preserve that, but log a `console.warn` once per session in dev.
6. **Legacy preservation.** Visual treatment of rail content stays exactly the `LifecycleAnnouncement` plate. No redesign in Phase 2.

## New type-contract changes (additive, no breakage)

Extend `AnnouncementType` with:

- `awaiting_ante` (ambient, priority 45)
- `cta_prompt` (ambient, priority 35) — `payload.variant`, `payload.actorUserId`, `payload.title`, `payload.subtitle`
- `peg_notice` (transient, priority 55, TTL 1500ms) — `payload.variant` (`'go' | 'his_heels' | ...` — only `go` wired in Phase 2)

Add renderer cases in `announcements/renderers.tsx`. No new components — reuse `LifecycleAnnouncement`.

No changes to `CanonicalAnnouncementProvider`, `CanonicalAnnouncementLayer`, `CanonicalCelebrationLayer`, or `types.CELEBRATION_TYPES`. Phase 3 territory stays untouched.

## Execution order (no big-bang)

1. **Type + renderer extension.** Add `awaiting_ante`, `cta_prompt`, `peg_notice` types, defaults, and renderer cases. Tests: extend `renderers.test.tsx` (if present) or add one.
2. **Cribbage rail cutover** (already partially on rail). Migrate:
   - awaiting-ante plate → `emit awaiting_ante`
   - high-card draw plate → `emit dealer_selection_in_progress`
   - dealer-selected plate → already on rail; audit
   - discard-to-crib strip → `emit cta_prompt`
   - GO inline plate → `emit peg_notice`
   Delete the migrated local `LifecycleAnnouncement` JSX from `CribbageMobileGameTable` / `CribbageFeltContent` (only those exact sites).
3. **Gin Rummy rail cutover.** Same pattern: waiting / your-turn / knock-prompt CTA → rail emits. Knock-declared and GIN! and MatchWinner are overlays → DO NOT TOUCH.
4. **Holm rail cutover.** ante / waiting / hap-deals / pass-take CTA → rail emits. Cracked overlay → DO NOT TOUCH.
5. **3-5-7 rail cutover.** awaiting-ante / awaiting-next-round → rail emits. Result reveal stays ambient gameplay. Instant-win overlay → DO NOT TOUCH.
6. **Horses / SCC rail cutover.** roll-now CTA → rail emit. HandResultDisplay stays. Natural / no-qualify / midnight → DO NOT TOUCH.
7. **Yahtzee rail cutover.** roll/hold/score CTA → rail emit. Yahtzee/bonus/winner overlays → DO NOT TOUCH.
8. **Hardening pass.** Once all six games have emitted at least one rail event:
   - Add a dev-mode `console.warn` when `useAnnouncements()` returns the no-op stub (provider missing).
   - Add a dev-mode throw on unknown `type` in `emit`.
   - Add an onboarding checklist entry: "new game → register rail emits in `transient-ux-platform/phase2-rail-integration.md`".
   - Grep guard: a unit test that scans `src/components/*GameTable.tsx` and `*FeltContent.tsx` for direct `<LifecycleAnnouncement` imports and asserts the allow-list (surfaces NOT yet migrated). Anything outside the allow-list fails the test.

## Validation gates (per game)

Before declaring a game's rail cutover done:

- [ ] Observer sees the same lifecycle text the actor sees (or the actor-specific CTA collapses to the matching `waiting_for_player` for observers).
- [ ] No regression in actor decision flow (ante, discard, knock, roll, score) — pure visual/ownership move.
- [ ] No new layout shift: the local plate JSX is removed only after the rail emit is wired so the 36px reserved slot absorbs the same content.
- [ ] Skunk / cracked / natural / no-qualify / midnight / instant-win / Yahtzee overlays still fire identically. Smoke-test the relevant terminal path.

## Phase 2 exit criteria

- All seven rail surfaces above migrated for all six games.
- No `<LifecycleAnnouncement` JSX in `*GameTable.tsx` / `*FeltContent.tsx` outside the documented allow-list.
- Grep-guard test green.
- Dev-mode loud failures wired.
- `mem://architecture/canonical-shell/transient-ux-rail` written documenting the rail contract.
- Phase 3 plan (overlay migration) authored — but NOT started — and the 5 open legacy-asset questions answered as a precondition to Phase 3 execution.

## Explicitly deferred to Phase 3

- All overlays from inventory class O.
- DealerSettingUpGame canonicalization (overlay-with-no-TTL decision).
- Tab-bar promotion of actor CTAs (Phase 2 keeps them on the rail; tab-bar is a later UX pass).
