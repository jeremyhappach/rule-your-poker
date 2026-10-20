# Race Poker coordinated production release plan

Status: CLOSED RELEASE AUTHORIZED, STOPPED AT FAILED PROOF. Jeremy approved the
helper-path correction and closed-admission phases, but no money-mode activation.
The first rollback-only production proof hit a live-heartbeat serialization
conflict. See RACE_POKER_QUALIFICATION.md; no retry, install or publication occurred.
The gameplay candidate is e0366f7b9a7e9ef874f5dd4f208ecad27827d27a.
The catalog baseline is origin/main 44dbd5a7d4de4635b258f731558fe346473d82b9.
The integration commit containing this document preserves both histories.

## 1. Establish the exact coordinated candidate

After separate coordinated release authorization, record the approved integration
SHA and compare the then-current main. Preserve any newer game registrations and
lobby changes. Resolve any new overlap in the isolated branch, rerun affected
checks, and commit before a conflict-free fast-forward into main. Never overwrite
main or force-push. Tag the exact approved release checkpoint before publication.
Retain race-poker/1 and race-poker-bot/1. No Arcade entry is permitted.

## 2. Inspect actual production authority before SQL writes

Target Supabase project: xvhmbuppghwmwpwrkzao. Record its installed migration
head and full definitions/hashes for the five canonical owners listed in
supabase/race-poker/canonical-guard.sql: megatouch_begin, advance_ante_phase_exact,
megatouch_frozen_stake, settle_gameplay_chip_transfers and submit_ante_decision.
Check their grants, canonical financial triggers, result settlement-key unique
index, final-snapshot identity unique index, and recovery scheduler health.
Confirm the approved-account cohort still corresponds to the existing active
profile eligibility; do not change profiles to enlarge access.

A hash mismatch stops installation. Reconcile the Race-only registration branches
with the actual newer definitions and repeat qualification; do not remove or
update a guard without reviewing the changed authority. Verify both migration
source parity and the exact migration hash after any authorized correction.

## 3. Pre-install financial and authority gate

Use a single explicit BEGIN/ROLLBACK transaction against actual production
canonical authority: load the guarded candidate without committing deployment
side effects, then run core-proof.sql and financial-proof.sql. Enable Race flags
only transaction-locally for disposable proof UUIDs. Keep financial triggers,
constraints and authenticated membership checks enabled. Prove zero residual
fixture rows after ROLLBACK. Never repurpose historical sessions.

Required outcomes in both fake and real money: legal scoring/dealing and exact
deadlines; genuine consent and frozen stake/roster/rules/money mode; winner 105/95
from 100/100 with stake 5; draw 100/100; balanced linked canonical transfer batch;
one immutable result and two post-settlement snapshots; unauthorized rejection;
duplicate, conflicting, stale and late replay; ordinary continuation and terminal
session closure; rollback after an injected failure following chip writes.

Also run the independent-connection concurrency and zero-client recovery suite
on an isolated qualification database verified to have the same canonical
function definitions, triggers and constraints as production. It must cover
competing clicks/timeouts/bots/settlement, original receipt retry, pause/resume,
bot calculation crossing the deadline, 32-hand recovery, postgame and failure
rollback. Existing dev/race-poker scripts are hardwired to localhost and MUST NOT
be pointed at production: they install local candidates and commit local fixtures.
Record exact authority parity, expected/observed results and environment limits.
If parity cannot be established or any required actual-authority proof is missing,
the release gate stays MISSING/FAIL and admission remains closed.

## 4. Install the guarded migration with admission closed

Apply only supabase/migrations/20261020190908_race_poker_v1.sql through the normal
production migration owner. Do not bulk-apply unrelated local migrations.
The migration creates private match/receipt/history/release state, authenticated
public revision projection, guarded canonical registrations, a fullscreen Race
Poker default with stake 5, and cron job race-poker-recovery every 1 second with
statement_timeout 3 seconds. The initial flags enabled, admission_enabled,
fake_qualified and real_qualified must all be false.

Confirm the installed migration identity, function source parity, RLS/grants,
private hidden-state denial, public revision membership filtering, realtime
publication entry, cron registration and successful worker execution. Rerun the
complete rollback-contained installed-authority financial proof in both modes,
including post-chip-write failure containment, then verify no synthetic balances,
results or fixtures remain. Reconfirm setup/Run Back RPCs reject new admission.

## 5. Publish and verify while closed

Fast-forward the coordinated approved commit into main; push only using
.codex/scripts/push-origin-main.cmd. Vercel publishes that main commit. Wait for
one appropriate deployment interval, then verify READY, the exact source SHA,
canonical production alias and built asset availability. Record the actual URL
from deployment evidence; do not invent a new Race Poker URL.

With all admission flags still closed, verify authenticated capability failure,
no selectable Race Poker dealer option or Run Back, no Arcade entry, existing
catalog games/defaults/rules intact, and Race Poker Rules/Info reads the approved
frozen article without an Arcade request. Catalog help/default metadata is not
admission. An uninstalled backend or API error must continue to fail closed.

## 6. Activate qualified smoke modes and preserve recovery

Only after every required gate passes and coordinated release authorization
covers activation, set fake_qualified and/or real_qualified true for the modes
with complete evidence. Then set enabled and admission_enabled true. Leave any
unqualified mode false. Server configure must still reject that money mode even
if a stale browser presents the game. Existing approved-account eligibility,
exactly two participants and at least one human remain mandatory. Record before
and after flags and verify setup, consent, authoritative action transport,
realtime and autonomous recovery through actual production endpoints.

If smoke fails, close admission_enabled to block new setup/Run Back; preserve
enabled for already admitted games so their snapshots/actions/recovery and
canonical settlement can finish. Never erase matches, rewrite history or reverse
canonical ledger rows as a deployment rollback. Disable an in-flight authority
only through a separately assessed recovery procedure.

## 7. Jeremy's acceptance smoke

Small and large iPhone Safari: portrait/landscape and toolbar changes; readable
cards, Rules/Info, editable stake, deliberate Ante Up; two humans and human/bot;
30-second fixed deadline, five-card no-refill completion, Final hand/equal turns;
reconnect without old awards/sounds; mute/unmute and 5/2-second warning, card,
hoof/count-up and victory cues; final scores, actual balances and chip flight;
draw without transfer/fanfare; Session Ended, fresh-ended reconnect and Run Back.
Physical sound, touch ergonomics and Safari behavior are pending until observed.
Record defects without altering the frozen rule contract or claiming acceptance.

Prepared migration SHA-256: `d0defb62498f619884a40d70f759c0fa4beff1ed5f498e26349b4f20188928c3`.
Only read-only preflight and one failed rollback-contained candidate proof have
executed. Correct the production wrapper heartbeat handling before an authorized
resume; all install/publication/activation stages remain unexecuted.
