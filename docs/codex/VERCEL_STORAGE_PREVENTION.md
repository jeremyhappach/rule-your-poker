# Storage optimization and prevention — November 10, 2026

Local candidate on `codex/vercel-storage-remediation`. **Do not publish yet.**
Jeremy authorized local implementation/testing and explicitly approved incorporating
current production `64362de16e6b5cdac5ab1d76af009132a8605f27`. No push, preview,
production deployment, deletion, Supabase write, billing or account-setting change
was made. The original optimization and all cleanup receipts remain intact.

## A. Final build

| Static output | Bytes | Decimal MB |
| --- | ---: | ---: |
| Original November 9 baseline | 103,498,912 | 103.50 |
| Original optimized checkpoint (preserved) | 82,658,138 | 82.66 |
| Current-production content, original PNG encodings | 110,505,680 | 110.51 |
| Final integrated candidate | **89,475,968** | **89.48** |

The equivalent-content saving is **21,029,712 bytes / 19.030%**. This includes the
prior 20,840,774-byte saving plus 188,938 bytes from two newly released River City
Run PNGs. The current-production comparison restores original PNG encodings into
a separate copy of the same compiled output; it is reproducible without changing
the candidate. It is not a second deployed build or a billing measurement.

The increase from 82.66 MB reflects the ten incorporated production commits,
including River City Run, 11 Up billiards polish, Run21 artwork and the coordinated
Horses/Drop scoring release. No newer production behavior was rolled back.

All 24 startup images retain their dimensions and URLs. All 42 inspected PNGs
(original 38 plus four River City images) have exact decoded RGBA equality;
independent Edge decoding reports zero changed channels. Real transparency and
metadata are preserved. All original 108 public URLs plus six newer URLs resolve.
Audio remains 1,636,446 bytes. Eight API entry points, Run21 `cle1`, route handling,
push worker, manifest, launch references and authentication owners are preserved.

The unchanged 90,000,000-byte gate leaves **524,032 bytes** of growth room. A larger
future asset change must be measured; do not raise the budget or lower quality to
make a release pass. Raw static output excludes Vercel function bundles.

Reproduce from the candidate checkout with installed dependencies:

```sh
npm run build
node scripts/build-size-report.mjs dist --max-bytes 90000000 --json .storage-audit/current-build.json
node scripts/storage/compare-original-assets.mjs
node scripts/storage/verify-assets.mjs
node scripts/storage/verify-output.mjs
node scripts/storage/verify-browser.mjs
```

## B. Release gate and the original fifteen failures

| Original category | Resolution |
| --- | --- |
| Nine stake/default cases | RPC mock now returns promises for the real Mega catalog and Originals capability hooks; unexpected RPCs fail. All saved-stake, late-default and duplicate-submit assertions remain. |
| Three unavailable Defaults selections | Tests select the visible Other category and assert the option exists before selecting it. Exact timer, duration, revision and archive assertions remain. |
| Arcade switchboard and ordering | Incorporated production already adds Voyage and River City Run to the explicit expected catalog/order. No visibility assertion was removed. |
| Decorative card-face inventory | Reviewed literal 3/5/7 and 6/7/7/8 artwork; added the precise owner and DOM checks for the fixed fans. River City Run's numeric leaderboard rank was separately reviewed. The AST inventory and all unresolved-card guards remain. |

Correcting the Chucky test exposed a genuine application defect: both Chucky and
Crib Lab displayed a multiplayer default stake but their old solo save handlers
discarded it and bypassed its validation. They now validate a finite stake of at
least one dollar and save it alongside their existing timing settings. Tests
assert exact writes, reject zero/negative/empty/nonfinite stakes, and preserve
timer/limit validation. This changes defaults for future games only; no rule,
settlement, active-match configuration or database schema changed.

The intermittent ordering focus assertion observed the async loading/move cycle
without waiting for an enabled fieldset and the focus effect. It now waits for
those observable conditions while retaining the exact focused-element assertion.
The full suite and five consecutive focused reruns (ten tests) passed.

Validation:

- `npm run build`: TypeScript, **4,008 application tests**, **241 harness tests**,
  tooling tests, Vite and size budget passed. No skipped tests or unhandled errors.
- Final tooling suite: **44 passed**, including full-range/multi-commit comparison,
  code-to-doc rename, missing/divergent history, forced/custom environments,
  manifest failure, read-only transport, pagination, holds and blocked cleanup.
  Two additional safeguard tests were added after the initial full gate and passed
  in the focused final tooling run; application source did not change afterward.
- Asset qualification: **42 exact-pixel images, 24 startup sizes, 114 public URLs,
  83 byte-preserved files, 15 dynamic tile definitions**, unchanged API routes and
  function configuration.
- Built output: **142 HTTP checks**, including all public URLs, three manifest
  icons, startup references and push worker; no missing assets and no SPA fallback
  masking a missing image.
- Actual compiled App in desktop Edge: **28 launch scenarios** and **eight native
  worker push-entry scenarios**, with synthetic HTTP authority and no production
  writes. Includes cold/cached/resumed launch, reduced motion, failed media,
  authentication/access gates, async navigation, retries and duplicate push taps.
- Run21 regression tests passed within the complete suite. Its gameplay, latency
  handler, `cle1`, intent/retry ownership and current production visual/scoring
  integrations are preserved. No new live gameplay/financial proof is claimed.

An independent read-only review questioned the preview baseline. The finding was
checked against Vercel's documented contract: `VERCEL_GIT_PREVIOUS_SHA` identifies
the last **successful** deployment for that project/branch, not the prior push.
Missing history or a missing baseline still builds. No failing-build baseline
shortcut was added.

Evidence is in `docs/codex/evidence/storage-*-20261110.json`; local browser images
are under `qualification.local/launch-splash/` and `qualification.local/push-tap/`.
Build manifests created before the local checkpoint contain the previous branch
SHA. They are local qualification evidence, never publication receipts.

## C. Which changes deploy

`vercel.json` now runs the full `npm run build`, so failed tests stop publication
before output is deployed. The 90 MB check remains part of that command.

The ignored-build command uses a narrow allowlist:

- May skip: root `README.md`, `AGENTS.md`, `CODEX_KICKOFF_PROMPT.md`,
  `CUTOVER_CHECKLIST.md`; Markdown under `docs/codex/`; JSON, TXT, PNG, JPG/JPEG and
  WebP evidence under `docs/codex/evidence/`.
- Always build: application/server/API source; all public and source assets;
  dependencies/lockfiles; configuration; tests; scripts; SQL/migrations;
  executable evidence; workflows; every unknown path.

Production compares the full candidate range with the SHA actually served by
`https://holm357.com/build-manifest.json`. Preview compares with Vercel's last
successful deployment on the same project/branch. Both require an exact checkout,
available ancestor history and only allowlisted changes. Both sides of renames
are examined. A multi-commit push ending in documentation cannot hide code changes.
Missing/unreadable manifests, missing/shallow history, divergence, first previews,
same-SHA rebuilds, empty diffs and custom environments all build. No branch is
blanket-disabled. A preview of `main`, a production build from another branch,
or a missing branch identity also builds, avoiding cross-environment baseline reuse.
A deliberate rebuild can bypass the ignored step in Vercel's
redeploy UI or set `PTOWN_FORCE_BUILD=1`; no such account setting was changed here.

The GitHub main workflow still qualifies every commit, including documentation.
It publishes a release signal only after production serves that exact SHA. If the
live ancestor differs only by allowlisted documentation, it completes successfully
with an explicit skip summary and leaves the existing runtime/release identity
intact. Meaningful changes keep waiting and fail on timeout. It cannot fabricate
an unbuilt release. Its token is exposed only to the final publication step.

Avoid redundant manual previews with `npm run preview:preflight`. It refuses a
dirty checkout and identifies an exact commit already live in production; reuse
that URL for read-only static/UI checks when appropriate. `report:storage` with
`--candidate-sha <full-SHA>` lists existing READY deployments for reuse. Required
isolated previews and checks needing preview-specific environment variables remain
mandatory. Cross-environment SHA equality alone does **not** justify automatic
preview suppression or promotion; preview and production variables can differ.
No second CI deployment path was added. Batch intermediate documentation updates
and reuse the existing qualified preview rather than redeploying it.

Expected reduction is one avoided output build per eligible docs/evidence push:
approximately **89.48 MB of raw static output per avoided build**, or about 0.895 GB
for ten such builds. Actual account savings depend on retention and accounting.
Required preview/production pairs remain. No unmeasured percentage reduction is
promised. Ignored builds may still leave canceled records and consume deployment
quotas; their output is not built.

References: [ignored build step](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel),
[configuration](https://vercel.com/docs/project-configuration/vercel-json),
[successful preview baseline](https://vercel.com/docs/environment-variables/system-environment-variables).

## D. Storage monitoring and safe maintenance

Owner-reported dashboard usage is **8.77 GB**, down from 10.55 GB after the already
authorized 27 deletions. The 1.78 GB reduction and 1.23 GB headroom are owner
observations, not a newly verified billing API result.

The November 10 paginated read-only inventory lists **223 deployments** (222 READY,
one canceled; 138 production and 85 preview) and **219 alias records**. Four new
deployments appear since the November 9 pre-cleanup snapshot. Git-based raw retained
assets total **5.634 GB**, with 222 deployments measured and one partial/unknown.
Major contributors are launch splash (3.120 GB), Mega Card Golf (0.883 GB), Arcade
(0.737 GB), and source assets (0.593 GB). This excludes compiled bundles, functions,
partial builds and other team projects, and is not the 8.77 GB account meter.
Unique Git blob bytes are also reported but never treated as Vercel billing dedup.

**Inventory discrepancy:** 142 alias targets are absent from the current deployment
listing. One sampled target (`dpl_GpDwQYDzRotqhrzGgAcVcKyn8ni8`) returns 404. The
report therefore blocks all cleanup recommendations. Do not attribute the missing
records to this task or delete aliases to silence the discrepancy. Reconcile this
separately with the owner before any future destructive cleanup. All four named
required checkpoints remain READY; current production and its immediate predecessor
are retained. No additional deletion occurred in this task.

Preserve the existing retention settings exactly: canceled **1 day**, errored
**1 day**, pre-production **1 day**, production **1 week**. These are owner-specified
settings; this task did not change them or claim a fresh settings readback.

Run the read-only report before a release, weekly during active development, and
at either warning threshold. This is a documented routine, not a new scheduler.
With `VERCEL_TOKEN` supplied privately in the environment:

```sh
npm run report:storage -- --live --save-snapshot .storage-audit/current-inventory.json --previous .storage-audit/storage-live-20261110.json --json .storage-audit/current-storage.json
```

For offline review, substitute `--snapshot <saved-inventory.json>` for `--live`.
Add `--usage-gb <dashboard-reading> --usage-observed-at <ISO-date>` for threshold
reporting, and `--testing-holds <JSON-array-of-deployment-IDs>` for active test holds.
The report marks manual readings explicitly and never estimates them from asset
totals. `--live` permits only scoped GET requests. The report has no execute/delete
option, including in dry-run use.

| Dashboard usage | Response |
| --- | --- |
| Below 9.0 GB | Routine reporting; retain required checkpoints and the 90 MB build gate. |
| At 9.0 GB | Capture fresh inventory/aliases and actual usage; review duplicate READY outputs, recent builds and large contributors. Reuse qualified previews and batch documentation. |
| At 9.5 GB | Urgent owner review before discretionary previews; reconcile holds/aliases and prepare exact-ID cleanup proposal. Keep necessary fixes/rollback available; no automatic project pause or deletion. |

At the current 89.48 MB static size, 9.0→9.5 GB is roughly five or six additional
retained output copies; function bundles can reduce that room. Recheck real usage.

Future cleanup is a **proposal**, never an age rule. Preserve production, immediate
rollback, rollback candidates, all active aliases, latest READY branch previews,
testing/checkpoint holds and any usage/dependency holds. First reconcile unknown
alias/retention status. Then review exact IDs/SHAs with current traffic/dependencies,
refresh the full inventory, and obtain explicit approval for a bounded batch.
Retain before/after production resource checks and append-only receipts. The existing
audited `cleanup.mjs` remains restricted to the now-completed historical 27 IDs and
five fixed batches; **do not reuse old approvals or widen its allowlist**. A future
batch requires a separately reviewed exact-ID plan and executor authorization.

## Object-storage evaluation — no migration performed

Versioned object storage would materially reduce repeated artwork copies. The
final static images total about 82.24 MB, approximately 91.9% of this build. The
startup PNGs alone total 33.48 MB; keeping those local for native iOS launch leaves
about 48.75 MB of other image content as an upper-bound candidate, subject to
individual compatibility review. At 50 retained builds that upper bound is about
2.44 GB of raw duplicate output. Existing historical builds would not shrink.

[Vercel Blob's published base rates](https://vercel.com/docs/vercel-blob/usage-and-pricing)
are $0.023/GB-month storage, $0.40/million simple operations and $5/million advanced
operations; data delivery starts at $0.05/GB, with plan/region/CDN/origin charges
also applicable. A 0.049 GB artwork version is roughly $0.0011/month in storage at
that base rate; 100 GB delivered is roughly $5 before other applicable charges or
allowances. Traffic, version count and the actual plan matter more than storage
rent. No account charges or new store were created.

Use immutable content-versioned keys and retain every referenced version for
rollback. Existing URLs would need durable compatibility redirects/rewrites or
permanent old objects; deployment output must omit migrated copies to save space.
Test cache headers, CORS, availability, offline/installed clients, old open bundles,
rollback and push entry. New delivery dependencies and transfer costs are real
tradeoffs. **Recommendation:** keep the current lossless build and safeguards now;
consider a separate artwork-only migration if deployment cadence still exceeds
headroom. Keep startup images local initially. No asset migration is authorized.

## E–F. Remaining validation and release recommendation

The local code/test/build gate is green. **Production remains on hold for physical
iPhone acceptance and explicit publication approval.** No hosted candidate was
created under the local-only authorization; new Git/Vercel workflow behavior must
also be observed on the first authorized push (including a later docs-only push).

Owner checklist on the exact authorized HTTPS candidate, without uninstalling the
existing production PWA first:

1. Existing installed iPhone PWA: close it fully, cold-launch from Home Screen in
   portrait and landscape. Confirm correct startup image, no white flash, opening
   frame/video handoff and lobby; repeat with Reduced Motion.
2. Fresh installation on a separate device/profile: install from Safari, cold-launch,
   then background/resume, reload and repeat with cached assets. Check icons/name.
3. Check Arcade tiles, backgrounds and transparent Chucky art at normal and enlarged
   display/text sizes. Open Run21, 11 Up and River City Run to confirm newer art.
4. Verify login/access handling and Async → match → Back navigation. Tap a real push
   with the PWA foregrounded, backgrounded and closed; repeat a stale/same-match tap.
   Confirm one correct destination and a usable retry if connectivity is interrupted.
5. Play Run21 placements, Pass and Take Win/Give Up; confirm response behavior, reload
   recovery, sound/mute and no increasing later-card lag. Use an authorized smoke
   account/session; this task created no financial or production test data.

Before the eventual production push, refresh current main/deployment identity and
integrate any newer releases locally. Preserve production
`dpl_8UkGyaDgE61TrfV43gb27bYRYU6o` and immediate rollback
`dpl_8HJEYfqXdtK8NJTWi1yY7kZytGfH` (or their freshly verified successors).
The prepared local tag is `vercel-storage-local-qualified-20261110`; it is not a
production or physical-device acceptance checkpoint.
