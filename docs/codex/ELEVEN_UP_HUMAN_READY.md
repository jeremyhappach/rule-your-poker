# 11 Up human Ready timeout — local qualification, no release

Base: `0ecd5ab0cb604331605615cb2487dd4096deb4a7`.
Branch: `codex/eleven-up-human-timeout`.
Worktree: `C:/Users/jerem/AppData/Local/Temp/eleven-up-human-timeout`.
Owner clarification, October 21, 2026: inactivity handling applies only to Ready.
The playing countdown remains the shared versioned scoring clock. No second
inactivity timer, disconnect extension, scoring reset or automatic resume.

## Behavior and ownership

`supabase/eleven-up/human-ready.sql` is an unregistered local candidate, layered
after the original bot transaction. It changes only 11 Up owners and adds a
player-flag trigger guarded by the current 11 Up competition identity.

- Real-money Ready timeout refreshes only the unstarted Ready allowance and
  invokes versioned `set_game_paused`; the existing 11 Up pause trigger freezes
  it and canonical resume shifts it. No zero score or participant advance.
- Fake-money Ready timeout persists canonical `auto_fold` and
  `sit_out_next_hand`, checks the existing configured all-human safeguard, and
  otherwise commits the first legal bot move in the same transaction. The
  existing visible-information bot policy and shared reducer own every move.
  Atomic first play prevents repeated reclaim from renewing Ready indefinitely.
- Active scoring expiry uses the unchanged reducer, irrespective of human
  presence. Automatic all-human handling is deferred to the next Ready boundary;
  explicit authorized table pause remains the existing canonical behavior.
- `eleven_up_reclaim(uuid,bigint)` authenticates the frozen participant and locks
  round → game → match → player. It clears both flags without changing deadlines,
  resuming the table or executing a move. The expected revision rejects a reclaim
  that lost a race; its UI remains checked until authoritative acknowledgement.
  A definitive stale response refreshes the view so the player can retry.
- Canonical flag changes increment the match revision, publish through existing
  realtime, and reschedule/clear bot work. Old gameplay revisions cannot cross a
  reclaim. Recovery rereads locked state and checks its original candidate revision.
- Recovery advances one phase per wake, so long disconnect catch-up cannot skip
  a Ready boundary. Late human actions likewise cannot bypass Ready handling.
- Existing `eleven_up_close` applies deferred sit-out only after the competition
  and terminal hold. No participant is removed midway through their rounds.
- The shared view displays a persistent Auto-play checkbox, including while
  paused and between rounds, and a robot beside an autoplay opponent's score.
  Controls and metadata remain absent in Arcade and Session Ended.

The all-human guard retains its existing configuration contract (enabled
`auto_fold` policy); this change does not change defaults or force another game
into that policy. Bot admission remains fake-money-only. Scoring, bonuses,
legal actions, rules versions, finances, canonical pause, and other game owners
are not replaced. Old absent control metadata maps to false in the new client.

## Local validation

Dedicated disposable database: `eleven_up_timeout_1792601764738`, loopback port
55439. It is a clone of the preserved bot qualification database. The original
database and stalled worktree were not modified. The template lacked canonical
pause/control functions; the local preparer restores exact retained definitions
plus current checked-in pause/active-actor definitions, not substitute mocks.
This is local qualification, not an assertion of current production schema parity.

- `node dev/eleven-up/human-ready-proof.mjs`: both Ready money modes; canonical
  pause version and Ready freeze/resume; legal strategic play; persistent snapshot
  flags; reclaim with unchanged active deadline/start time; stale gameplay rejection;
  all-human pause and paused reclaim without resume; active-clock safeguard deferral;
  canonical next-game sit-out; 36 both-money financial cases with actual ledger,
  snapshot, replay and injected-failure authority. These cases roll back.
- Late human RPCs exercise the same Ready boundary; nonmember/anonymous reclaim
  is rejected without mutation. Installing over pre-existing canonical flags
  publishes a new revision; repeat installation does not change it again.
- Independent connections exercise bot-first and reclaim-first ordering: stale
  reclaim rejects, retry succeeds, and old bot work cannot act after reclaim.
  These synthetic race fixtures remain only in the dedicated local database.
- `node dev/eleven-up/human-ready-browser.mjs` against the isolated preview:
  actual SQL takeover, reconnect, opponent robot, checkbox reclaim, unchanged
  scoring deadline, reclaimed reload, and six viewport checks: 320×568, 375×667,
  390×844, 430×932, 844×390 and 667×375. No page errors or overflow. Portrait and
  landscape screenshots were inspected. Desktop emulation is not physical iPhone smoke.
- `npm run build`: TypeScript, 2,587 application tests, 241 harness tests and Vite
  production bundle passed. Existing Browserslist/chunk warnings remain.

Evidence: `supabase/eleven-up/human-ready-evidence.json`; raw proof and browser
results/screenshots are under `qualification.local/eleven-up-timeout/`.

## Changed files

- Database candidate: `supabase/eleven-up/human-ready.sql`.
- Client: `src/lib/elevenUp/model.ts`, `src/lib/elevenUp/client.ts`,
  `src/hooks/useElevenUp.ts`, `src/components/elevenUp/ElevenUpView.tsx`,
  `src/components/elevenUp/elevenUp.css`.
- Regression tests: `src/lib/elevenUp/humanReady.test.ts`,
  `src/components/elevenUp/polish.test.tsx`.
- Local qualification: `dev/eleven-up/human-ready-local.mjs`,
  `human-ready-proof.mjs`, `human-ready-preview.mjs`, `human-ready-browser.mjs`.
- Evidence and scoped documentation: this file, `human-ready-evidence.json`,
  `CURRENT_RELEASE.md`, `DECISION_LOG.md`, and `REPO_MAP.md`.

## Remaining release blockers

No push, main integration, production read/write, migration registration,
deployment, stalled-task mutation or pending-request retry/cancellation occurred.
The unresolved durable operation still blocks the shared release lane.

The original migration and package sources remain byte-for-byte unchanged:
`20261021002901_eleven_up_bots.sql`, SHA-256
`dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d`.

After authoritative resolution of that operation, a separately authorized release
must reconcile current main, inspect installed definitions/history, register and
qualify a NEW forward migration for `human-ready.sql` after the original bot
package, verify the real all-human configuration and canonical dependencies, and
publish its matching client. Do not edit/replay the original migration to include
this addition. Owner production and physical-phone smoke remain outstanding.
