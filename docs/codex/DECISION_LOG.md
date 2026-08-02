# Durable decision log

## D-001 — Database is authoritative

Gameplay, settlement, balances, snapshots, and persistent lifecycle truth live in Supabase/PostgreSQL. Client presentation may not become an alternate progression owner.

## D-002 — One canonical shell

The platform uses one table, felt, seat ring, spotlight system, and phase machine. Game artifacts live inside canonical slots.

## D-003 — Runtime smoke outranks source theory

A published runtime failure rejects an implementation even when typecheck and detached replicas pass.

## D-004 — No arbitrary timers/polling as state repair

Missed transitions are repaired through state observation, identity, scheduler drains, or authoritative ownership—not time-based guesses.

## D-005 — UUID identity, never alias

Player, bot, action, settlement, and dedupe identity use UUID/stable authoritative keys. Bot names are presentation.

## D-006 — Bot aliases are monotonic per session

Bot ordinals never reuse after removal. Allocation is durable and transactional.

## D-007 — Visible state confirms success

For Add Bot, the canonical yellow waiting seat confirms success. No success toast. Failure may show a destructive toast with the actual reason.

## D-008 — Snapshot identity includes dealer game

Hand numbers may repeat across dealer games. New snapshots key by game, dealer game, hand number, and participant.

## D-009 — Session Ended is a table phase

Connected clients keep shell/HUD and see results on felt. It is not a modal. Fresh mount of an already-ended session goes to lobby.

## D-010 — Preserve frozen repros

Do not mutate a production freeze until authoritative identity, action tape, and failure boundary are captured.

## D-011 — Broad audits are read-only first

Canonicalization and game-rule audits produce an inventory/plan before implementation.

## D-012 — Approval makes a fix publish-ready

An approved fix includes the required Git integration and push to `origin/main`. Lovable publication and production smoke remain Jeremy's responsibility.

## D-013 — Terminal settlement is one replay-safe transaction

A terminal settlement claim, chip movement, result row, post-payout snapshots,
terminal disposition, and session financial rows commit together or not at
all. Clients submit immutable authoritative identity and may replay; a durable
database key makes every financial consequence exactly once.

## D-014 — Vercel publishes GitHub main

`origin/main` is the production frontend release source. Vercel automatically
builds and publishes every pushed `main` commit, and Codex verifies the
deployment before handing the runtime to Jeremy for smoke testing. Manual
Lovable publication is no longer part of the delivery path.

Lovable Cloud remains a temporary database and authentication dependency until
the controlled Phase 2 migration to an owned Supabase project. Frontend
publication must not be coupled back to Lovable during that migration.
