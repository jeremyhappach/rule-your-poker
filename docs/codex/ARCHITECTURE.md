# Architecture and engineering invariants

## 1. Authoritative → Optimistic → Presentation

PostgreSQL/Supabase owns legal game state, current actor, decisions/locks, balances, pot, settlement, participants, snapshots, terminal disposition, and persistent lifecycle state.

Optimistic state is permitted only with an explicit authoritative mutation, reconciliation path, and identity boundary. It may not become an alternate progression owner.

Presentation may animate, preserve terminal reveals, sequence transports/celebrations, and hold the shell through terminal completion. It may not choose legal outcomes, move turns, settle balances, create hidden participants, or repair authoritative state.

## 2. Identity and progress gating

Typical identity tuple:

```text
game/session ID
dealer_game_id
hand_number
round_id
```

Rules:

- reject regressive progress;
- equal progress only if semantically identical;
- clear hand-scoped caches on identity change;
- re-key round-scoped subscriptions safely;
- do not let stale fetch/realtime results overwrite a newer identity;
- explicitly clear transient local and persisted state at lifecycle boundaries.

## 3. Canonical shell ownership

Doctrine:

```text
ONE TABLE
ONE FELT
ONE SEAT RING
ONE SPOTLIGHT
ONE PHASE MACHINE
```

Shell owns persistent table/felt geometry, lifecycle, dealer selection/configuration, waiting/ante/game/terminal continuity, seat anchors, HUD/tab rail, chat/history access, announcements, shared timers/interstitials, transports, celebration, terminal hold, and Session Ended.

Games own rules, legal controls, game-specific card/dice artifacts, state adapters, and outcomes.

A game-specific artifact is allowed only when the canonical owner cannot express a legitimate rule or geometry difference. Even then it must reuse canonical primitives and be documented.

## 4. Geometry

Card faces obey the [resolved card face contract](CARD_FACE_CONTRACT.md): never
render a masked, missing or invalid rank/suit as a face. Hidden cards stay backs;
face-reveal completion requires a resolved face and existing visibility admission.

- Active player remains bottom/center.
- Preserve established absolute observer/selection seats and relative active-play projection.
- Game artifacts live inside canonical slots.
- Do not create per-game shell geometries.
- Avoid magic-pixel and viewport-specific layout.
- Interactive felt elements mount in the canonical interaction layer.
- Elliptical felt content must respect an inscribed safe region, not the full bounding rectangle.

## 5. Realtime and scheduler behavior

Realtime edges are not sufficient alone. A client that mounts, reconnects, regains focus, or misses an edge must evaluate current authoritative state.

For bots:

- permitted mounted clients may evaluate;
- database CAS/decision locks provide exactly-once authority;
- scheduler wakes cannot be lost during in-flight work;
- fetch/remount must recover current authority;
- aliases never participate in actor identity or dedupe;
- arbitrary decision timers cannot repair scheduler ownership.

## 6. Settlement and snapshots

Settlement must be server-authoritative, atomic, replay-safe, disconnect-safe, and keyed by stable dealer-game/hand identity. Balances must be final before result recording.

Canonical new snapshot identity:

```text
(game_id, dealer_game_id, hand_number, player_id)
```

Session Ended results use current `players.chips` for rostered participants plus latest valid snapshots for departed participants. Roster rows override snapshot rows; observers are excluded.

Legacy snapshots may have null dealer-game identity. Do not fabricate or rewrite them without authoritative evidence.

## 7. Terminal and Session Ended

Sequence:

1. authoritative settlement;
2. post-payout snapshot;
3. terminal result/disposition;
4. reveal/transport/celebration;
5. presentation-complete boundary;
6. connected live-flow clients enter transient Session Ended;
7. Back to Lobby is local-only.

Fresh mount/reconnect of an already-ended session goes directly to lobby.

Session Ended keeps table/HUD/chat/history, shows results on felt, and retires every gameplay artifact.

## 8. Harnesses/debug

Known harnesses:

- Cribbage: Near Double Skunk, Perpetual Heels
- Gin: Near Gin
- Yahtzee: Near Win

Harnesses must be inert unless Debug Mode/master gate is on, visibly identified, and unable to contaminate normal state. Do not add permanent production instrumentation.
