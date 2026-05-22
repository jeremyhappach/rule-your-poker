# Transient UX Platform — Phase 1 Inventory

Status: DRAFT (Phase 1 of the Transient UX Platform canonicalization).
Scope: enumerate every transient UX surface across every game so Phase 2
(rail migration) and Phase 3 (overlay migration) cannot miss one.

Do NOT migrate from this document. This is a census, not a plan.

## Class taxonomy (recap)

- **R = Rail**: shell-owned, non-blocking, reserved 36px slot, lifecycle/CTA messaging.
- **O = Overlay**: shell-owned, blocking, full-screen takeover, timed dismiss, dramatic event.
- **A = Ambient/Persistent**: gameplay-state surfaces. **NOT** transient UX. Stay in gameplay surfaces. Listed here only so we don't accidentally absorb them into the rail.
- **X = Animation primitive**: chip transport, dealer button flight, card reveal motion. Owned by ChipTransportRuntime / per-game card layer. **Out of scope** of this platform — listed as "do not touch".

## Legend

| Field | Meaning |
|---|---|
| Owner | Current source-of-render component |
| Class | R / O / A / X |
| Blocking | does it gate gameplay progression? |
| Obs parity | observers see it today? |
| Legacy asset | concrete UX to preserve verbatim during canonicalization |

---

## Cribbage

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Awaiting ante decisions | `CribbageMobileGameTable` (LifecycleAnnouncement plate) | R | no | yes | LifecycleAnnouncement | Already on shared plate; promote to rail emit |
| Drawing for high card | `CribbageMobileGameTable` + `useHighCardDealerSelection` | R | no | yes | LifecycleAnnouncement | Rail candidate |
| Dealer selected (winner) | `CribbageMobileGameTable` | R | no | yes | LifecycleAnnouncement | Rail candidate |
| Discard to crib (CTA) | `CribbageMobileGameTable` discard strip | R | no | n/a (actor only) | per-game CTA strip | Tab-bar candidate longer term; rail acceptable interim |
| Pegging turn prompt / "Your turn" | `CribbageTurnSpotlight` + felt content | R | no | yes | spotlight + plate | Spotlight stays (anchor UX); rail mirrors lifecycle text |
| GO | `CribbageMobileGameTable` (per-actor GO indicator + plate) | R | no | yes | inline GO chip + plate | Rail emit on declaration |
| Counting hand (active) | `CribbageCountingPhase` plate | A | yes (paced) | yes | counting strip | Ambient gameplay surface — do NOT rail |
| Crib reveal / scoring | `CribbageCountingPhase` | A | yes | yes | counting strip | Ambient |
| Cut card reveal | `CribbageCutCardReveal` | X | brief | yes | reveal motion | Animation primitive — keep |
| Chip transfer (round/hand) | `CribbageChipTransferAnimation` / ChipTransport | X | no | yes | chip flight | Already canonical track |
| **Skunk** | `CanonicalCelebrationLayer` (DONE) | O | yes (4.1s) | yes | `LegacySkunkOverlay` | Migrated this loop |
| **Double skunk** | `CanonicalCelebrationLayer` (DONE) | O | yes (4.1s) | yes | `LegacySkunkOverlay` | Migrated this loop |
| Match win (non-skunk) | per-game win sequence (no overlay) | — | no | n/a | none | Intentional: silent payout |

## Gin Rummy

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Waiting for opponent / draw | `GinRummyGameTable` lifecycle plate | R | no | yes | LifecycleAnnouncement | Rail candidate |
| "Your turn" / draw prompt | `GinRummyGameTable` + `GinRummyFeltContent` | R | no | yes | inline plate | Rail candidate |
| Knock prompt CTA | `GinRummyGameTable` | R | no | actor only | inline CTA | Rail / tab-bar |
| Knock declared | `GinRummyKnockOverlay` | O | yes (timed) | yes | KnockOverlay | Overlay migration candidate |
| **GIN!** | `GinRummyGinOverlay` | O | yes | yes | GinOverlay | Overlay migration candidate |
| Knock score display | `GinRummyKnockDisplay` | A | yes (paced) | yes | scoring strip | Ambient — keep |
| Match winner | `GinRummyMatchWinner` | O | yes | yes | MatchWinner | Overlay migration candidate (terminal celebration) |
| Opponent draw motion | `GinRummyOpponentDrawAnimation` | X | brief | yes | motion | Animation primitive |

## Holm

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Awaiting ante / sit-out | `HolmGameTable` plate (via LifecycleAnnouncement) | R | no | yes | LifecycleAnnouncement | Rail |
| Waiting for player decision (fold/call) | felt plate | R | no | yes | LifecycleAnnouncement | Rail |
| Hap deals / dealer flips | felt plate | R | no | yes | LifecycleAnnouncement | Rail |
| "Pass" / "Take" CTA | inline | R | no | actor only | inline CTA | Rail / tab-bar |
| **Cracked** | inline felt overlay | O | yes | yes | cracked dramatic plate | Overlay migration candidate |
| Pot win | `HolmWinPotAnimation` | X | brief | yes | pot flight | Animation primitive |
| Reveal pacing | Holm reveal instrumentation | A | yes | yes | reveal | Ambient |

## 3-5-7

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Awaiting ante | felt plate | R | no | yes | LifecycleAnnouncement | Rail |
| Result reveal | felt plate | A | yes (paced) | yes | reveal pacing | Ambient |
| Awaiting next round | felt plate | R | no | yes | LifecycleAnnouncement | Rail |
| **Instant win (3 / 5 / 7 natural)** | inline | O | yes | yes | instant-win plate (legacy) | Overlay migration candidate — verify asset still exists |
| Ante animation | `AnteUpAnimation` | X | brief | yes | motion | Animation primitive |
| Chopped pot | `ChoppedAnimation` | X | brief | yes | motion | Animation primitive |
| Sweeps pot | `SweepsPotAnimation` | X | brief | yes | motion | Animation primitive |
| Bucks-on-you | `BucksOnYouAnimation` | X | brief | yes | motion | Animation primitive |

## Horses

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Roll now CTA | felt plate / inline | R | no | actor only | inline CTA | Rail / tab-bar |
| Auto-roll indicator | `AutoRollIndicator` | A | no | yes | indicator | Ambient (persistent toggle) |
| Hand result | `HorsesHandResultDisplay` | A | yes (paced) | yes | result strip | Ambient |
| Leg earned | `LegEarnedAnimation` | X | brief | yes | motion | Animation primitive |
| Legs to player | `LegsToPlayerAnimation` | X | brief | yes | motion | Animation primitive |
| Sweep the legs | `SweepTheLegsAnimation` | X | brief | yes | motion | Animation primitive |
| **Natural (auto-win)** | inline felt overlay | O | yes | yes | natural plate (legacy) | Overlay migration candidate |
| Leg indicator | `LegIndicator` | A | no | yes | indicator | Ambient |

## Ship-Captain-Crew (SCC)

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Roll now CTA | felt plate | R | no | actor only | inline CTA | Rail |
| Hand result | `SCCHandResultDisplay` | A | yes (paced) | yes | result strip | Ambient |
| **No qualify** | `NoQualifyAnimation` | O | yes | yes | NoQualifyAnimation | Overlay migration candidate — reuse asset |
| **Midnight** | `MidnightAnimation` | O | yes | yes | MidnightAnimation | Overlay migration candidate — reuse asset |
| Ante / chip transport | `AnteUpAnimation`, `ChipTransferAnimation` | X | brief | yes | motion | Animation primitive |

## Yahtzee

| Event | Owner | Class | Blocking | Obs parity | Legacy asset | Notes |
|---|---|---|---|---|---|---|
| Roll prompt / hold dice CTA | felt plate / per-actor inline | R | no | actor only | inline CTA | Rail / tab-bar |
| Score selection prompt | felt plate | R | no | actor only | inline CTA | Rail |
| **YAHTZEE! roll** | `YahtzeeOverlays.YahtzeeRollOverlay` | O | yes (2.5s) | yes | YahtzeeRollOverlay | Overlay migration candidate |
| **Upper bonus earned** | `YahtzeeOverlays.UpperBonusOverlay` | O | yes (2.5s) | yes | UpperBonusOverlay | Overlay migration candidate |
| **Match winner** | `YahtzeeOverlays` winner block | O | yes | yes | winner overlay | Overlay migration candidate |
| Bot thinking / scoring | inline plate | A | yes (paced) | yes | persistent label | Ambient |

## Cross-game / shell-owned (already canonical or out of scope)

| Event | Owner | Class | Notes |
|---|---|---|---|
| Dealer selecting next game | `DealerSettingUpGame` (full-screen card) | O? | Currently a `fixed inset-0` dealer config card. Behaviorally an overlay. Candidate for shell ownership — likely as **ambient takeover**, not transient. Decide in Phase 3. |
| "Not enough players" countdown | `NotEnoughPlayersCountdown` | A | Ambient persistent. Keep. |
| Dealer button flight | `DealerButtonAnimation` | X | Animation primitive |
| Turn spotlight (cross-game) | `TurnSpotlight`, `CribbageTurnSpotlight` | A/X | Persistent visual anchor on active seat. NOT a rail event. |
| Chat bubbles | `ChatBubbleOverlay` (shell-owned) | — | Already canonical |
| Visual bug report | `VisualBugReportButton` | — | Out of scope |
| Network sim indicator | `NetworkSimIndicator` | A | Dev-only ambient |

---

## Blind-spot audit checklist (Phase 1 exit criteria)

Before declaring inventory complete, walk each game and confirm:

- [ ] Every `fixed inset-0` / `absolute inset-0` JSX block in `src/components/*GameTable.tsx` is classified above.
- [ ] Every component in `src/components/*Overlay.tsx`, `*Animation.tsx`, `*Reveal.tsx`, `LifecycleAnnouncement.tsx` consumer call site is classified above.
- [ ] Every felt-local plate (CribbageFeltContent, GinRummyFeltContent, Holm felt, 357 felt) is classified above.
- [ ] Per-game bottom CTA strips (Cribbage discard strip, Gin knock strip, Horses roll strip) are flagged for rail/tab-bar migration.
- [ ] Legacy assets to preserve verbatim are named explicitly (no "design new overlay" entries).

## Open questions for Phase 2 kickoff

1. Does **3-5-7 instant win** have a surviving legacy overlay asset, or was it dropped during phase E? If dropped, flag as "needs UX reconstruction from spec" — do not invent silently.
2. Does **Holm cracked** currently have a dedicated overlay component, or is it an inline felt treatment? Locate before migration.
3. Does **Horses natural** currently have a dedicated overlay, or only the inline `HorsesHandResultDisplay` path? Locate before migration.
4. **DealerSettingUpGame** — promote to canonical overlay (blocking takeover) or canonical ambient (persistent state)? Behaviorally it blocks, so probably overlay-with-no-TTL. Decide before Phase 3.
5. CTA strips (discard / knock / roll) — rail-as-CTA, or future BottomTabBar slot? Phase 2 will hit this; commit to one.

## What this document is NOT

- Not a migration plan. Phase 2 is.
- Not authorization to delete any legacy asset. Assets are preserved verbatim during canonicalization; ownership moves, semantics do not.
- Not a redesign brief. Visual contracts are frozen as legacy.
