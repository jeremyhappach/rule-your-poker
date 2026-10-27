# Words reveal, time banks and pause — LOCAL review — 2026-10-27

Owner authorized local implementation and preview only. No push, hosted migration,
deployment or admission change is authorized. Golf's release remains independent.

## Finding and presentation correction

The actual Game route reproduced the report through `ptown_words_action`, the
public revision event, snapshot RPC, hook and production Words components. The
server's original 200ms focus and 260ms reveal slots elapsed before the viewer
painted the snapshot: C and A first appeared at the same timestamp, with T later.
The prior implementation put every letter in the DOM immediately and relied on
CSS animation delays. A longer focus alone still reproduced two tiles together.

New tile contents now enter the board only in their scheduled reading-order slot.
Existing board tiles stay stable. Board and canonical word/points announcement
share one presentation projection anchored to the viewer's first observation.
That receipt is saved per viewer/match/turn, so equal events and refresh do not
restart it. Canonical pause shifts it by exactly the authored pause shift.

New matches use the existing server-owned focus/reveal phases with 800ms focus,
300ms tile cadence, 1600ms notice and 350ms hold. The local catch-up projection
never changes the server readyAt or turn deadline: late delivery may shorten
spacing (minimum 120ms) and notice (minimum 750ms), retaining the 350ms hold.
Very late reconnects show committed state instead of inventing another hold.
The normal full 180-second turn begins at the authoritative handoff. Terminal
settlement and canonical announcement/financial ownership are preserved.

## Time banks and pause

New admissions freeze `ptown-words/2`. One reducer validates both immutable /1
and /2 rules; dictionary, distribution, scoring, pass/timeout, settlement and
fake-only eligibility are unchanged. Existing /1 matches do not gain banks.
Each /2 player has two numbered slots, each adding exactly 180000ms to the
existing deadline. The ordinary match request UUID, revision and row locks own
atomic spend/replay. Spent slots remain in authoritative match state across turns,
pause and reconnect. New matches reset them. Only an active, actionable human
may spend; the bot policy is unchanged and does not use the banks.

The compact pause icon invokes the existing versioned `set_game_paused` for the
current host. Other players submit `request_pause` through the Words command
owner; it never changes the clock or pause state. The canonical announcement
rail shows the authoritative roster name and persists the request across
reconnect. One request is retained per pause/host episode; repeated requests do
not queue notices. A pause or canonical host change clears it. Host changes emit
a Words revision, preserving strict equal-revision snapshot semantics.

Paused JSX conceals all board letters, rack letters/values and accessible tile
labels immediately, including the initial paused snapshot. The board and rack
also blur; status and host Resume remain legible. This is visual concealment,
not prevention of screenshots, prior knowledge or inspecting client memory.

## Local qualification and preview

Prepared SQL: `supabase/ptown-words/banks-pause-local.sql`. It has not been applied
to Supabase. The isolated loopback database loads a read-only captured canonical
pause definition because its old template lacked the deployed four-argument RPC;
that compatibility source is a local harness dependency, not a proposed shared
production migration.

`dev/ptown-words/banks-proof.mjs` passes concurrent identical/different UUIDs,
exact additive spend, exhausted slots across turns, wrong actor, expired turn,
legacy /1, timeout pass, request dedupe, host authority/transfer, pause/resume
remaining time and the existing full core/canonical financial rollback proof.
Evidence: `dev/ptown-words/evidence/banks-pause-database.json`.

Focused client tests cover hidden contents, horizontal/vertical order, receipt
dedupe/refresh/pause shift, bank slots and unclamped extended timer, waiting-player
request-only actions, host controls, paused first render and catalog eligibility.
Browser proof uses real Game/RPC/revision events for human and bot placement;
synthetic data preparation does not replace any live action or reveal path.

Final local qualification passed: 66 focused tests, TypeScript, the actual Game
route build, database/financial rollback proof, and the serial browser suite.
Recorded first-visible gaps were 318/295ms for human horizontal placement,
300ms for human vertical placement, and 283/317/299ms for bot placement. Existing
tiles remained stable and reload did not replay the reveal. Both human layouts
passed request/host pause, concealed paused refresh, resume and bank persistence.
All four viewport sizes passed target/bounds checks. Browser evidence is
`dev/ptown-words/evidence/banks-pause-browser.json`.

Earlier overlapping browser runs encountered local database connection timeouts.
After closing the old Words preview and stabilizing the memoized projection, the
final serial suite completed with no recorded browser errors. This is local
qualification, not a claim of hosted release qualification or owner smoke.

Preview: `http://127.0.0.1:15308/dev/ptown-words/banks-preview.html`.
Use **Play with a bot**, or the two-player fixture for request/host review.
Independent human browser sessions are required for separate authenticated users.
The script captures 320x568, 390x760, 844x390 and 1024x760 layouts and checks 44px
targets. Evidence/screenshots are under `qualification.local/ptown-words/banks`.

Reproduce with existing dependencies: `node dev/ptown-words/build-route.mjs`,
then run `route-server.mjs` with PTOWN_WORDS_BOTS=1, PTOWN_WORDS_POLISH=1,
PTOWN_WORDS_BANKS=1 and PTOWN_WORDS_PORT=15308; run banks-proof.mjs and
banks-browser.mjs. The older Words preview on 15307 was stopped to release its
local test resources; the new preview is on 15308. Other game worktrees and
services are untouched.

## Review boundary

Owner review should confirm reveal pacing, two circular +3m controls, the pause
request notice and concealed state. A later release requires explicit approval,
fresh deployed preimage qualification, hosted financial/recovery proofs and the
normal exact-SHA publication gates. This local candidate does not authorize them.
