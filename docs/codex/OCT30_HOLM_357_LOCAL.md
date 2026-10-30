# Oct 30 Holm / 3-5-7 local qualification

Local candidate only. Branch `codex/oct30-holm-357` was reconciled by a conflict-free fast-forward to production `bc68fff196ef4f6a554b6ebafcdc652c857cc9d4`, preserving the local candidate and the released WWF/Words/Quintzee changes (including 57edaabb). No publication, hosted migration, customer session change, financial repair or real wager. No unrelated transition-audit changes included.

## October 30 pause/resume continuation
The owner clarified that the separate pause incident affected a non-host while the host was fine; the game was uncertain, likely Holm or 357. It is not the original owner-side Holm showdown report.

Reproduced using actual Game.tsx, three isolated browser contexts, authenticated host pause/resume RPCs, and task-owned local PostgreSQL:
- Seven-second pause during Holm successor dealing stalled advancement. The August 14 c7019f7c9d change stamped every acknowledgement complete, including `acknowledged-paused`, which records cards but does not activate the successor. The candidate retains that hand for a resume-triggered drain, preserves exact identity and in-flight deduplication, and handles a response crossing resume. Long pause and delayed-response tests pass without reload, one settlement and two balanced batches.
- Seven-second pause during 357 all-fold tax completion consumed the table's completion callback while the server refused advancement. The August 18 b010aad56e handoff had no retained completion receipt or resume drain. The candidate keeps exact all-fold/leg-award receipts until the handoff succeeds, checks dealer-game/round identity and retries after resume.
- Delayed 357 handoff exposed a second part of that bug: authority returns `{outcome: "paused"}` without an RPC error. Previously that response was treated as success. The candidate now retains the receipt and reopens only its exact pending handoff; authority and settlement are unchanged. The delayed-response regression now passes (oct30-pause-357-inflight-fixed.log), with both non-hosts actionable and balanced tax.
- Dropping only the resume notification left a non-host's controls paused while its channel stayed subscribed. The August 30 f11c8ec552 `fix gin realtime action latency` change removed the prior pause polling fallback. The candidate reads only pause/identity every five seconds while Holm/357 locally appear paused; a mismatch requests the existing serialized authoritative snapshot. It never sets unpaused state speculatively, polls ordinary live play, or directly enables controls. Holm and 357 dropped-resume proofs pass, including a seven-second pause for 357. Other games remain queued for their separate audit.

These are demonstrated mechanisms and source provenance, not proof of the historical browser cause. Local cron is inactive: the previous SQL fallback proof remains valid, but these browser cases specifically prove client recovery without relying on a periodic server worker. Real hosted transport and physical-device acceptance remain unobserved.

Evidence is in the task directory above this checkout: `oct30-pause-dwell-long.json`, `oct30-pause-flight-long.json`, `oct30-pause-successor-long.json`, `oct30-pause-dwell-missed.json`, `oct30-pause-inflight-long.json`, `oct30-pause-357-long.json`, and corresponding logs. The first reconciled and first pause-candidate aggregate each passed 3,334 source tests, 241 harness tests, typecheck/build. The final structured-response build passed typecheck and 3,332 source tests but hit two timeouts in unchanged Run21 local-authority tests (5s/60s limits). The subsequent full validation retry exited 0: 3,334 source tests, 241 harness tests, typecheck and production build passed (oct30-resume-qualified-retry-build.log).

The 357 fixture uses isolated database `incident357_resume_20261030`, cloned from an existing local synthetic 357 database. Only this fixture received metadata SELECT grants and an empty Canasta dependency table required to compile the shared pause function. No shared database was modified. Browser requests are restricted to loopback. Vite reloads invalidated several concurrently running qualification attempts when the test-only fault adapter was edited; those attempts are not counted as passes, and stable-adapter reruns are required.
## Confirmed presentation mechanisms
- Holm cancellable exposed-player dwell incorrectly stamped its hand before finishing. Cleanup canceled the attempt and the same-hand latch prevented retry. `useHolmShowdownDelay` stamps completion only, retries interrupted attempts and isolates hand identity. Source pattern dates to78bde51a3/Aug11; no historical browser trace proves that trigger occurred in the reported session.
- Completed Holm remount returned to 'keep cards visible' without hydrating an empty local card cache. The community row could not emit its completion receipt. The candidate hydrates authoritative cards for the exact hand and retains an exact-hand reveal receipt.
- Broader full-route qualification reproduced a legal legacy inactive, unopened Chucky deck blocking a human showdown. `requiredRevealCount>0` treated a hidden predealt deck as an active reveal. The gate now relies on actual activation/solo state or a revealed-card count; active Chucky completion remains gated. The pattern dates to9770094cd5/June23. Actual suspected incident had inactive Chucky with an EMPTY deck, so this additional defect is NOT asserted as its historical cause.
- 3-5-7 successor Round2 bypassed unfinished local tax/reante flights because the old admission gate was Round1-only. The candidate waits on the retained exact transfer cursor for dispatch and presentation. Old-gate counterfactual admitted successor about1.7seconds before landing.
- 3-5-7 current authority emits plain 'Hap wins with a pair'; the older formatter recognized only HANDNAME metadata and disclosed strength to stayers. Both formats now use 'Hap wins (secret reveal)' in rounds1/2 for all viewers. Public round3 and no-reveal policy remain intact.

## Actual incident evidence
Likely session3512db59-ce92-49c7-a1a1-78a8b26aef46, Oct29-KirkHinrich; Hap/Lance/mcru81. Best matching hand is roundb8305507-efdb-45b6-a374-44d4479ddc1e, dealer2fef4d45-21d8-49dd-91f9-48953182b032. Authoritative settlement at00:54:40.347285Z awarded Lance 9, charged mcru81 9, left Hap unchanged and created the successor. All28 Holm batches balanced. No matching browser trace. Visible freeze does not establish missing financial settlement.

## Qualification
- Existing six Holm shell cases cover delayed timing, transient exposure, remount, two-stayers and all-stay across three isolated contexts.
- Existing six 3-5-7 shell cases cover three viewers each for tax/reante, millisecond flight deadlines and current-format secret copy.
- Actual Game.tsx route uses isolated PostgreSQL-backed RPC/read/SSE adapters, real authorization roles, three browser contexts and canonical shell/transport. Ordinary and fault cases pass. Fault injects two racing final decisions, drops the browser response after commit, and reloads an observer during settlement. Uninterrupted viewers each show both exact transfers before successor cards; refresh reaches the correct new hand. All balances remain298, one result, two balanced batches. Separate legacy predealt-Chucky route also passes.
- Independent PostgreSQL connections race identical final decisions: one result, two balanced batches, unchanged duplicate replay.
- Local rollback proofs pass: settlement boundary; acknowledged presentation release; Rabbit Hunt/all-fold; seven solo win/loss/tie/visibility/authorization cases; staged transfers. Deferred transfer constraints are exercised. The old atomic-turn proof expects a now-revoked client continuation grant and was replaced with the current acknowledgment proof, not weakened grants.
- Fifty-five installed function definitions match read-only production capture hashes. Local template gaps were filled only in task-owned databaseholm_incident_20261030_v2: exact functions/grants, history exposure, card policies and dependency tables. No shared database modified.
- Scheduler catalog is an INACTIVE local fixture. Fallback authority is invoked directly by SQL proof; autonomous pg_cron/hosted transport is not claimed.
- Canonical SUITS imported in the shell fixture. The earlier 'invalid control-code placeholders' concern was inaccurate: the source itself uses legacy values. A refreshed actual route screenshot was inspected and has valid card faces.

## Evidence and reproduction
Task workspace one level above this worktree contains:
- oct30-holm-sql-final.log; oct30-holm-variants-current.log
- oct30-holm-concurrency.json; oct30-holm-installed-parity.json
- oct30-route-proof.json; oct30-route-proof-fault.json; oct30-route-proof-predealt.json
- oct30-route-refresh.png; oct30-357-browser-evidence.json; oct30-browser-evidence.json
- oct30-final-qualified-build.log (PASS: 3,268 source tests / 463 files, 241 harness tests / 12 files, typecheck and production build)
- oct30-checkpoint.md and oct30-*.cjs local schema/proof preparation scripts

Run from this worktree:
- `node e2e/oct30/route-server.mjs` (loopback5188, exact task-owned database only)
- `node e2e/oct30/verify-route.mjs`; optionally HOLM_FAULT=1 or HOLM_PREDEALT=1
- `node e2e/oct30/verify-concurrency.mjs`
- `node node_modules/vite/bin/vite.js --config e2e/oct30/vite.config.ts` (loopback5186)
- `node e2e/oct30/verify.mjs`; `node e2e/oct30/verify357.mjs`
- `npm run build`

Harness dependencies use the already installed Windows local pg module and fixed isolated database, deliberately refusing remote targets. Every browser blocks non-loopback requests. Test-only admission instrumentation lives in route-server's Vite transform, not production source.

Final fault-route recheck passed after the unopened-Chucky correction. Final diff check passed; the test-generated Cribbage line-ending artifact was restored. Candidate remains uncommitted locally.

## Release requirements
No database migration is needed. Obtain publication approval for this Oct30 package, serialize with the current writer, verify current main still matches the reconciled bc68fff baseline, rerun integration/aggregate checks, and follow normal publisher/READY/manifest/persisted-signal verification. Physical-device/hosted-transport smoke remains unobserved. No customer repair implied.

The only denied operation was Windows CIM process inventory (`Get-CimInstance Win32_Process`: 'Access to a CIM resource was not available to the client'). It was not retried or bypassed; no dependent qualification action remained blocked by it.

Final targeted closeout: oct30-pause-357-long-missed-fixed.log passes host resume with a missed non-host update; oct30-pause-357-rollover-final.log passes tax/reante through Hand2 for both non-hosts, strict flight deadlines and conserved balances. The delayed Holm/357 responses pass. The final full validation retry exited 0. The local candidate is qualified; publication remains unapproved.
