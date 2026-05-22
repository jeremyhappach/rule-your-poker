# Phase D — Passive Ambient Lifecycle

## Scope landed
Canonical `waiting_for_player` ambient announcements now drive the two highest-value passive states inside Cribbage gameplay:

1. **Discard wait** — local user has finished discarding to crib but at least one opponent has not. Emits `waiting on {name} · discarding to crib`.
2. **Pegging wait** — `pegging.currentTurnPlayerId` is not the local user. Emits `waiting on {name} · playing a card`.

## Guardrails enforced
- **Semantic-state driven, not render-driven.** Effect derives strictly from `phase` + turn ownership; identity-stable id per `(gameId, dealerGameId, handNumber, kind, targetPlayerId)`. Re-emission with the same id is a no-op refresh in the provider, so render churn cannot produce ambient flicker.
- **Self-scoped teardown.** Tracks `lastWaitingIdRef`; only clears ambient that this effect previously emitted, so dealer-selection ambient (Phase C) is not clobbered during the dealer-select → discarding handoff.
- **Phase exclusion list.** Skips `dealer-select`, `dealing`, `cutting`, `counting`, `complete`, and high-card mode — those have dedicated overlays / transient announcements (counting overlay, win sequence, dealer_selected transient).
- **Active-actor exclusion.** When the local user is the active actor (still owes a discard, or it is their pegging turn) the effect emits nothing — interactive UI owns the moment.
- **Source discipline.** Reads from `viewState ?? cribbageState` (presentation-state first, authoritative bootstrap fallback) — same source path as the rest of the legality logic.

## Out of scope (deferred)
- **Between hands.** Counting → next-hand-deal gap is brief and currently masked by counting overlay + animation triggers; no observable dead air at this surface.
- **Next-game configuration.** `dealer_configuring` ambient lives at the session/Game.tsx level (neutral shell territory) and is not part of "once Cribbage is selected."

## Phase D exit criteria
- Observer never stares at unexplained felt during discard/pegging waits ✅
- Ambient does not fight interactive UI (active-actor exclusion) ✅
- No stale ambient resurrection (single-effect ownership + identity-stable id; provider scope teardown clears at dealerGameId boundary) ✅
- Scope teardown sanity (provider drops ambient whose scope no longer matches current dealerGameId/roundId) ✅
