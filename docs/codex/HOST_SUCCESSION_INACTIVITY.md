# Host succession and seated-player inactivity — local candidate, 2026-11-02

Branch: `codex/host-succession-inactivity`, isolated from current main
`6411bb674a592d49cc6ed87fc0ae49a56a2f5361`. No push, integration, deployment,
production reads/writes, or production migration application is authorized here.

Jeremy confirmed: a seated host can sit out and retains hosting until standing
up/removal; count consecutive dealer-games missed from start to finish. A queued
rejoin is not participation. A partial game does not count.

The existing participation RPCs, presence grace periods, host CAS version and
settled continuation remain the owners. Private membership records track each
continuous seated tenure and completed missed dealer-game. Active authenticated
human accounts with a seat are eligible, including sitting-out humans. Bots and
left/observer/inactive accounts are excluded. A seat move or brief reconnect does
not reset tenure. Explicit leave and reseat does. Ties use creation time and UUID.
The old browser fallback election is removed from host controls; Waiting Start
eligibility remains its distinct, existing server-validated action.

`system_settings.session_inactivity.value.dealer_game_limit` configures the
positive integer threshold, default **3**, through existing administrator settings
authorization. This is a server setting; no new settings screen is included.
Changes apply at the next completed dealer-game boundary. The legacy hand counter
is not used. Only actual gameplay opens a cohort; cancelled setup/ante does not.
Exact `(session, dealer_game)` completion receipts prevent duplicate counting.
No current/in-progress game is retroactively counted on installation.

Standing up occurs inside the existing settled `game_over` continuation, with
zero pot and a result for that dealer-game. It clears the seat and automatic
participation flags while retaining the player row and chips. If the proposed
next dealer was removed, the canonical clockwise ordering and bot-dealer setting
select a replacement. Game rule and settlement code are unchanged. Existing
session-ending/abandonment owners still govern terminal disposition.

Host changes use the locked session row and existing `host_version`. All members
of a multi-row departure are visible before succession. Private membership is
unavailable to browser writes. Pause commands are unchanged; end-session and
manual-transfer predicates now require the authoritative eligible host instead
of a legacy null-host fallback. The migration checks those existing RPC seams
before modifying them and retains their replay envelopes.

The canonical rail announces “Player is now host” using UUID/version identity.
Fresh mounts establish a baseline, lower versions are ignored, gameplay and
terminal presentation defer the announcement, and a subsequent host retires the
previous queued host notice. Paused/idle tables can announce immediately. No
polling, presence timer, audio cue, gameplay timer or second announcement owner
was added.

## Local validation

`node dev/session-membership/proof.mjs` creates and drops a uniquely named
localhost PostgreSQL database from the archived `money_qualification` fixture.
It restores omitted RPC prerequisites from checked-in migration definitions,
retains financial triggers, and applies the candidate only in that disposable
database. No live financial changes are made.
Copied synthetic sessions are cleared in the disposable clone before testing
the drained-table installation gate; the source template is unchanged.

Passing cases cover migration rollback, tenure/seat shifts, leave/rejoin, existing
presence grace/reconnect, sitting-out hosts, deterministic simultaneous departure,
inactive accounts, bot exclusion, three-game and configured one-game thresholds,
partial games, participation reset, duplicate continuation, dealer reassignment,
private-counter authorization, manual-transfer authorization, successor pause/end
permissions, former-host rejection and late replay. Two independent database
connections exercise simultaneous departures and departure racing eviction.
Both money modes use nonzero canonical chip transfers and compare player balances,
transfer batches, results, account entries and snapshots across eviction.
An injected continuation failure also proves the counter, seat, host and financial
changes roll back together in both money modes.

Client checks cover two mounted announcement clients, deferred/duplicate/regressive
frames, reconnect baseline, wording, existing participation commands and waiting
start controls. TypeScript and the local Vite bundle are also checked.
Validation passed: 62 focused client tests, TypeScript application check, local
Vite build (existing chunk-size warnings), and the complete PostgreSQL proof.

Limitations: local PostgreSQL fixture and React DOM clients, not a hosted Supabase
Realtime/browser transport proof. Hosted schema parity, deployment and Jeremy's
production smoke remain unverified and out of scope. The fixture's scheduler is
not a production recovery-worker test. Pause/resume and activity-aware recovery
worktrees were not modified.

## Confirmed rollout gate

Past reseating times are not recorded in existing rows. Jeremy selected waiting
for existing tables to finish. The migration refuses installation while any
nonterminal session remains, so tenure starts accurately with new sessions;
historical membership is not fabricated. Production activation remains outside
this local task. The rollback proof also exercises this installation gate.

Future acceptance: use three humans and a bot; briefly disconnect/reconnect the
host; leave and reseat the oldest participant; have the host leave and verify
the longest uninterrupted human gains controls once. Complete three games with
another human continuously sitting out, checking their seat releases only after
the third result, their chips/history remain, and the next dealer is eligible.
