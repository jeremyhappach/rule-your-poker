# Multiplayer Golf completion release — 2026-10-24

Jeremy authorized reconciliation and production publication of local candidate
`fad9e4118216dcd88e4701fd548627985309874d`. Release base is verified main and
production `312d39c07dce3921b474addb056e97535fd90e1c`.

## Reconciliation and preservation

The client formats completed scores as +N/E/-N, preserves unplayed blanks and
pencil strokes, and moves the existing checked-only reclaim control directly into
the active pane. Reclaim remains the versioned canonical RPC, clears auto_fold
and sit_out_next_hand, and disappears on authoritative confirmation. There is no
fresh-game unchecked opt-in. Hidden cards never contribute to in-play totals.

The newer simultaneous opening, public stock-draw presentation, medium card faces,
seat inspection, pencil-completion totals, retired-but-measurable pile anchors and
terminal error recovery are preserved. Turn affordances cannot revive during the
pre-scoring hold. Rules, configured timings and financial arithmetic do not change.

Play-money active Golf matches continue through automatic play with all humans
away; canonical eligibility remains between dealer games. Real-money timeout and
deliberate pauses retain their authority. Canonical admin Blast retires only the
target play-money session's Golf liabilities inside the existing locked transaction;
direct roster deletion, non-admin and real-money requests remain rejected.

## Shared-function contract for later integration

The installed pause preimage was `643abd1e2b49cf147268e68f2c4b3340`, not the old
local candidate's `e87283dcb929ce4d86a280e8971ccf42`. Its later changes are the
HOLM/357 last-present-human real-money threshold in both pre-lock and post-lock
checks. Those statements, installed Eleven Up Ready behavior, NOWAIT lock ordering,
deadline renewal, service identity and context restoration are preserved verbatim.
Only two Golf early-return guards are inserted after deliberate-pause checks.
No pending Eleven Up, Canasta or general Blast-sweep candidate is included.

Final MD5(pg_get_functiondef(...)) contracts:

| Function | Installed fingerprint |
|---|---|
| private.pause_all_humans_auto_fold(uuid) | 347ab39eadb7ae710292d01be7985161 |
| private.golf_recover() | c9cb1b6e82fda6d5210891a744c2191b |
| public.admin_blast_fake_money_game(uuid) | d4308a8cd54aa35905055f974b8c0b5c |

Later Eleven Up integration must start from this shared pause contract and retain
both Golf guards and the poker changes. Do not overwrite it with an older body.
Private functions remain postgres-only; Blast retains authenticated EXECUTE with
its existing internal admin check. The advisor's authenticated-definer notice is
intentional here and authorization/real-money denial are proved. Pre-existing
unrelated advisor findings are outside this release.

## Migration and qualification

CLI-created source: `20261025002701_golf_active_match_completion.sql`.
Hosted migration: `20261025002739`, name `golf_active_match_completion`.
Both preimage and final function hashes are guarded. Only function DDL persists;
admission, active-run state, balances and financial history are not migrated.

Eight hosted candidate and eight installed units pass: full nine-hole autonomous
human+bot and two-human play-money settlement/terminal/continuation, real-money
pause/reclaim/resume, expired/unexpired boundaries, deliberate pause, stale and
outsider reclaim, both flag resets, canonical balance/replay, paired twos, active
and settled Blast, interrupted cleanup rollback, admin/money refusal and financial
winner/tie/replay/failure rollback. Fixture recovery is restricted to generated
IDs. Same-snapshot containment proves existing records, admission and function
definitions restored, with no fixture residuals. Scoring waits use actual clocks.

The HOLM settlement and seven-game pause suite passes before and after installation,
including real-money HOLM/357 first-timeout continuation, last-present-human pause,
reclaim/resume and dice exclusions. Raw compact evidence is
`dev/six-card-golf/evidence/completion-release-20261024.json`.

Application TypeScript, 2,895 source tests (416 files), 241 harness tests and
production Vite build pass. Existing bundle warnings remain.

Actual Edge phone-layout checks pass for direct rejoin, authoritative disappearance
after reload, pencil formatting, blank future holes, held totals, final-action
anchors and no visible pile flash during the 1200ms scoring hold. No browser errors
or external fixture requests. Physical iPhone acceptance remains Jeremy's smoke.

## Publication and owner smoke

Source checkpoint: `golf-completion-release-20261024`. Exact-SHA public manifest,
Vercel READY deployment and persisted release signal must agree before calling live.
Refresh both clients; check +/E/- scores and blank future holes, expire a play-money
turn and uncheck the direct Auto-play control, and watch the last move through
scoring and pencil totals. Deliberate pause must stay paused. Do not Blast an
existing user session for smoke; cleanup has rollback-contained proof coverage.
The pencil style, iPhone card-backs and landscape/four-player limitations remain.
