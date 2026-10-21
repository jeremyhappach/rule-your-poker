# 11 Up human Ready timeout — qualification and combined release

## Authorized production release, October 21

Jeremy directly approved the combined rollout from `33e7a1cc90af69d6bbdd0027733bd888ce6dab74`.
Race's production `fe71aa33b596887e7647350c420162a5b66a8c80` is the preserved
integration baseline. Fresh checks found no 11 Up installation or unfinished
matches. The original interrupted task remained idle and no competing release
worker was active. No original task or pending request was restarted.

Hosted migration history assigned `20261021185314` to `eleven_up_bots` and
`20261021185320` to `eleven_up_human_ready`. Their stored statements exactly equal
the qualified local files `20261021002901` and `20261021181947`, respectively.
This is a documented local/hosted version mapping, not permission to replay them.
Both ordered installations succeeded, with admission held closed throughout.

Candidate and installed production rollback proofs pass six financial cases,
both Ready modes, fake strategic first move, control reclaim, active-clock
inactivity exclusion and false/none all-human Ready pause. They assert existing
balances, Race definitions/admission and global defaults are unchanged. Fixture
identities do not persist. Installed authority matches 23 local function definitions
(line endings normalized); the legacy two-argument pause overload is absent from
the retained local database but exactly matches its production preflight text.
Migration statements match exact bytes, not normalized hashes. Recovery runs
succeed, and reclaim permissions deny anonymous callers. 55 combined client tests,
TypeScript and Vite build pass; the client geometry is unchanged from six-layout
browser qualification. Final production SHA and restored admission are verified
in the delivery report after publication. Physical-phone/owner smoke remains open.

`dev/eleven-up/combined-production-proof.mjs` generates candidate/installed proof
payloads. Installed qualification temporarily enables admission only inside its
rolled-back transaction; concurrent sessions continue seeing the committed closed
gate. Never execute a proof without its enclosing rollback transaction.

The earlier local-only phase and release requirements below remain historical
qualification context; this explicit approval supersedes the local-only limit.

Base: `0ecd5ab0cb604331605615cb2487dd4096deb4a7`.
Branch: `codex/eleven-up-human-timeout`.
Worktree: `C:/Users/jerem/AppData/Local/Temp/eleven-up-human-timeout`.
Owner clarification, October 21, 2026: inactivity handling applies only to Ready.
The playing countdown remains the shared versioned scoring clock. No second
inactivity timer, disconnect extension, scoring reset or automatic resume.

## Behavior and ownership

`supabase/eleven-up/human-ready.sql` is registered locally as the byte-identical
forward migration `20261021181947_eleven_up_human_ready.sql`, after the unchanged
original bot transaction. It adds a player-flag trigger guarded by the current
11 Up competition identity and a scoped predicate in the canonical all-human guard.

- Real-money Ready timeout refreshes only the unstarted Ready allowance and
  invokes versioned `set_game_paused`; the existing 11 Up pause trigger freezes
  it and canonical resume shifts it. No zero score or participant advance.
- Fake-money Ready timeout persists canonical `auto_fold` and
  `sit_out_next_hand`, checks the canonical all-human safeguard, and
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

The all-human guard applies at 11 Up Ready even with production's inherited or
explicit `false`/`none` timeout policy. At other 11 Up phases it cannot initiate
an inactivity pause. Both precheck and locked recheck use this predicate; counts,
locks, pause owner, and every other game's configuration contract are unchanged.
The installer rejects an unexpected source shape. No defaults are changed.
Shared callers inspected: automatic-play RPC, canonical timer dispatch, Holm
recovery/preparation/activation, and 3-5-7 recovery/advance. They retain their
existing behavior outside 11 Up. Bot admission remains fake-money-only. Scoring, bonuses,
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
  production bundle passed at `e1aaf3975bf562fceb9f1917cb61974cf5720d4a`.
  Client sources are unchanged in this SQL-only follow-up. Existing warnings remain.
- Forward qualification: the preparer installs original then registered forward
  migration, verifies source equality and original SHA-256, proves no default-row
  changes, and compares the canonical guard with only its two new predicates
  removed. All other function text is identical. Full SQL/financial/race proof
  rerun passes, including inherited and explicit false/none and direct guard
  invocation during playing. Eight focused regression files / 49 tests pass.

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

No push, main integration, production writes, deployment or pending-request
retry/cancellation occurred. The original task was subsequently observed
interrupted; Jeremy confirms approval cards cleared. This is no longer a blocker
to local qualification, but does not authorize production execution or claim the
shared release lane. Race Poker remains a separate waiting release.

The original migration and package sources remain byte-for-byte unchanged:
`20261021002901_eleven_up_bots.sql`, SHA-256
`dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d`.

A separately authorized serialized release must reconcile current main and
recheck installed history/definitions against this qualification. Install only
the missing members of this ordered pair: original `20261021002901`, then forward
`20261021181947`. Inspect before applying; verify an installed member rather than
blindly replaying it. The original enables bot admission, so temporarily close new
11 Up admission during the ordered database/client rollout, verify both installed
definitions and exact deployed client SHA, then restore admission only after
successful checks. No admission changes are authorized by this local task.
Do not modify the original migration. Owner production and physical-phone smoke
remain outstanding. This package is locally qualified, not deployed acceptance.
