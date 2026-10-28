# Mega face spacing and anytime Stand Pat /4 — 2026-10-25

Jeremy approved publication of product candidate
`9faaf67f81e1f9e9b0aa3de2cbc4a36a185bede4` and opening-decision checkpoint
`2160c86e9fb75ae14350551b8db1211e96d52e41`. Current main remains the candidate
base `f4b4f38a2bafb6ed115044269a80e2ea957094cf`; no newer product work requires
reconciliation. Other game holds and the unrelated Canasta signal remediation
remain outside scope. Main's existing Cribbage snapshot edit and temporary files
are preserved; all qualification runs in the isolated Mega worktree.

The release preserves two required opening reveals, then offers Stand Pat in
every playable action window regardless of stock/discard allowance or pending
stock. Tap In? confirmation keeps all six board cards and uses canonical reveal,
scoring, hole/final presentation and completion. Cancel submits nothing.
Animation, revision, terminal and authoritative expiry guards remain. /1–/3
retain their frozen behavior. Historical boards/scores, course configuration,
multiplayer and financial owners are unchanged; no timer bonus or archive/reset.
Mega's suited large ranks move upward inside the existing 5:7 cards. Other games,
shared tiers and rank-only four-color faces retain their prior art.

## Qualification and installation

- The inspected start/catalog/commit definitions match the candidate's guarded
  /3 baseline. Actual indexes retain unique user/request receipts and run results.
- Requalified against fresh hosted definitions in disposable loopback PostgreSQL:
  24 service/SQL cases, /1–/3 active and late receipts, independent-connection
  duplicate/competing-draw/expiry races, reconnect and zero-client recovery pass.
- Hosted candidate AND installed rollback proofs pass disabled fallback, /4 start,
  legacy runs/receipts, ownership/version/tampered-score guards, canonical course
  completion, duplicate/conflict/reconnect/continuation, service-only grants and
  history/course-board preservation. All synthetic writes rolled back.
- Registration source `20261025070429_mega_anytime_stand_pat.sql` is installed as
  hosted `20261025070613` (`mega_anytime_stand_pat`). /4 remains DISABLED.
  /1, /2 and /3 remain enabled. Commit/scoring/receipt SQL is unchanged.
- Recovery worker v15 reproduced byte-for-byte from the baseline. Compatible v16
  is ACTIVE and its downloaded source matches the qualified /4 bundle. Only
  approved Mega config/engine/service inputs change. Authentication is unchanged.
  Source SHA256: `8d5c685089116929aa42f1797d4ccde94890004b933d58b471df461b3c98bd21`.
  Recovery is fresh with no failure after installation.
- Existing Mega results hash remains `aeec7a58978b9df352d840ad0ea96183` after
  registration and contained proofs. No historical result was rewritten.
- Exact unchanged commit/scoring MD5: `5cafb47e80ad5767a4d791e883ff14a0`.
  Registered catalog: `e72e09818b39a707739f3e44b7b075e6`;
  registered start: `d183609d6b5e35f1009d4291ec68f346`.

The local proof fixture initially attempted a request-bearing action against an
uninitialized run, correctly receiving the deadline guard. It now initializes
through the canonical RPC first. No guard or gameplay owner changed.

Aggregate release validation PASS: application TypeScript, 2,908 source tests in
420 files, 241 harness tests in 12 files, and the production Vite bundle. Existing
Browserslist and bundle-size warnings remain. Checkpoint tag:
`mega-anytime-stand-pat-20261025`.
The reviewed 52-face/four-viewport geometry proof, actual arrival animation, and
12 phone confirmation/cancel cases remain valid: integrated product source is
identical to the reviewed candidate. The opening decision requires no code change.

## Publication gate and smoke

Activation source `20261025070431_mega_anytime_stand_pat_activate.sql` is separate.
Do not apply until remote main, READY deployment, public build manifest and the
persisted release signal all name the exact release SHA. The previous Canasta
workflow failed; it has not been rerun or remediated by this task. This release
must publish its own signal successfully. /4 remains closed until then.

After activation, refresh and start a new course. Confirm two opening reveals
are required, then test Stand Pat with stock remaining and zero discards:
Cancel keeps play unchanged; Confirm keeps the board and reveals/scores it.
Inspect rank spacing in portrait and landscape. Physical iPhone gameplay
acceptance remains Jeremy's smoke.

Evidence: `dev/mega-card-golf/stand-pat-anytime/evidence.local/` contains fresh
baseline, candidate/installed SQL proofs and results, aggregate build log, local
concurrency/recovery results and qualified worker source. The proof generator
is `hosted-proof.mjs`; service races use `proof.mjs --release`.
See [local visual and behavior evidence](MEGA_LOCAL_FACES_AND_STAND_PAT.md).
