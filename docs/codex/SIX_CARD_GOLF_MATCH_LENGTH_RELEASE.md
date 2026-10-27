# Golf match-length release qualification — 2026-10-27

## Completed release gates

All **17 candidate and 17 installed-authority units pass**. Each matrix covers
configuration and legacy behavior, four complete two-human matches, 72 canonical
financial winner/tie cases across 2–4 seats and both money modes, and four
Run Back/late-replay continuations. Actual installed proofs use the production
default reader/table, with no temporary-default adapter. All synthetic records
roll back, and preservation checks pass. The prior 24 local full matches and
independent-connection settlement/replay evidence remain applicable; no locking
or settlement-claim ownership changed. The 152 frontend assertions, 15 reviewed
browser cases, application TypeScript and production build pass.

The one needed migration was applied successfully as **20261027194322**. The
connector assigned that version; the CLI-created 20261027192846 file was renamed
to match hosted history, with identical SQL bytes (SHA-256
`c6aeb56c685717442d625d6f5051fe477744c31a61dad9b8bb447311f4ee0083`). No Words,
Quintzee or other migration was repeated. Default nine, 1200ms scoring delay,
5000ms results hold, admission and money-mode eligibility are preserved.

Evidence: `dev/six-card-golf/evidence/match-length-release-candidate.json` and
`match-length-release-installed.json`. The approved release checkpoint tag is
`golf-match-length-release-20261027`. Publication verifies the tag's exact commit
against Vercel READY, holm357.com/build-manifest.json, the persisted
release_publication value and a successful GitHub publisher run. Those observed
deployment values are returned with the release result. Physical iPhone Chrome
smoke remains the owner's final acceptance step.

The following sections preserve the initial attempt and its diagnosis; their
uninstalled/pending statements are historical and superseded by this checkpoint.

## Diagnosed rehearsal interference — supersedes unresolved blocker below

The shared scheduler's retained slow-task history identifies SQLSTATE 55P03
(`lock_timeout`), lasting 751–760ms, for `canonical_timers` during the candidate
rehearsals. The deployed canonical timer function's legacy scan always joins
`public.game_defaults`; its task wrapper caps lock acquisition at 750ms.
The rehearsal executes `ALTER TABLE public.game_defaults ADD COLUMN`, retaining
AccessExclusiveLock throughout the long fixture and history-containment capture.
That conflicts with the timer scan's AccessShareLock. A two-connection isolated
local reproduction captures the exact lock and reproduces 55P03; the read succeeds
after rollback. See `dev/six-card-golf/evidence/match-length-lock-repro.json`.
No canonical timeout occurred after the original rehearsals stopped, through
the recorded 19:40:18 UTC healthy observation. No competing writer or persistent
production incident was found. This is qualification-induced lock contention.

The long candidate fixture now clones defaults into a connection-local temporary
table and redirects only its temporary candidate default-reader body there.
All other candidate gameplay/financial bodies, actual canonical tables, triggers,
RPC identity checks, health guards and containment assertions remain in force.
The exact production DDL and default storage contract already passed the initial
short configuration rollback proof; the actual migration remains unchanged.
Installed proofs use the real installed default reader and table with no adapter.
This avoids holding production DDL locks for full gameplay/financial rehearsals.
No production timer, health record, timeout, trigger or customer game was changed
to clear the rejection. Both original rejected requests remain in the evidence.

The revised matrix adds four explicit continuation cases: the real terminal hold,
duplicate finish, a new Run Back identity with fresh human consent, frozen length,
an old real action receipt replayed after successor admission, and complete
successor state/revision/round preservation. Both revised matrices passed before
frontend publication.

Jeremy explicitly approved production publication of candidate
`928887f1a11d27e4c80003170d85b54841ad25bb`. Scope is multiplayer 3/6/9/18
holes, default nine, dealer override, frozen authoritative duration, legacy nine
fallback, flag label and reviewed pencil scorecards. Admission, money eligibility,
financial ownership and unrelated games must remain unchanged.

## Reconciliation and validation

Fetched origin/main remains `07a08ea8788ae94595ec35c495ee6c7cd9f424ec`, the
candidate's ancestor; no merge is needed. Main's checkout contains an unrelated
Cribbage snapshot edit, preserved. Words and Quintzee migrations are already in
hosted history and were not reapplied. Golf's six function preimages matched
the guarded candidate. Existing admission is enabled.

152 focused assertions, application TypeScript and production build pass.
The previously reviewed 15 browser cases, 24 local full matches and 72 local
financial cases remain available. No product changes followed the reviewed UI.

CLI generated `20261027192846_six_card_golf_match_lengths.sql`. It contains
the reviewed candidate with bounded lock/statement timeouts and unchanged
function guards. **It has not been installed.** No other migration was applied.

Hosted generator: `dev/six-card-golf/match-length-release-proof.mjs`.
It reuses the existing same-snapshot containment and rollback wrapper,
collision-checked synthetic Auth/game/financial fixtures and actual triggers.
Recovery runs through a temporary copy of the deployed body restricted to the
fixture namespace. It does not replace deployed recovery, seed scheduler health,
disable triggers, or use customer games/balances as fixtures.

Candidate hosted passes: configuration (all lengths, invalid values, default
isolation, admission/reconnect freeze, legacy compatibility); full two-human
fake-money matches at 3/6/9 holes; 2–4-seat every-winner-count financial cases at
3/6 holes in both money modes and 9 holes in fake money. These verify exact
canonical chips, balanced journals, shared ties, injected after-chip rollback,
duplicate settlement, final snapshots and terminal session disposition. Full
matches also cover action receipts, stale/conflicting requests, linked rounds,
late final receipt and membership rejection. Each passing unit verifies rollback
and preservation of existing records, function authority, defaults and admission.

The 18-hole hosted units and installed matrix did not run. Fresh continuation /
Run Back and late replay after successor admission must also be included in the
remaining release proof before installation; earlier release evidence alone is
not a completed new release gate. No release-ready claim is made.

## Blocking evidence

- At 19:29:35 UTC, three-hole real-money qualification was rejected by the
  canonical admission guard: SQLSTATE 55000,
  `real_money_liveness_unavailable:active_recovery_failure`, task
  `canonical_timers`. Scheduler heartbeat was fresh and completed.
- A read-only check at 19:30:09 showed no active failures. After observing that
  external recovery, the unchanged proof passed on one retry.
- At 19:32:01, nine-hole real-money qualification hit the same protection.
  The release stopped without another retry.
- At 19:32:31, a final read again reported healthy, no active failures, Golf
  admission enabled, no `golf_holes` column and no installed match-length
  migration. Transient recovery does not explain or waive the repeated failure.

The exact failing admission details and passing units are retained in
`dev/six-card-golf/evidence/match-length-release-attempt.json`. The rollback
transactions leave no synthetic records; failed connector requests abort their
entire statement transaction. No health state or protection was altered.

The initial unresolved boundary was the recurring shared `canonical_timers` health
failure during qualification. Its cause is not established; neither a Golf
runtime defect nor proof-induced lock contention has been proven. Isolate that
cause before resuming, without broadening this release into shared scheduler
changes or retrying until a favorable result appears.

Security advisors were inspected before installation. They reported existing
platform findings including RLS disabled on `gameplay_transfer_pending_changes`
and intentional authenticated SECURITY DEFINER RPCs. This release adds no new
RPC or permission grant; unrelated security remediation was not performed.

## Publication and smoke — pending

No branch/main push, deployment, migration installation or admission mutation
occurred. Current verified production deployment is
`dpl_GagLaiwVpRi75PuyUCPmHQ7KSFNj`, READY at the previous main SHA above.
There is no Golf release SHA/manifest/signal to report yet.

After qualification, install only this migration, rerun installed proofs,
fast-forward main while preserving the Cribbage edit, push using the required
helper, and verify exact SHA agreement across Vercel READY, the production
manifest and persisted `release_publication`, plus successful publisher run.

Owner smoke after actual publication: https://holm357.com — check default nine,
dealer 3/6/9/18 choices without changing the saved default, flag label, completion
at the selected hole, final Out/In/Total pencil scorecard and Run Back. Physical
iPhone Chrome smoke remains the owner's acceptance step.
