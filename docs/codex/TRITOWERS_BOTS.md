# TriTowers autonomous bots — October 16, 2026

Approved scope: one or more approved humans plus bots, 2–7 eligible seated
participants, fake money only. The existing human dealer and clockwise
continuation policies remain authoritative. No historical session or financial
correction is included.

## Ownership

`supabase/tri-towers/authority.sql` remains the complete authority source.
`tri_towers_configure` freezes canonical UUIDs, seats and `isBot` metadata.
Existing matches without the metadata remain human-only and are not rewritten.
The human action RPC still rejects bot impersonation.

`private.tri_towers_bot_choice` accepts only the redacted projection. It considers
exposed legal moves, uncovered geometry, visible followups, runs and peak bonuses.
Hidden parent ranks are not scored; no stock lookahead is available. Drawing
cannot lose points under the existing rules. Take Score protects remaining stages
when fewer than five seconds remain. Give Up and timeout retain their existing
full-turn abandonment semantics.

The existing recovery job runs once per second. A private before-write trigger
persists a 750 ms minimum bot delay, yielding one action per normal scheduler
wake. The due-work partial index excludes finished, settled and paused matches.
Recovery filters exact current sessions, orders due work and processes at most
20 matches. Round → session → match locks, SKIP LOCKED, captured revision and
player/stage checks reject stale or competing work. Each action uses the existing
reducer and publishes one committed revision. No HTTP worker, browser timer,
client acknowledgment or separate settlement owner was introduced.

Pause removes bot work from eligibility; resume preserves the shifted game clock
and rearms thinking time. Stage clocks remain 120 seconds, results five seconds,
human Ready 30 seconds, and bonus qualification 80,000 after two stages. Initial
bot Ready is submitted by recovery. Stages, final score and player handoff remain
database-owned. Existing Continue, dealer rotation and Session Ended are unchanged.

## Qualification

The financial gate is determined by `dev/tri-towers/bots.evidence.json`, generated
only after all proof and normal-speed runs pass. Qualification restores 115 deployed
authority/dependency definitions and 67 deployed triggers in disposable loopback
PostgreSQL. Actual financial triggers, indexes and constraints remain enabled.

Commands, in order:

- `node dev/tri-towers/build-bots.mjs`
- `node dev/tri-towers/bots.proof.mjs`
- `node dev/tri-towers/bots.boundaries.mjs`
- `node dev/tri-towers/bots.browser.mjs`
- `node dev/tri-towers/bots.lifecycle.mjs`
- `npm run build`
- `node dev/tri-towers/collect-bots-evidence.mjs`

Rollback financial cases include human win, bot win, mixed tie and all-player tie;
exact nonzero starting/ending player balances; balanced transfer batches; pot
conservation; results and snapshots; injected failures; continuation/Run Back;
late replay and Session Ended. Independent connections exercise bot-action and
terminal-settlement races. Fake-money sessions intentionally do not produce
real-money `SessionResult` wallet transactions; session Results use canonical
balances and snapshots.

One hundred equivalent-visible-state permutations test hidden tableau and future
stock independence. Rule boundaries include legal followups, draw, Take Score,
clear bonuses, third stage, Give Up, timeout, revoked accounts and real-money
denial. Browser tests use the real hook/view and authenticated database roles at
390×844 and 1440×900. They verify progressive moves, pause, reconnect, disconnect,
human Ready, settlement, Continue and Run Back. Local notifications/SSE substitute
for Supabase Realtime. Separate worker processes run full competitions with one
human plus six bots and mixed player positions at normal one-second cadence.

## Production owner smoke

1. Refresh `holm357.com`, sign in with an approved account, create a fake-money
   session, add a bot, and choose Other → TriTowers with a five-chip stake.
2. Watch its individual moves on an iPhone-sized screen. Pause/resume once, reload
   mid-stage, then close all browsers during its turn. Reopen to confirm progress.
3. Observe five-second stage results, automatic second/earned third stage and
   the human Ready window. Play the human turn and finish the match.
4. Confirm the winner gains five chips, the loser loses five, and History/Results
   agree. Continue and Run Back; both balances must carry into the new match.
5. Finish/end the session and confirm those balances remain in Session Ended.
   Repeat with more bots/mixed human seats when convenient. Real-money selection
   and direct admission must remain unavailable.

Publication and production worker verification must match the qualified migration
and commit. Jeremy's production smoke is final acceptance.
