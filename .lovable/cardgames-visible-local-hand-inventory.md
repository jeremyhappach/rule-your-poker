# Card games — visible-local-hand invariant inventory

**Invariant:** For every card game, once current hand/round identity is
established and authoritative local player cards are non-empty, the UI
must not render an empty local hand due to stale presentation, stuck
transport phase, readiness gates, remount, animation state, or parent
suppression. Refresh/hydration and live/realtime paths MUST converge on
the same visible hand.

## Inventory

| Game | Auth source | Presentation source | Hand identity | Risky gates | Fallback status |
|---|---|---|---|---|---|
| Cribbage | `cribbageState.playerStates[me].hand` (via `renderTrace.authoritativeHand`) | Deal-runtime clipped (`getSettledCountForPlayer`) | `renderHandKey` / `currentHandKey` | `activeHandBlocked` (identity mismatch, `parentSuppressed`), stuck `deal.phase='PRE_DEAL'`, presentation drift | **Self-heal wired** in `CribbageMobileCardsTab` — post-deal auth non-empty ⇒ render authoritative even if clipped/blocked; parent `CribbageMobileGameTable.selfHealMountOk` mounts pane when primary gate blocks. |
| Gin Rummy | `ginState.playerStates[me].hand` (`stableMyStateAuthoritative`) | Canonical settle-count clip (`deal.getSettledCountForPlayer`) | `localHandIdentityKey` | `!presentationReady` (baseline uncommitted → "Dealing…"), stuck `deal.phase='PRE_DEAL'`/`DEALING`, per-player settle underflow | **Self-heal wired** (this change) — bounded 3s stall latch (`dealStalledSelfHeal`) promotes to full-authoritative when auth hand is at capacity in a playable phase but transport hasn't reached READY. Baseline still respected for legitimate pre-deal empty. |
| Holm | `player_cards` row → `rawCurrentPlayerCards` in `MobileGameTable` | `currentPlayerCards` memo (frozen snapshot / cached) | `handContextId` | `holmWinPotTriggerId` snapshot, `isHandTransitioning` empty overwrite, `roundStatus==='completed'` empty branch, cached-previous-hand across boundary | **Already safe** — `rawBelongsToActiveHand` priority selector wins over all cache/frozen/transition branches. Empty overwrite only fires when raw is empty. Documented in `HOLM_SELF_HAND_LINEAGE`. |
| 3-5-7 | `player_cards` → `rawCurrentPlayerCards` (shared `MobileGameTable`) | Same as Holm; `357-staged-round-floor` prefers max(raw, cached) | `handContextId` (per round) | Same as Holm; additional round-floor cache | **Already safe** — same priority: `rawBelongsToActiveHand` ⇒ render raw; round-floor keeps cards visible when raw partially arrives. |
| Horses | Dice game — no local player card hand (only dice) | n/a | n/a | n/a | N/A |
| SCC | Dice game — no local player card hand (only dice) | n/a | n/a | n/a | N/A |
| Yahtzee | Dice game — no local player card hand (only dice) | n/a | n/a | n/a | N/A |

## Shared helper

`src/lib/cardGames/resolveVisibleLocalHand.ts` codifies the contract
(post-deal auth non-empty ⇒ render authoritative; parent-suppression is
overridden by the invariant). Card games with per-game deal projection
(Gin, Cribbage) keep their local gating and call the helper as the
final self-heal decision only where it does not conflict with the
opening card-by-card reveal.

## Risky gates surveyed

- Cribbage `activeHandBlocked` (parent) + `dealClippedSourceHand` empty — **healed** in `CribbageMobileCardsTab.shouldSelfHeal`.
- Cribbage parent tab `mountedIsActionable` — **healed** by `selfHealMountOk`.
- Gin `presentationReady` gate — legitimate; baseline commits synchronously when auth hand ≥ 1, so the "Dealing…" placeholder never persists past first authoritative frame.
- Gin `deal.phase === 'PRE_DEAL'` clipping to `[]` — **healed** by bounded 3s stall latch (this change).
- Gin `getSettledCountForPlayer` underflow relative to auth — same latch resolves.
- Holm/357 `MobileGameTable.currentPlayerCards`: `empty-hand-transitioning`, `empty-holm-completed`, `empty-new-hand-no-raw-yet` — all guarded behind `rawBelongsToActiveHand` priority; only fire when raw is empty (invariant not violated).

## Diagnostics

- `handRenderInvariantLedger` (Cribbage) — in-memory only, bounded (50 entries), no persistence/console/backend. Export only if invariant trips.
- Gin uses existing `recordGinPhaseTrace`.
- No new recorders added by this sweep.

## Not touched

Chat, voice, lobby, backend, z-layers, server actions, scoring rules, game mechanics.
