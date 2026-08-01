# Current release and cutover state

Date: 2026-08-01

## Cutover assumption

This document assumes the final published iOS Session Ended long-list scrolling fix passes. If it fails, that single defect remains the active Lovable release blocker and the Lovable baseline must not be tagged stable.

## Final release candidate scope

### Holm bot scheduling

Two scheduler defects were identified:

1. A wake arriving while `botProcessingRef` was true could be discarded.
2. A realtime authority edge could be missed entirely; fetch/remount observation did not always stamp authority because stamping was nested under an unrelated deadline branch.

Current correction latches/replays dropped wakes, stamps Holm authority on relevant fetches, compares a full round/turn/epoch authority key, adds event-driven drains on reconnect/focus/visibility, retains DB exactly-once guards, and uses no polling or arbitrary repair timeout.

### Add Bot

Accepted behavior:

- menu shows `Adding bot…`;
- duplicate taps are blocked;
- success is confirmed by the canonical yellow waiting seat, not a success toast;
- failure may show a destructive toast with the actual reason;
- waiting bots remain outside the current hand and join at the next canonical boundary.

### Bot aliases

- durable `games.bot_alias_seq`;
- backfill from `session_events` `bot_added` history;
- transactional `create_session_bot`;
- aliases persist in authoritative usernames;
- removed aliases are never reused;
- concurrent creation serializes.

A bot-heavy smoke produced Bot 7–10 correctly after removals.

### Four-color deck

The active-hand shell no longer paints a white gradient over four-color faces. Known debt: Holm still has a separate local-hand path besides shared `ActiveHandFan`.

### Session snapshots/results

New snapshot identity:

```text
(game_id, dealer_game_id, hand_number, player_id)
```

Changes include dealer-game stamping, an ordinary unique index compatible with SQL/PostgREST conflict inference, DB-idempotent writers, current-roster override, departed-participant snapshot fallback, and no fabricated historical balances.

### Session Ended

Accepted:

- Holm player/community/Chucky cards retire together;
- pot, spotlights, active labels, gameplay cards, and transports retire;
- HUD/tab rail/chat/history remain;
- Back to Lobby is local-only;
- rostered and departed participants merge into Results;
- results are constrained to a felt-safe region.

Final active gate:

- long Results lists touch-scroll in published iOS;
- title remains pinned;
- every row is reachable;
- short lists remain compact.

## Final cutover smoke

Before tagging:

1. Published iOS long-list scrolling passes with Hap + 10 bots.
2. A short Session Ended list remains compact.
3. A bot-heavy Holm hand completes without a parked bot.
4. Add Bot shows immediate yellow waiting seat and monotonic alias.
5. Four-color and standard active hands remain legible.
6. Session Ended contains all expected current/departed participants once.
7. `bunx tsgo --noEmit` is clean.
8. Required migrations are deployed.

## Cutover action

After smoke passes:

1. Publish final Lovable version.
2. Reclone/pull exact published state.
3. Record commit SHA.
4. Tag `lovable-final-stable-2026-08-01`.
5. Push tag.
6. Begin Codex work from a clean branch based on that tag.
7. Do not spend remaining Lovable credits on audits/nonblocking cleanup.
