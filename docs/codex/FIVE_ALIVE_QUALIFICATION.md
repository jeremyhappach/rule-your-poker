# Five Alive local qualification — November 12, 2026

## November 16 local Actions retry blocked — GitHub CLI unavailable

At `2026-11-17T00:22:04Z` (November 16 local time), the authorized local retry
stopped at its first prerequisite. `gh auth status` exited **1**:

> The term 'gh' is not recognized as a name of a cmdlet, function, script file, or executable program.

No `gh.exe` was found in the checked Program Files (both architectures), per-user
Programs, WinGet Links, Codex bin, Scoop or Chocolatey install locations. The
release-workflow search found no alternate CLI path. This establishes an unavailable
CLI, **not** a GitHub authentication rejection or a determination of Actions scope.
Local Actions write access could not be verified, and the requested
`gh run rerun 43973296114 --failed --repo jeremyhappach/rule-your-poker`
was not executed. No tool installation or credential/verification-code flow was
attempted. The reported connector 403 was not retried.

The existing worktree is `codex/five-alive`; its remote is
`https://github.com/jeremyhappach/rule-your-poker.git`. Local main and origin/main
both identify deployed candidate `4fb956ac58a258e074a3938c66c659410e17022c`;
the worktree's initial HEAD was the preserved checkpoint commit `04409f9c5`.
The unrelated Cribbage snapshot change remains untouched.

**Actual outcome:** no Actions retry, release-signal publication, deployment,
activation or gameplay smoke was performed in this pass. The last verified
production state remains the READY candidate with Five Alive admission closed
and zero allocations, as recorded below; it was not re-queried in this pass.
The approved Arcade and fake-money Async smoke checks remain pending.
Evidence: `qualification.local/five-alive/hosted/local-actions-cli-blocker-20261116.json`.

**First open gate:** make the `gh` command available to this local session,
verify its existing authentication with `gh auth status`, and retry only failed run `43973296114`.
Successful publication for the exact deployed SHA remains mandatory before the
existing guarded activation and gameplay smoke procedure. No qualification,
standard checks or production installation rehearsal needs repeating for this
documentation-only pass.

## November 16 final outcome — source deployed; release signal gate failed

**Stopped before gameplay activation.** The fresh isolated browser-origin and
authenticated baseline smoke passed. Candidate
`4fb956ac58a258e074a3938c66c659410e17022c` was tagged, fast-forwarded and pushed
through the approved helper. Vercel `dpl_HXXRqVZi56A8DoAo3meZV7AuScXk` is
**READY / production**. Both `https://ptown-poker.vercel.app` and
`https://holm357.com` now serve that exact commit and `assets/index-D0tiQaYo.js`.
A fresh navigation in the isolated test-account context verified the production
URL again, 16 Arcade tiles including Five Alive, and zero page errors. No personal
Chrome session was used. This verifies the deployed catalog, not a completed
Five Alive production game.

**Exact blocker:** GitHub release run
[43973296114](https://github.com/jeremyhappach/rule-your-poker/actions/runs/43973296114),
job `133670744240`, passed qualification but failed
`Verify production or record an intentional documentation-only skip`. At
`2026-11-16T23:00:14.638Z`, `scripts/deployment/release-decision.mjs:29` exhausted
its production wait and threw:

> Production never served the expected commit; no release signal published

The last sampled live SHA was `2f39f556a3621d765f72ce599bbe53e28b5648f4`.
Vercel completed its approximately 15-minute build afterward. The release-signal
publication step was skipped. The deployed candidate is now verifiable, but
the required workflow is still failed; it was not rerun after this new gate
failure, following Jeremy's stop instruction.

The closed installation remains applied as migration
`20261116224512_five_alive_qualified_v3_closed_release`. Final database readback:
1,021 answers, all three Arcade rulesets disabled, `async_enabled=false`,
`async_real_qualified=false`, and **zero allocations**. Production balances and
unrelated games were not changed. The catalog code is visible; gameplay remains
closed. No full Five Alive production gameplay smoke or release-readiness claim.

Evidence in `qualification.local/five-alive/hosted/`: production-auth-preflight-20261116.json/PNG,
production-installation-20261116.json, production-release-closed-20261116.json,
production-catalog-closed-20261116.png and release-signal-failure-20261116.json.
The prepared production-activation-20261116.sql has **not** been executed.

**First open gate on resume:** rerun the failed release-signal job against this
already-live SHA and verify successful publication; then execute the scoped
activation and full authenticated Five Alive production-game smoke. Preserve
the completed qualification and standard checks. The 8,979-word expansion gap
remains post-launch work, with only individually qualified answers admitted.

## November 16 publication in progress

Qualified candidate `4fb956ac58a258e074a3938c66c659410e17022c` was committed,
tagged `five-alive-qualified-release-20261116`, fast-forwarded into clean main
and pushed with the unchanged approved helper. Vercel production deployment
`dpl_HXXRqVZi56A8DoAo3meZV7AuScXk` is building. GitHub run `43973296114` passed
its qualification step and is awaiting the exact production SHA before publishing
the release signal. Admission remains closed pending READY and live verification.
The unrelated Cribbage snapshot remains unstaged in the Five Alive worktree.
The ESDB copyright is preserved byte-for-byte under its existing `-text` policy;
its original CRLF/whitespace is excluded from whitespace lint. One trailing blank
line in the qualification runner was removed; product code and tested SQL bytes
were unchanged. All other staged whitespace checks passed.

## November 16 isolated production smoke passed; closed installation applied

A fresh headless Edge process and new Playwright context verified both `page.url()`
and `location.href` at `https://ptown-poker.vercel.app/` before authentication.
Vercel reports the alias as READY / production at
`2f39f556a3621d765f72ce599bbe53e28b5648f4`; the served build manifest matched.
The loaded bundle uses production Supabase `xvhmbuppghwmwpwrkzao`, not the isolated
project. The approved E2E player 1 signed in through the real login form (HTTP 200).
The authenticated Arcade lobby, rules dialog, leaderboard and Play admission passed
with zero page errors and zero gameplay writes. No personal Chrome session was used.
Evidence: `qualification.local/five-alive/hosted/production-auth-preflight-20261116.json`
and the adjacent PNG. This clears the previous browser-origin blocker; Five Alive
production gameplay smoke still follows deployment and activation.

The exact rehearsed package (SHA-256 `ba30970eb37cbfd8b0a29a5b42f59926e48f85b6dbae4c4b574714c6d8075a83`)
was applied through Supabase migration `20261116224512_five_alive_qualified_v3_closed_release`.
Post-install assertions passed: 17 qualified functions, 1,021 answers and tiers,
closed admission, unused pool, correct rules/pool version and denied direct access.
The security advisor added only five expected INFO notices for private RLS tables
with no public policies; existing unrelated warnings/errors are unchanged.
No production game/financial function was invoked and no balances changed.

The previously passed standard checks and installation rehearsal were preserved
without rerunning. Fresh fetch confirms HEAD, main and origin/main still share
`bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d`; the main release worktree is clean.
Next: commit the qualified candidate, fast-forward/push main, verify the exact
production deployment, activate Five Alive only, and run the production game smoke.

## November 16 final checks passed — browser policy prevents production smoke

The five catalog/layout failures are resolved. All four edited fixture files pass
**46 focused tests**. Assertions remain exact: 16 Arcade tiles, all existing links
and relative ordering, the entire saved ordering payload including hidden entries,
and the unchanged historical ordering seed. Five Alive appends to P-Town Originals
after saved placements (before River City Run and Ship Cap Voyage in the legacy
seed fixture); the Other Games order is unchanged. Its catalog identity is tested
once, with order 26, solo Arcade, Async help, no live-table admission and no bots.

**Full standard `npm run build`: exit 0.** App typecheck, **4,282 app tests in
585 files**, **241 harness tests**, **46 release-tooling tests**, Vite production
build and the existing 90,000,000-byte size gate all passed. Log:
`qualification.local/five-alive/hosted/final-release-checks-20261116.log`.
Focused fixture log: `catalog-fixtures-20261116.log` in the same directory.
`git fetch origin` confirmed the candidate base still matches current main
`bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d` (0 ahead / 0 behind). The scoped diff
was reviewed and `git diff HEAD --check` passed; unrelated changes remain intact.

### Production installation rehearsal passed and rolled back

`dev/five-alive/release-package.mjs` builds `supabase/five-alive/release.sql`
from the qualified SQL and fresh production catalog definitions. It guards the
nine shared-owner preimages, installs all three vocabulary versions behind closed
admission, preserves existing artwork allowlist members while adding Five Alive,
and creates only Five Alive's default/artwork configuration rows. It verifies
all 17 resulting functions against the isolated qualified definitions, the exact
1,021-answer bank and tiers, unused pool cursors, closed admission, RLS and denied
direct secret-table/RPC access for anonymous/authenticated clients.

The complete package passed on production inside **BEGIN / ROLLBACK**. Returned
evidence: `qualified_definitions=17`, `qualified_answers=1021`,
`admission_closed=true`, `private_access_checked=true`. No production game or
financial function was invoked; no durable schema, application-row or balance
change was made. The passed financial/Auth/Realtime/recovery/browser proofs were
not repeated. Package SHA-256:
`ba30970eb37cbfd8b0a29a5b42f59926e48f85b6dbae4c4b574714c6d8075a83`.
Evidence: `qualification.local/five-alive/hosted/release-installation-proof.sql`
and `release-installation-proof-result-20261116.json`, with catalog preimages and
qualified function definitions alongside them. This is a passed rehearsal,
**not an applied migration**.

### Exact blocker and actual release outcome

Before installation/publication, Computer Use inspected the available sessions
to locate an existing signed-in browser for the required production-game smoke.
Chrome was available as native window 66744; no Chrome browser-control session
was exposed. Binding that observed window through `cua.getApp` was stopped by
the Computer Use policy:

> Computer Use has been stopped for this turn because it could not determine
> the current browser URL on Windows with enough confidence to enforce policy.

No fallback was used to bypass that policy. The required authenticated production
browser smoke cannot be performed through the stopped UI tool in this turn.
Per Jeremy's stop-on-gate-failure instruction, release stopped **before** durable
production installation, admission activation, commit/tag/push or deployment.
No production smoke result or new deployed Five Alive commit is claimed.
The last inspected production deployment remains
`dpl_4oah2QK8T1sbp3PqXARbBUEAeXTB` at `2f39f556a3621d765f72ce599bbe53e28b5648f4`.

**Resume:** restore a policy-verifiable authenticated browser-control path, then
finish the already-authorized checked installation, normal Git/Vercel release,
guarded activation and actual production-game smoke. Preserve the passing checks;
only rerun those whose candidate or relevant preconditions change. The 1,021-word
launch approval stands; roughly 10,000 remains post-launch growth work. Candidate
and checked release package remain local and uncommitted. Production is unchanged.

## November 16 release continuation — merge complete; catalog tests block release

Jeremy authorized resolution of the three integration conflicts and production
release with the 1,021-answer bank. The roughly 10,000 target remains post-launch
growth work, not a release blocker.

### Merge and preservation

Fetched current main, preserved the complete existing candidate in stash
`050908cbd417b23771ef06c51dd7b39c0dee48dc`, fast-forwarded `codex/five-alive`
from `f8aa84630` to `bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d`, and restored
the candidate. Only the three previously authorized conflicts occurred; all are
resolved. The preservation stash is retained. No history was rewritten or pushed.

`matchLobbyStatus` keeps main's active/not-held/not-removed guards, terminal and
deadline exclusions, viewer-specific admission and opponent ownership semantics
for the ten existing Async games. Five Alive independently counts its authoritative
`playable` and `opponentPlayable` flags without relying on actor ownership, and
excludes a child when neither player has an obligation. Mixed-lineup and
null/either-actor cases, one/both finished players, expired/terminal children and
held/removed/inactive matches are covered by the focused tests.

All upstream content in BACKLOG.md and CURRENT_RELEASE.md remains intact after
the Five Alive sections. The unrelated Cribbage snapshot matches the preservation
stash (ignoring line-ending representation). `git ls-files --unmerged` is empty.
The reviewed source diff retains newer main's unrelated Arcade/Delayed changes.
Receipt: `qualification.local/five-alive/hosted/merge-preservation-20261116.json`.

### Local release preparation and checks

- Registered Five Alive in GAME_CATALOG and the active Async rules list; removed
  the temporary direct-descriptor fallback from the Arcade board. Shared gameplay
  rule version remains `five-alive/1`, runtime vocabulary `esdb-five-alive/3`.
  The rules-completeness fixture now includes the authorized entry.
- Stash restoration exposed Windows CRLF conversion of the newer answer/review
  files. Restored the exact original SHA-256 bytes and added `answers.* text
  eol=lf` to the private vocabulary attributes. No words, tiers, meanings or
  qualified hashes changed. All three vocabulary integrity tests pass.
- **35 focused lobby/notification tests pass.** The notification test needs the
  jsdom annotation because the merged lobby's existing game-name helper imports
  the browser client; its first plain-node invocation failed with missing
  localStorage, and the correctly configured test then passed.
- Standard `npm run build` passed the full app typecheck. App tests finished
  **4,276 passed / 5 failed**, across **581 passed / 4 failed files**. All **59
  RulesCompleteness tests passed**. Command exit: **1**. Because validate is
  fail-fast, harness tests, release-tooling tests, Vite and the size gate were
  not reached in this merged-candidate run. Earlier passes are not substituted.

### Exact new release blocker

The following catalog/layout expectations still omit the newly registered game:

1. `src/components/admin/ArcadeOrderingPanel.test.tsx:21`: actual saved section
   includes `five-alive` before the other appended games; expected list omits it.
2. `src/components/arcade/ArcadeSwitchboard.test.tsx:15`: actual visible links
   include `/arcade/five-alive`; expected list omits it.
3. `src/lib/arcade/lobbyLayout.test.ts:11`: actual Originals catalog includes
   `five-alive`; the legacy ordering expectation omits it. Preserve the historical
   stored seed and existing relative ordering when adding the new-game expectation.
4. `src/lib/gameCatalog/catalog.test.ts:9`: historical deployed-defaults parity
   does not separate the Five Alive addition from its frozen fixture.
5. `src/lib/gameCatalog/catalog.test.ts:29`: explicit Arcade-only game allowlist
   does not include `five-alive`.

Full failure output:
`qualification.local/five-alive/hosted/merged-release-preflight-20261116.log`
(failure summary starts at line 18677). Stopped on this new release-gate failure
as Jeremy explicitly requested; these four test files have not been edited.

**Actual release outcome: not deployed or activated.** No production migration,
application-row mutation, balance change, push, release tag or smoke was performed.
Only two read-only production catalog queries inspected required function/table
definitions; Five Alive's production release table is absent. Catalog preimages
are preserved locally. Existing hosted Auth, Realtime, financial/recovery,
Arcade-isolation and browser proofs were not rerun. The reconciled candidate and
local catalog registration remain in the worktree, uncommitted; production stays
withheld.

**Resume at:** update the four catalog/layout test fixtures for the authorized
entry while proving unchanged legacy placement/admission, then run standard
checks on the final candidate. If green, finish guarded production configuration,
normal Git/Vercel release and production smoke. Do not repeat the completed merge
or the preserved hosted qualification proofs unless their owners change.

## November 15 launch decision — 1,021 answers approved

Jeremy explicitly approved launching the current 1,021 qualified runtime answers
(`esdb-five-alive/3`). The roughly 10,000-answer target is now a **post-launch
growth goal, not a release blocker**. This supersedes the vocabulary-volume hold
in the historical passes below; it does not waive any technical release gate.
The remaining 8,979 answers are tracked in `BACKLOG.md`. Additions still require
individual familiarity/fairness review, preserved tiers and source records,
per-word qualification, and versioned allocation/replay/no-repeat proof.

Release continuation is authorized: standard candidate validation, catalog and
release-configuration checks, safe Git integration, production deployment and
smoke verification. Preserve completed qualification evidence and unrelated
games/changes. Admission remains closed until required release checks pass.

### Release pass result — integration blocked (November 16, 04:18 UTC)

The standard `npm run build` completed with exit 0 against the preserved current
candidate: full app typecheck, **4,072 app tests**, **241 harness tests**, **46
release-tooling tests**, Vite production build and the existing 90,000,000-byte
size gate all passed. Log:
`qualification.local/five-alive/hosted/production-preflight-20261115.log`.
No completed hosted qualification proof was rerun.

The required safe integration gate **failed**. After `git fetch origin`, this
worktree's base remains `f8aa84630a3360dd94e73dd303ca02b1761dd48f`; current
`origin/main` is `bff5bc7dd5ca8d0ad5c5f1ec0cbab893064b3d7d` (55 commits ahead).
A scratch-index `git merge-tree --write-tree` rehearsal returned exit 1 with
three content conflicts:

- `src/lib/delayed/lobbyPresentation.ts`: Five Alive's simultaneous-player
  `playable`/`opponentPlayable` turn counts overlap newer main's removed-match
  guard and viewer-specific/opponent turn counting. Reconciliation must preserve
  both behaviors; silently choosing either side would risk a regression.
- `docs/codex/BACKLOG.md` and `docs/codex/CURRENT_RELEASE.md`: both branches have
  independent newer entries that must be retained.

The rehearsal did not modify the real index, branch or working source files.
The unrelated Cribbage snapshot change was excluded and preserved. Receipts:
`qualification.local/five-alive/hosted/release-integration-20261115.json` and
`release-integration-20261115.log`. Its temporary unreferenced candidate object
is a rehearsal artifact, not a released commit. Stopped as Jeremy requested on
a required gate failure, consistent with the repository's merge-conflict rule.

Catalog inspection confirmed the existing intentional hold: the Five Alive
descriptor is present with Arcade mode and shared rule version `five-alive/1`,
but is absent from `GAME_CATALOG`; Async help is still in
`PENDING_ASYNC_RULES_GAMES`. Isolated config `five-alive/3`/pool
`esdb-five-alive/3` is preserved; no production release configuration or admission
was changed. Catalog registration/activation therefore remains pending after
integration, not claimed complete.

**Next step:** reconcile the three conflicts while preserving the newer lobby
guards and Five Alive simultaneous-turn behavior; finish catalog/release wiring,
validate the integrated candidate, then resume the authorized production release
and smoke check. No production tools were called, migrations applied, branch
updates pushed, deployments made or production smoke performed in this pass.
Vocabulary size is no longer a blocker. Production remains unchanged.

## November 15 bounded pass 6 — 1,021 answers; production still withheld

**Current runtime pool: `esdb-five-alive/3`, 1,021 qualified answers.** Added
268 individually reviewed familiar words to the preserved 753. No prior word,
tier, review record or vocabulary artifact changed. The exact remaining gap
against the unchanged roughly 10,000 target is **8,979 answers**.

### Review and per-word qualification

`server/fiveAlive/answers.batch3.review.csv` records each added word, ordinary
meaning and initial editorial tier. These are editorial judgments, not measured
player difficulty. Examples include ACORN, BROOM, MANGO and ZEBRA. The source
screen used neutral lowercase American base lemmas at ESDB size <=50 from the
same pinned revision `1e5b7d3a72f47a71da5d28686c1dd4b397178485`. All additions
belong to the unchanged 11,204-word legal-guess bank.

This broader screen does not use the earlier batch's frequency threshold as a
universal familiarity test. The pinned local Lingevo/OANC samples supply recorded
context; 61 of these ordinary words are absent from both samples. Those zeros
are preserved, not presented as positive usage evidence. Source membership alone
does not approve an answer. Only the 268 entries with individually reviewed
ordinary meanings and tiers were promoted; the other screened entries remain
unqualified. No obscure filler or sensitive sense was selected to reach a count.

`dev/five-alive/batch3-source.mjs` reproduces the source screen from the existing
ESDB checkout and pinned corpus archive. `batch3.qualify.ts` passed all **1,608
solve-position cases**, per-word duplicate-letter conservation, pre-reveal
privacy, legal-guess membership and shared-rule scoring parity. These are
vocabulary checks only. Durable per-word evidence and the pre-install allocator
result are in `server/fiveAlive/answers.v3.qualification.json`.

### Isolated integration and allocation evidence

`dev/five-alive/batch3-integrate.mjs` checks the review/evidence/prior-bank hashes
before generating `answers.reviewed.v3.txt` and the guarded follow-up migration
`supabase/five-alive/vocabulary-v3.sql`. Runtime artifact SHA-256:
`56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed`.
The migration was installed only on `tyuxxkalhqbqkbvvkcfx`. Config `five-alive/3`
selects this pool while preserving gameplay rule version `five-alive/1`.
Frozen v1/v2 games retain their original vocabulary. The allocator is unchanged;
the only two function-definition changes are new Async configuration defaults
from `five-alive/2` to `five-alive/3`, verified against the preimage.

`dev/five-alive/batch3-pool.proof.sql` passed before installation and against the
installed pool with an idempotent migration replay. Each run used a rollback-only
transaction: **681 mixed-mode allocations**, two complete 1,021-word cycles plus
the first word of cycle three, and **682 immediate/late replays**. Every word
appeared exactly once per complete cycle with its reviewed tier. Three-word
allocations stayed distinct even when crossing the cycle boundary, with no
adjacent duplicate. Frozen-tier edits and changed-version replays were rejected;
an interrupted allocation rolled back without consuming positions. The initial
proof harness had an ambiguous SQL variable; renaming it fixed the harness before
the successful pre-install proof. No allocator correction was needed.

A fresh cycle supports **340 complete three-word games without a repeat**.
Game **341** uses the final unseen word and then begins reuse. This meets the
existing no-repeat-until-cycle-exhaustion rule; it is a global pool-version cycle,
not a rolling or per-player window, and historical versions can overlap.
It does not satisfy the separate approximately 10,000-answer target.

Three focused vocabulary tests passed (`bun test server/fiveAlive/vocabulary.test.ts`).
They verify integrity, exact additions and unchanged historical words/tiers.
The installed observer found v1 epoch 1/cursor 78 unchanged, v2 epoch 0/cursor 0
unchanged, and v3 epoch 0/cursor 0 with **zero persisted proof allocations**.
All three Arcade rulesets are disabled; Async enabled/real-qualified flags remain
false. Detailed installed evidence is preserved in
`qualification.local/five-alive/hosted/vocabulary-v3-runtime-evidence.json`.

**Resume point:** review and qualify the next familiar-answer batch. Do not rerun
the passed Auth, Realtime, financial, recovery, Arcade-isolation or browser proofs.
No full typecheck/build or unrelated proof was rerun in this vocabulary-only
pass. No production tool calls, deployments, pushes, data or balance changes
occurred. Five Alive remains withheld; the vocabulary blocker is **8,979 words**.

## November 15 bounded pass 5 — 753-answer versioned runtime, still withheld

**Current runtime pool: `esdb-five-alive/2`, 753 qualified answers.** This is the
original 498 plus exactly the 255 reviewed/qualified additions. No new words or
difficulty changes were introduced. `answers.expansion.review.csv` is unchanged;
its pre-integration per-word qualification evidence is also preserved as
`server/fiveAlive/answers.v2.qualification.json`. The new runtime artifact is
`server/fiveAlive/answers.reviewed.v2.txt`, SHA-256
`5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231`.

The server loader validates and retains both vocabulary versions. Arcade and
Async actions select the pool version frozen in each game's configuration;
unknown/missing versions fail closed. Version 1's original file, 498 rows, pool,
allocations and existing game configurations remain unchanged. New configuration
`five-alive/2` selects the new vocabulary while keeping shared gameplay rules
`five-alive/1` (scoring, timing and legal guesses are unchanged). Async new-offer
and capability defaults now select that configuration; existing frozen offers
still use their original pool. Arcade's existing ruleset selector is unchanged.

`supabase/five-alive/vocabulary-v2.sql` is the guarded, idempotent follow-up after
the base candidate and version-1 seed. It was applied **only** to isolated project
`tyuxxkalhqbqkbvvkcfx`. Reproduce its artifacts using
`node dev/five-alive/versioned-pool.mjs`; this verifies the preserved review hash,
per-word qualification records and exact candidate hash before generating SQL.
Both Arcade rulesets remain disabled, Async admission/real qualification remain
false, and all disposable accounts remain disabled. No production tools were
called, and no production data, schema, code or balances changed.

### Allocation and repeat-window evidence

The unchanged allocator is one shuffled pool **per vocabulary version**, shared
globally by Arcade and Async. Each admitted Five Alive game consumes three
answers once; both Async participants share those three. Replays consume none.
An abandoned/unfinished game's allocation still consumes its three positions.

- A fresh 753-answer cycle supports **251 three-word games without any answer
  repeating**. **Game 252 begins reuse**, after every answer has been allocated.
  These are Five Alive child games, not necessarily 251 parent sessions containing
  multiple games, and the count is shared across all players/modes.
- The targeted rollback proof ran 502 mixed-mode allocations through two full
  cycles. Each cycle contained all 753 words exactly once; every allocation had
  three distinct words and the original reviewed tiers. It verified the first
  reuse at game 252 and no adjacent repeat across the cycle boundary.
- 503 immediate/late allocation replays preserved answers and pool position.
  A changed-version replay and a frozen-tier edit were rejected. An interrupted
  allocation rolled back without consuming positions. The Async deal owner gave
  both participants the same three answers. Legacy games/allocations remained
  unchanged. This did not rerun the passed financial, recovery, Auth, Realtime,
  Arcade-isolation or browser proofs.
- The proof passed before installation, then against the installed migration
  with an idempotent migration replay. All proof allocations rolled back.
  Observer state: v1 epoch 1/cursor 78 unchanged; v2 epoch 0/cursor 0, zero v2
  allocations. Function comparison proved the allocator and Arcade start owner
  unchanged; only the two Async default-configuration references changed.

**Rules assessment:** 251 games meets the implemented no-repeat-until-cycle-
exhaustion rule. It does **not** meet the separately agreed roughly 10000-answer
bank target. This is not a rolling 251-game or per-player guarantee: after a
shuffle boundary an earlier word can recur, and independent historical v1/v2
pools can share words. No stronger cross-version or numeric minimum repeat
interval is defined in the current rule/configuration source. The target was
not lowered. **Exact remaining vocabulary gap: 9247 to 10000.**

Evidence: `dev/five-alive/versioned-pool.proof.sql` and
`qualification.local/five-alive/hosted/vocabulary-v2-runtime-evidence.json`.
Two vocabulary integrity/preservation tests, three focused frozen-version adapter
tests, the full `npm run typecheck`, and a direct typecheck of the changed server
modules passed. No dependency or toolchain changes were needed in this pass.

**Resume point:** qualify additional familiar, fair answers toward the unchanged
target. The 255-word integration is complete; do not rerun the preserved proofs
unless their owners change. Five Alive remains withheld. No push, production
release or smoke was attempted, and existing worktree changes were preserved.

## November 15 bounded pass 4 — fixture, full-app Async, rejoin and deployment recovery

Supersedes the runback/typecheck/recovery blockers below. Completed proofs from
earlier passes were preserved, not rerun. Production was not read or mutated.

The disposable Quintzee `game_defaults` row was inserted on the isolated project
using the copied schema's 240-second default, also defined in
`20261028003718_quintzee_configurable_round_duration.sql`. Its generated config
equals `private.quintzee_v3_rules(240000)` exactly. No rules function changed.
Authenticated `delayed_capabilities` now succeeds. The actual Run It Back UI
restored Five Alive, seven-chip stake, fake money and the original opponent, then
sent invitation `8bce6613-a89d-42d0-9d99-8611200cb32b` with HTTP 200. An earlier
separate draft `e8e07cd2-6df4-4f9e-9b1e-76b5cdbc5498` also succeeded.

The actual `src/main.tsx`/App router, account gate, lobby, Async invitation and
game routes ran at 390x844 using real hosted Auth, Realtime and unchanged API
handlers through the isolated transport. Both accounts played ANGEL/CLEAR/THANK
through visible keyboard controls; each scored 2600. Native result review,
draw finale, second-viewer Run It Back and Back to Lobby all completed. The
destination is now the real platform lobby, not the earlier placeholder. There
were no page errors or attempted production-host requests. The unrelated email
verification reminder was dismissed; its initial dispatch endpoint is not mapped
in the harness (404), and no verification email was sent or evidence fabricated.
Arcade acceptance also completed through the real router: Resume restored run
`b1ce48c1-5b6b-4331-9cd0-25b4676ccc7b`; visible keyboard actions completed
LEAVE/DEPTH/FIELD for 3000 points. View Leaderboard returned to the actual
Five Alive leaderboard with the new result, personal best and rank #1. Screenshots
of the real finale and Arcade leaderboard were visually inspected.

Same-client Realtime proof passed with actual delivery, not subscription alone.
The full App kept its existing client and 15 active channels: the test channel
reported SUBSCRIBED -> CLOSED -> SUBSCRIBED and received later game revisions.
The separate SDK client also rejoined after complete socket closure and received
21 subsequent changes including the accepted invitation. Immediate last-channel
removal/rejoin reproduces an SDK close race: `connect()` intentionally returns
while disconnecting. No SDK patch or arbitrary reconnect delay was introduced;
the full-App persistent-connection and close-completed paths are qualified.

The deployed isolated pg_cron job invokes the actual
`private.delayed_words_recover()` owner every minute. pg_cron/pg_net were enabled
only in the isolated project; the copied dispatch URL was rebound from production
to the isolated project before scheduling. The first ticks correctly respected
the incident raised while the isolated heartbeat was absent. After inspection,
the canonical incident-close function resumed these synthetic Five Alive cases.
Cron run 3 (backend 297564, 20:59:00 UTC) then settled both preserved expiry
fixtures. Each has exactly one settlement. Runs 4 and 5 also succeeded and left
those counts unchanged. This is a scheduler-invocation proof; the earlier
financial/recovery matrix was not rerun. Five Alive expiry executes in this
database owner before any unrelated-game Edge dispatch.

`npm run typecheck` passed with exit 0 using the repository's intended
`tsc -p tsconfig.app.json --noEmit` script. The missing lockfile-pinned chess.js
1.4.0 now resolves through a junction to the already-installed matching package.
No download, dependency version, package manifest, lockfile or TS configuration
change was needed. The obsolete browser-only Chess alias was removed.

Evidence in `qualification.local/five-alive/hosted/`:
`quintzee-fixture-evidence.json`, `runback-invitation-evidence.json`,
`same-client-rejoin-evidence.json`, `deployment-recovery-evidence.json`,
`typecheck-evidence.json`, `full-app-browser-evidence.json`,
`full-app-network.private.json`, `full-app-finale.png`, `full-app-lobby.png`,
and `full-app-arcade-leaderboard.png`. The browser gate covers the full App with
real hosted services through the isolated test transport; it is not a Vercel
deployment smoke or physical iPhone test. Those release smoke checks remain
unperformed while the answer-volume gate withholds publication.

The 255 staged words additionally passed per-word frequency/source membership,
unique spelling/tier validation, 1530 solve-position cases, duplicate-letter
conservation, hidden-answer projection and shared solo/Async scoring checks.
A rollback-only 753-word candidate pool then passed 251 allocations spanning the
entire pool, 251 exact replays without cursor advance and frozen-bank rejection.
The candidate pool is absent after rollback. Reproduce with
`bun dev/five-alive/expansion.qualify.ts`, followed by the generated isolated
`vocabulary-v2-pool.sql`. Per-word evidence and candidate SHA-256 are in
`vocabulary-v2-evidence.json`. The runtime bank remains 498; the inactive combined
candidate is 753, still 9247 below 10000. It has no version-2 runtime loader or
configuration admission yet. No additional words were added to the active bank.

**Resume point:** answer-bank volume and versioned runtime qualification. Do not
repeat the completed fixture, invitation, full-App browser, same-client delivery,
scheduled recovery or typecheck proofs unless their owning code changes. The
approximately 10000-word target is not met: active 498 (gap 9502), inactive
candidate 753 (gap 9247). Do not promote more words without individual review
and source/rules/pool qualification. Do not silently replace the agreed target.
The immediate last-channel SDK close race above remains a documented boundary;
only the actual App's rejoin and a completed-close rejoin have passing evidence.

At close, the temporary cron job was unscheduled (zero active jobs), all three
test accounts and admission/recovery switches were disabled, and the Edge RPC
broker was replaced by a JWT-protected 410 response (version 4). Browser sessions
were signed out and the local server stopped. Observer counts are four isolated
settlements and two Arcade results: earlier browser fixtures plus this pass's
two deployment-recovery outcomes, Async browser draw and Arcade completion.
The candidate pool remains absent. The disposable Quintzee fixture, schema and
evidence are preserved. See `pass4-cleanup-evidence.json`. Production remains
untouched. No commit, branch integration, release build, push or deployment was
attempted; the existing branch still reports 55 commits behind origin/main.

## November 15 bounded pass 3 — matrix passed, admission still withheld

This entry supersedes the intermediate open-gate lists below. Resume at the
**authenticated runback invitation fixture gap**, then the answer-bank gate.
Do not repeat schema copying, Auth setup, overlapping settlement, the financial
matrix, or the hosted Arcade isolation proof. Production data and balances were
untouched; no production migration, release, integration or push occurred.

### Concrete evidence completed in this pass

- Real Realtime and browser gameplay evidence is recorded in pass 2 below.
  Native Async match home, saved child result and match finale also ran with real
  Auth. The first viewer correctly lacked Run It Back; after both reviews the
  second viewer received it. Back to Lobby navigated to the harness's platform
  lobby destination. The destination is still a placeholder, not full-shell proof.
- The financial matrix exercised actual canonical functions/triggers for both
  money modes: organizer win, opponent win, draw, forfeit, both-player timeout,
  two-child continuation, late replay and injected settlement interruption.
  Fourteen matrix observations passed. Invalid stakes (0, 10000 and 1.5), changed
  frozen stakes/money mode, outsider actions and authenticated direct access to
  service-only commit authority were rejected. Assertions checked actual player
  chips, transfer UUID endpoints and opening/closing balances, immutable outcomes,
  settlement, final snapshots, game result, terminal lifecycle and duplicate
  finalization. Real mode produced two canonical account postings (including
  zero-valued tie postings); fake mode produced none. Deferred constraints were
  forced before checking. All financial matrix changes rolled back.
- Zero-client recovery invoked the actual durable database recovery owner.
  After it settled both synthetic money-mode cases inside one transaction,
  backend 294366 was terminated while retaining that uncommitted work. The tool
  returned PostgreSQL 57P01. A new transaction retried recovery: each case had
  exactly one settlement and one seven-chip batch, with zero/two account postings
  for fake/real money. Another recovery call preserved those counts. The retry
  proof rolled back. This proves the database worker; it does not qualify a
  deployed cron/Edge invocation, because scheduled jobs were never copied.
- Hosted Arcade isolation used statement guards on 244 public/private tables
  and per-run row guards on four Arcade lifecycle tables. Unrelated writes were
  rejected. Completion, injected result-write failure and retry, action replay,
  leaderboard and successor admission passed. The target produced one 3000-point
  result. Players/postings/batches/other results stayed 2/0/1/1 before and after;
  the transaction rolled back. No unrelated Arcade result or financial row changed.

Evidence directory: `qualification.local/five-alive/hosted/`. Preserve
`matrix.sql`, `matrix-evidence.json`, `matrix-fixtures.private.json`,
`recovery-left.sql`, `recovery-retry.sql`, `recovery-evidence.json`,
`arcade-isolation.sql`, `arcade-isolation-evidence.json`, `lobby-evidence.json`,
`capability-blocker.json`, and `runback-blocker.png`. The reproducible matrix
builder is `dev/five-alive/hosted-matrix.mjs`. Private fixture/session files are
local-only and must not be staged.

### First open gate and remaining limits

The real second-viewer Run It Back link opens the actual invitation component,
but its authenticated `delayed_capabilities` RPC fails with **P0002, query
returned no rows**. The database stack is `private.quintzee_default_rules()`
line 4 -> `chess_prior_delayed_capabilities` -> `delayed_capabilities`.
`delayed_history_detail` succeeds and reports `runbackEligible=true`.
This is a missing isolated rules fixture exposed by schema-only copying, not a
database-login/tool limitation or permission request. Next pass should retrieve
the isolated function definition, seed the required nonfinancial rules from the
checked-out canonical configuration, and resume the invitation flow. Do not copy
production application rows. Full platform-lobby rendering, normal deployment
transport, and physical iPhone acceptance remain unqualified. Same-SDK immediate
removeAllChannels/rejoin also remains unresolved; the fresh-client and browser
offline/reload reconnect paths passed.

The runtime bank remains **498**, a **9,502-word gap** against 10,000.
`server/fiveAlive/answers.expansion.review.csv` now records **255** individually
reviewed additional familiar candidates, each with an ordinary meaning and
proposed tier. All are unique five-letter words in the pinned guess list and
previous frequency-evidence candidates, with no overlap with the existing bank.
Their combined editorial count is **753**, still **9,247 short**. They are staged,
not runtime-qualified: the immutable version-1 bank, rules/configuration, pool
hash and isolated database pool were not changed. This pass does not establish
that roughly 10,000 fair familiar five-letter answers exist. Do not pad the bank
or lower the agreed target silently. Evidence: `vocabulary-expansion-evidence.json`.

The peer-revision correction passed four focused async tests and nine shared
rule tests. Full typechecking remains incomplete: `bunx tsgo --noEmit` could not
resolve the missing tool; installed TypeScript reports three missing `chess.js`
module errors in existing Chess paths. No dependency was installed. The browser
harness reused an already installed matching chess.js 1.4.0 outside this worktree.
Final tracked diff whitespace check passed. Existing unrelated changes remain.

At pass close, all isolated test accounts and Five Alive/Async admission and
recovery switches were disabled. The temporary RPC broker was replaced by a
JWT-protected 410 response (version 2), browsers signed out/closed and the local
server stopped. Observer counts were one settlement, two players, zero account
postings, one transfer batch and one Arcade result: solely the completed isolated
browser fixtures. Matrix and isolation proof results did not persist. Synthetic
fixtures and evidence are preserved for resumption. The game remains withheld.

## November 15 bounded pass 2 — Realtime and browser evidence

Preserved the completed schema copy, Auth provisioning and overlapping settlement
proofs. Reused the same isolated project/accounts. Real Realtime delivered ten
revision updates to each participant and none to the outsider. Acceptance and
action replay left event counts unchanged (2/2/0 before and after the action
replay). A fresh authenticated reconnect restored the same revision and received
subsequent changes. Actual browser offline/reload recovery also passed. The
earlier `slot_changes_count` error was historical: catalog inspection showed the
managed function already updated, so no Realtime schema repair was made. An
immediate same-SDK removeAllChannels/rejoin timed out; fresh-client reconnect and
the actual browser reconnect succeeded. No claim is made that the SDK reuse case
is fixed.

Chromium at 390x844 used actual FiveAliveSession/Board, unchanged API handlers,
shared game services, real hosted Auth and Realtime, and hosted PostgREST through
an expiring secret-protected isolated Edge RPC broker. No synthetic tokens or
event stream were used. `dev/five-alive/hosted.server.mjs` runs this transport;
production-host fetches are explicitly blocked. The first harness preflight used
Vite's externalized SDK and returned 401; explicit SSR substitution corrected
that test transport before gameplay qualification.

The browser exposed a real pre-load peer-revision race. The service now consults
the player's immutable command-receipt revision from the service-only load RPC.
Peer-only changes within the same segment are accepted; own-progress, future,
missing-evidence and earlier-segment requests remain rejected. The formerly
rejected captured command then committed once. Four focused async tests and nine
shared rule tests pass. The installed candidate correction exists only in the
isolated project; no production code or schema was published.

Browser evidence covers private answers/guesses before mutual reveal, independent
submission, real peer-triggered refresh, wrong-guess reload, offline/reconnect,
three-word Async results and Arcade completion/leaderboard return. Missing Auth
returned 401; outsider identity spoofing returned 409. No browser page errors.
Evidence: `qualification.local/five-alive/hosted/browser-evidence.json`,
`browser-network.private.json`, `authenticated-async.png`, `authenticated-arcade.png`.
The Async return route in this test harness is a placeholder, so full real-lobby
continuation remains open. Physical iPhone acceptance remains unperformed.

Next open gates: full hosted financial/recovery matrix and Arcade isolation,
full authenticated lobby continuation, answer-bank qualification. Admission is
still withheld. Later pass entries supersede this intermediate checkpoint.

## November 15 hosted continuation — admission remains MISSING

The current checkout is `C:/Users/jerem/.codex/worktrees/five-alive/rule-your-poker`,
at `f8aa84630a3360dd94e73dd303ca02b1761dd48f` with the existing uncommitted candidate.
The branch is behind the recorded origin/main by 55 commits; no integration,
production migration, push or deployment was attempted.

Used only production PostgreSQL catalogs on `xvhmbuppghwmwpwrkzao` to retrieve
definitions. No production application rows were queried, and no production
game or financial functions were invoked. Copied schema-only DDL to isolated
project `tyuxxkalhqbqkbvvkcfx`: 253 public/private tables/views, 1,214 functions,
enums, sequences, constraints, indexes, triggers, policies, RLS, grants and
Realtime publication membership. No production rows or scheduled jobs were copied.
All 1,214 function bodies match the retrieved preimage. The structural comparison
matched tables, constraints, indexes, triggers, policies and RLS; identified
column grants were then restored. Null ACLs versus explicit PostgreSQL default
owner/PUBLIC ACLs are representation differences, not additional privileges.
The actual financial trigger counts are 39 on players, four on
player_transactions and three on gameplay_transfer_batches.

The isolated installation exposed stale candidate preimages from the Chess
release. Registration now retains Chess in the child constraint and extends
`private.chess_prior_delayed_capabilities()` while preserving its public wrapper.
The lobby score anchor retains Chess, and Five Alive availability respects the
existing status, hold and deadline conditions. These are local candidate changes,
not production changes. Candidate installation succeeded only on the isolated
project. Earlier installation attempts rolled back on explicit preimage guards.

Three disposable isolated accounts successfully authenticated through the real
Supabase password endpoint. Accounts were provisioned with isolated Auth users
and identities after public signup rejected test email/rate limits. Actual
authenticated PostgREST create/accept produced four test matches. All three
Realtime channels subscribed, but no change events were observed; subscription
alone does NOT qualify Realtime or privacy. No authenticated browser gate passed.

Actual shared TypeScript Five Alive reducers generated final submission payloads.
Two independent `supabase_execute_sql` transactions exercised final submission,
canonical settlement and duplicate replay in both fake and real money. Batching
tool promises within one execution serialized the calls and was NOT accepted as
race evidence. Separate pending execution cells produced real overlap:

- Backend 289812 began at 19:20:14.020676 UTC, completed financial assertions at
  19:20:14.154977, retained its transaction for eight seconds, then rolled back.
- Backend 289813 began at 19:20:16.674339 UTC while that transaction remained
  open, attempted the same final submissions after one second, and completed at
  19:20:22.292684 after the first rollback. Duplicate calls within the second
  transaction preserved one settlement; it also rolled back.
- Each money mode asserted organizer/opponent chips +7/-7, one outcome, one
  settlement, one balanced seven-chip transfer batch, two exact final snapshots,
  one result and terminal session/match status. Real mode had two canonical
  account postings; fake mode had none. Deferred financial constraints were
  forced before assertions. The first rehearsal omitted that forcing and failed
  its ledger assertion; it was not treated as passing evidence.
- After rollback, settlements, players, account postings, transfer batches,
  final snapshots and game results all had zero rows in the isolated project.

Catalog export query: `dev/five-alive/catalog-export.sql`. Ignored local evidence:
`qualification.local/five-alive/hosted/catalog.production.json`, `evidence.json`,
`submission-left.sql`, `submission-right.sql`, and fixture records. Private account
and session files in that directory must never be committed. Test clients were
closed and signed out; isolated accounts and admission were disabled at checkpoint.
The schema and four synthetic matches remain for continuation.

Stopped at the repository's 100-tool-call circuit breaker. This is not a database
credential or SSL blocker. Still required: complete hosted winner/tie/authorization/
failure/continuation matrix; worker interruption/retry; Arcade write isolation;
Realtime delivery/privacy; authenticated browser acceptance; answer qualification.
The answer bank remains exactly 498, with no padding or new claimed familiar words.
The roughly 10,000 target is unresolved. Production release and smoke remain held.

The earlier local-only limitations below are historical and are not a request to
configure another database stack or credentials.

**Admission gate: MISSING.** The catalog remains withheld. This is the
uncommitted `codex/five-alive` candidate based on
`698ab0e5d4273ec8c72b1208714753419fc189a6`, not a release commit. No migration,
publication or deployment was performed.

## November 13 continuation — admission still MISSING

Read-only comparison against the hosted project found identical definitions for
eight checked owners: delayed expiry, finalization, outcome recording and local
recovery; Arcade commit; canonical transfer settlement and batch finalization;
and account-result recording. It also found material schema differences. On
`public.players`, the local proof template has 29 non-internal triggers while
hosted has 39. On `public.player_transactions`, the local template has none
while hosted has four. On `public.gameplay_transfer_batches`, local has five
triggers while hosted has three, and the three index definitions have different
aggregate hashes. Private delayed receipt/outcome/settlement index and trigger
hashes and the snapshot trigger hash matched. Several other idle local clones
were inspected and did not provide that hosted trigger preimage. The earlier
local financial proof is therefore not a schema-matched release proof.

`node dev/five-alive/concurrency-rollback.proof.mjs` passed against the same
disposable local template in both money modes. On independent connections, a
competing final submission was observed blocked on the first transaction; the
first connection was then closed without commit, the second settled once, and
duplicate replay left one receipt. A zero-client recovery invocation was also
interrupted by closing its database connection, and another invocation retried
and settled once. In both cases the financial work was inspected within the
second transaction and rolled back, and the observer saw no settlement artifacts
before or after. Synthetic setup and candidate SQL existed only in the disposable
clone, which was dropped. This is supplemental to the earlier sequential
rollback proof, not the requested single complete schema-matched proof.

`node dev/five-alive/isolation.proof.mjs` passed locally with statement-level
guards on 160 non-Arcade public/private tables, including session, player,
transfer and account tables. Start, completion, an injected result failure,
replay, leaderboard, successor and abandonment caused no guarded writes; the
candidate DDL, guards and synthetic accounts were rolled back. The financial
schema mismatch still prevents treating this as the full release isolation gate.

Actual local Supabase Auth and Realtime could not be exercised: PostgreSQL alone
was listening at `127.0.0.1:55439`; the standard local Supabase service ports
were not listening, no Supabase CLI was installed, and Docker reported its
`dockerDesktopLinuxEngine` pipe missing even after an attempted hidden launch
of the installed Docker Desktop. No dependency was installed, migration run,
or hosted account used as a substitute. The browser proof below remains
synthetic Auth/Realtime evidence only.

The independent frequency audit is `dev/five-alive/frequency.audit.py`; its
Lingevo/OANC source, license, build version and SHA-256 are recorded in
`server/fiveAlive/WORD_SOURCES.md`. A commonness and genre screen followed by
conservative morphology/name filters yields 697 candidates, including 350
existing answers and 347 unqualified new candidates. Deterministic sampling
and edge checks show that variants, sensitivity and difficulty still need
qualification. No answers were added: the qualified total is still 498, and
the approximate 10,000 target remains an explicit open gap.

Next qualification needs a disposable, current schema-matched local Supabase
stack with genuine Auth and Realtime and no automatic migration execution. Run
one complete rollback-contained financial proof against that preimage, rerun
Arcade isolation and the authenticated browser flow there, and continue the
evidence-based answer review before considering admission.

## Financial evidence

`node dev/five-alive/financial.proof.mjs` passed against candidate SQL loaded
inside a transaction in a disposable clone of local template
`coordinated_scores_1794288498120`. The clone's older child-game constraint
was brought to the previously observed nine-game preimage inside the rolled-back
transaction. No candidate DDL or synthetic financial rows remained after the
rollback; the disposable database was then dropped. This is not evidence that
the candidate is installed or that the clone matches current hosted authority.

For each money mode, actual Five Alive server reducers and the existing delayed
commit, outcome and finalizer owners covered organizer and opponent wins, draws,
single and double timeout, frozen stake and money-mode rejection, member and
service-role boundaries, duplicate and late command replay, and a two-child
match with successor isolation and one net settlement. The proof asserted exact
per-player chips, transfer-batch endpoints and balances, account postings, game
result and post-settlement snapshots. An injected failure before settlement
receipt insertion, after canonical financial writes, left no partial game,
outcome, ledger, account or snapshot rows; retry completed once. The first two
attempts exposed test-harness assertions for JavaScript negative zero and the
two-outcome continuation case; both were corrected before the complete run.

Prior separate independent-connection evidence is in
`dev/five-alive/races.proof.mjs`; it is supplemental, not a substitute for the
rollback proof. The complete release gate is still missing a documented
rollback-contained independent-connection/settlement proof covering all required
cases, interruption and retry of the durable recovery worker, verification of
current hosted financial definitions and indexes against the proof environment,
and authenticated terminal/continuation acceptance. The Arcade nonfinancial
release proof, including complete multiplayer/financial write isolation, also
remains required.

## Browser evidence

`node dev/five-alive/browser.proof.mjs` passed with two separate browser
contexts, actual Arcade and Async API handlers, Five Alive services, and a
disposable local PostgreSQL clone. It checked token absence/invalid token and a
forged actor, pre-reveal answer and guess secrecy for both players, reload and
reconnect, independent submissions, mutual reveal and unlock, three-word final
results, and the real Arcade leaderboard route. Auth identities and Realtime
revision notifications were local fixtures, not actual Supabase Auth or hosted
Realtime. Genuine authenticated end-to-end, disconnection/recovery and physical
device acceptance remain open. Screenshots are local ignored evidence under
`qualification.local/five-alive/browser/`.

The preceding phase's final build passed 4,049 app tests, 241 harness tests,
46 tooling tests, TypeScript and the size gate; its lint comparison added no
diagnostics to the existing baseline. This phase changed only proof/audit files
and documentation; targeted lint on the new browser and financial harnesses
passed. No broad gate was repeated.

## Vocabulary

The answer bank remains 498 individually reviewed, tiered entries. The pinned
ESDB size-70 conservative metadata screen yields 5,291 candidates, including
all 498 already reviewed; 4,793 are unreviewed and **not** approved answers.
Even the filtered sample includes proper names, plurals and obscure terms.
See `server/fiveAlive/WORD_SOURCES.md` and
`dev/five-alive/vocabulary.audit.py` for exact filters and counts. The roughly
10,000-answer target is an open product gap; the conservative screen is not an
upper bound on every potentially familiar English word.
