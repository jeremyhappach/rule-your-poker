# Five Alive relative difficulty qualification — November 19, 2026

Status: production deployed and release signal verified. Production migration `20261120004855` is installed; candidate and installed rollback proofs pass. Owner runtime smoke remains pending.

## Scope and versions

Jeremy authorized implementation and release of the completed 1,021-answer relative audit. Difficulty version is `five-alive-relative/1`. Answer/guess vocabulary remains `esdb-five-alive/3`; match configuration remains `five-alive/3`; shared scoring rules remain `five-alive/1`. No answer, exclusion, source-review decision, guess, multiplier schedule, selection randomness or no-repeat cycle changes.

| Tier | Before | Before % | Relative v1 | Relative v1 % |
| --- | ---: | ---: | ---: | ---: |
| Very Easy | 274 | 26.84 | 101 | 9.89 |
| Easy | 443 | 43.39 | 204 | 19.98 |
| Medium | 242 | 23.70 | 410 | 40.16 |
| Hard | 36 | 3.53 | 202 | 19.78 |
| Very Hard | 26 | 2.55 | 104 | 10.19 |
| Total | 1,021 | 100 | 1,021 | 100 |

784 placements change and 237 remain. The 367 model-sensitive placements use the approved primary composite score, never variant votes. The approved 55/20/10/10/5 components cover solve effort, feedback ambiguity, letter/position frequency, repetition and vowel/bigram patterns. Recognition evidence can supply up to three points of credit; missing evidence never adds obscurity points. Existing eligibility remains the gate. The audit's eight audience-familiarity notes are retained as notes; this release adds or excludes zero words.

Scores are rounded to half points. Boundaries are selected only between distinct scores near cumulative 10/30/70/90% targets (within three percentage points), preferring the largest gap, then closest target, then lower count. Equal scores stay together. Resulting cutpoints are 15.75, 32.25, 64.75 and 80.75. The bands are approximate, not quotas. This is the approved provisional model, not human-play calibration.

## Authoritative cutover and historical preservation

`private.five_alive_allocate` retains its exact pool lock, cryptographic shuffle, cursor, rollover and replay identity. It reads the version catalog only when an owner has no allocations. Each of the three new assignments receives an immutable side record containing difficulty version, tier and multiplier percentage. The original allocation JSON shape is unchanged.

Existing allocations have no new side record and replay their original immutable word-bank tier. Both Arcade start and Async acceptance already assign every round, including every Five Alive child in a multi-game match. Their persisted round tiers and frozen scoring configuration continue to determine scores. Completed states, results and settlements are never rewritten. An unaccepted invitation has no assigned words and receives the current difficulty when accepted.

The migration takes the same pool-row lock before publishing the catalog pointer. Thus an allocation is wholly before or wholly after the cutover. It asserts the deployed allocator preimage, original bank digest, exact membership, new tier digest and reviewed source hash. It is idempotent and cannot silently replace a different version. New catalog and assignment records reject UPDATE/DELETE; private tables and allocator remain unavailable to anonymous, authenticated and service-role direct access.

## Evidence and reproducibility

- Approved review artifact SHA-256: `266887e9df3f421153846f0859161c6e855ed7ecb51915d41383e08f650f0c60`.
- Original v3 answer artifact SHA-256: `56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed`.
- Separate 11,204-guess artifact SHA-256: `d888446d693992e3b19c218ed997209d8e3a2053f0d9bd7027d3a6e2de06058d`.
- Canonical relative tier artifact SHA-256: `f7b8d5a9eadc2cb40a4f7e6847afa88afaf669b59c628b8fd76b70d5ccee2670`.
- `server/fiveAlive/difficulty.relative.review.json` retains all primary scoring components, tied ranks, variant evidence, eligibility, corpus evidence and source pointers. `relativeDifficulty.ts` reproduces every row in `difficulty.relative.v1.txt`.
- Eleven focused tests cover exact membership, valid tiers, distribution, score ties, all variant disagreements, corrupted inputs, unchanged eligibility records and guess dictionary, every legacy award, active/completed Arcade and Async state, winner/tie outcomes and new-tier scoring.
- The deployed-database candidate proof runs inside BEGIN/ROLLBACK: existing Arcade/Async rows are byte-equivalent through cutover; legacy replays retain tiers; 1,035 new assignment rounds cross an epoch boundary without changing shuffle order; snapshots retain version/tier/multiplier; replay, private permissions and immutability pass. Arcade start/completion uses the new catalog and writes no multiplayer/financial records.
- The same rollback proof passes actual fake-money and real-money winner, tie, duplicate, late replay, outsider authorization, injected post-finance rollback, two-child continuation and terminal settlement. Checks include canonical player chips, snapshots, account postings, balanced transfers, immutable results and receipt replay.
- Four real local PostgreSQL concurrency cases pass: allocation before cutover; allocation waiting behind cutover; interrupted allocation with concurrent retry; distinct owners sharing the global no-repeat pool. Every local database is dropped afterward.
- Generate the SQL proof with `node dev/five-alive/difficulty.proof-query.mjs`; execute its entire transaction as one query. Run local races with `node dev/five-alive/difficulty.concurrency.mjs`. Local PostgreSQL access uses the repository's existing qualification helper.
- Standard release runner: `node dev/five-alive/difficulty.qualify.mjs` executes the standard TypeScript, application, harness, tooling, Vite and unchanged 90,000,000-byte gates, with the established two-worker test setting. Logs and compact proof receipts are under `qualification.local/five-alive-relative/`.

An initial query-assembly error was a JavaScript replacement-string dollar expansion; no candidate SQL executed in that failed attempt. The retained generator uses replacement callbacks. The first unit pass caught the audit's eight retained familiarity notes; the assertion now verifies both retained eligibility categories and their exact count.

## Release status

TypeScript passes. All 4,353 application tests (590 files), 241 harness tests and 46 release-tooling tests pass: **4,640 tests total**. Vite passes and the static output remains **89,704,807 bytes / 185 files**, with **295,193 bytes** below the unchanged **90,000,000-byte** cap. The final expanded audit artifact also passed a fresh typecheck and the eleven focused tests.

Production migration `20261120004855` is installed. The complete installed rollback proof passes, including genuine legacy assignment replay, new Arcade completion and actual fake/real financial settlement. No production fixtures or historical edits remain. There are no concrete qualification blockers. No gate or build-size limit has been weakened. Publication checkpoint tag: `five-alive-relative-v1-20261119`. Owner runtime smoke remains Jeremy's acceptance step.

## Verified publication

Product commit `39d3b0663ee27a50feea884d474884f79fda61e6` is published on `origin/main` and tagged `five-alive-relative-v1-20261119`. Vercel deployment `dpl_FMbusyu8HaTWkNUcaXGGQmJCgANn` is READY / production. Both `holm357.com` and `www.holm357.com` return HTTP 200, expose the exact product SHA in their build manifests and serve HTML referencing the matching `assets/index-at3mHfH1.js` bundle. GitHub release-signal run `44649120114` completed successfully. The authoritative publication receipt is `44649120114-1` at `2026-11-20T01:01:12.391Z`, with that same SHA.

Final production readback confirms `five-alive-relative/1`, all 1,021 original answers, counts 101 / 204 / 410 / 202 / 104, and the unchanged legacy bank digest `c5d91b2d114080c6f144514a638ddb95`. Public and database readbacks are retained with the local qualification logs. No qualification or deployment blockers remain; Jeremy's ordinary runtime smoke is the remaining acceptance step.
