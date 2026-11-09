# Vercel storage cleanup completed — November 9, 2026

All 24 newly authorized deployments were deleted in four groups of six, with
zero skipped. Including Batch 1, exactly the original 27 IDs are deleted:
22 superseded production deployments and five previews. No additional candidates
were discovered or selected. Final verification completed at 20:45:38 UTC.

Inventory changed **384 → 381 → 375 → 369 → 363 → 357**. The exact inventory
difference is the authorized list; there were no unexpected additions or
removals. All **219 alias mappings** retain their original fingerprint.

## Storage estimate and accounting

| Scope | Deleted | Estimated public bytes |
|---|---:|---:|
| Batch 1 | 3 | 197,337,216 |
| Remaining four groups | 24 | 1,585,211,506 |
| Complete original proposal | 27 | **1,782,548,722 (1.783 GB)** |

These are retired public-directory estimates at the original commits, excluding
compiled output and function bundles. They are not confirmed billed-storage
reductions. The accounting API returned **404 costs_not_found** for November
1–10; live credited usage remains unavailable. The last owner-reported usage
was 10.55 GB. No exact recovered capacity or current usage is claimed.

## Exact deletion ledger

All timestamps below are UTC on November 9, 2026. Every response identifies the
requested deployment with state DELETED; subsequent authenticated GET checks
return 404. The remaining 24 also have explicit HTTP 200 DELETE receipts.
Batch 1's original ledger retained its response body, not the HTTP status.

| Batch | Deployment ID | Type | Deleted UTC | Estimated public bytes | DELETE response | GET |
|---|---|---|---|---:|---|---|
| 1 | `dpl_HygmYvgTtqJwXXWDQ2oQn4JEtKtB` | production | 19:47:57.457 | 65,779,072 | DELETED | 404 |
| 1 | `dpl_BDmoAMuKW7H2BHB6PkfG6eXoNTkA` | production | 19:48:12.430 | 65,779,072 | DELETED | 404 |
| 1 | `dpl_CT6Z1qPgTueQ95p9oLxbq9QY5YwJ` | preview | 19:48:27.665 | 65,779,072 | DELETED | 404 |
| 2 | `dpl_F9Hyk5BrKRiV1DsYdhGG9p95zQrd` | production | 20:36:52.298 | 65,779,072 | 200 / DELETED | 404 |
| 2 | `dpl_98gVba75crv5FY5JzNaGFsGVjnQN` | production | 20:37:09.093 | 65,779,072 | 200 / DELETED | 404 |
| 2 | `dpl_8KfgkdVVfWTEmsxdZCtszL8FsTxQ` | production | 20:37:21.585 | 65,779,072 | 200 / DELETED | 404 |
| 2 | `dpl_Gp2tU3F1K67r2u4ofaJeMdysv55o` | production | 20:37:34.692 | 65,779,072 | 200 / DELETED | 404 |
| 2 | `dpl_7xCpvSG7PdNKDcpoFjx2BQbxyQQW` | production | 20:37:49.124 | 65,779,072 | 200 / DELETED | 404 |
| 2 | `dpl_4pwNVo5GP2F6Do6eNyovqngqSHiB` | production | 20:38:02.135 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_8Vj8YxwypVXZVjTD4MY6NPN1UKWK` | preview | 20:39:27.025 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_9unexg79SeLod2ooBk38gm3GhQPy` | production | 20:39:41.755 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_C9bfY3FeWbZ6HVEyK4yoyXH1gkXb` | production | 20:39:54.773 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_HVfwkjk2KrVFDo6EkzA87XSK1ivA` | production | 20:40:08.393 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_8Lr1KLyuzDtVbsePsGQWw2LGwQRa` | production | 20:40:23.959 | 65,779,072 | 200 / DELETED | 404 |
| 3 | `dpl_35HxT5CjWjRdEW1TUxWx5YggQzvA` | production | 20:40:38.348 | 65,925,838 | 200 / DELETED | 404 |
| 4 | `dpl_9FWyjDpXderHNqev73rcV1gK7H7L` | production | 20:41:54.675 | 66,107,240 | 200 / DELETED | 404 |
| 4 | `dpl_56dijaBzpYuQcYtSPJFeRygQ1kNT` | production | 20:42:08.933 | 66,107,240 | 200 / DELETED | 404 |
| 4 | `dpl_9q6n1TwmmxUTsd9w5rq5iRbVTAgC` | production | 20:42:23.458 | 66,349,394 | 200 / DELETED | 404 |
| 4 | `dpl_3c8qCRB5Ab9pqToE5FeaLFT9jKbS` | production | 20:42:38.460 | 66,349,394 | 200 / DELETED | 404 |
| 4 | `dpl_7tdKPHXYJDwe7edXThbFwhbnGzxh` | production | 20:42:51.821 | 66,349,625 | 200 / DELETED | 404 |
| 4 | `dpl_HTow8nDGUzAzTim4JTiTokYG5a9x` | preview | 20:43:04.413 | 66,349,666 | 200 / DELETED | 404 |
| 5 | `dpl_BVkKyfihgnVkhj3Apj3nu51dYsCF` | production | 20:44:02.781 | 66,349,666 | 200 / DELETED | 404 |
| 5 | `dpl_6noqqQFZdZ9xaSLTp2SvKHVQGPQ2` | preview | 20:44:15.231 | 66,349,666 | 200 / DELETED | 404 |
| 5 | `dpl_5B7tDAzAhbG4ynXham7fo3o6GmhG` | production | 20:44:28.378 | 66,349,666 | 200 / DELETED | 404 |
| 5 | `dpl_2Anqd2PFeR1w1CUNf9JiDA6p8z1n` | preview | 20:44:42.411 | 66,351,415 | 200 / DELETED | 404 |
| 5 | `dpl_72J1wxQEz23j5zaHarr9x3wJTcfA` | production | 20:44:55.725 | 66,351,415 | 200 / DELETED | 404 |
| 5 | `dpl_7tShrZGrMn4Px3cbkvnHT5GkFHQn` | production | 20:45:09.959 | 66,351,489 | 200 / DELETED | 404 |

Skipped deployments: **none**. Every deletion was confirmed independently;
no ambiguous response, protection error or authorization error was bypassed.

## Production and preservation evidence

Both https://holm357.com and https://ptown-poker.vercel.app still serve
production commit `97372c3b025d4b5b59b82bcaf617e0fb10f425f4`.
The 164-resource comparison passed before each group, after every deletion,
and in the independent post-group verification. It includes current JS/CSS,
108 preserved public URLs on the primary origin, all 24 startup selections on
both origins, manifest, push worker, auth/Async route shells, and eight function
boundaries. Responses and resource fingerprints match the Batch 1 baseline.

All known preservation holds remain intact. These required deployments were
also independently fetched and confirmed READY after every group:

| Purpose | Deployment | Commit |
|---|---|---|
| Production | `dpl_BDFK4NK8QiFFJeF6jUiuS1f12rHY` | `97372c3b025d4b5b59b82bcaf617e0fb10f425f4` |
| Immediate predecessor | `dpl_4n3BvhW4JnnEZzWg5WzUsQC1SSPH` | `0a0a82cf7ae67f26e3a5ca0648e19461ef29e9bd` |
| Gameplay checkpoint | `dpl_BEoJpuZ5isvwcu77ggyri2rQPEYy` | `79d113de791616f20ab716a33bbe558db8c91f56` |
| Run21 checkpoint | `dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo` | `8415395b545f16a94542cdcb9925237e715fedf0` |

All four production aliases still target the production deployment:
holm357.com, ptown-poker.vercel.app, ptown-poker-jeremy-8e2b.vercel.app and
ptown-poker-git-main-jeremy-8e2b.vercel.app.

Recent runtime-error and production error/fatal log queries passed after every
group with no returned errors. The final production-log window was
20:15:28–20:45:28 UTC. Every candidate's available pre-deletion 30-minute runtime
log review also returned no records. Complete static/direct-origin request
traffic remains unavailable.

Verification used public GET/HEAD and unauthenticated method/route/auth guards.
It did not run signed-in gameplay, deliver pushes, mutate balances or touch
Supabase. No active-session disruption was observed, but this is not a physical
iPhone or full authenticated gameplay test.

## Procedure and exceptions

The existing cleanup tooling now binds each remaining group to its exact six
original IDs and approval hash. The original three-ID transport remains the
default; no arbitrary target or larger group is accepted. Before each deletion,
complete inventories and direct aliases are refreshed, identities are matched,
and production, predecessor, rollback candidates, active previews, dependencies
and explicit checkpoint holds are excluded. Missing retention metadata alone
was accepted under the owner's explicit policy.

Production, all alias mappings and preserved-deployment fingerprints are checked
throughout and across groups. Excluded candidates are recorded without
replacement. A failed API response, protection/authorization error, health
difference, ambiguous deletion intent or production drift halts execution.
Twenty-three offline safety tests passed. This run encountered no skipped
candidates, unexpected API responses or production differences.

The REST credential stayed in process memory and was cleared afterward. No
credential is included in these records. No gameplay code, deployment, branch
publication, Supabase, billing, retention, protection or alias change occurred.

The machine-readable [audit ledger](evidence/storage-cleanup-execution-20261109.json)
contains exact timestamps, types, sizes, DELETE/GET receipts and pre/post checks.
Durable raw execution and health files remain in ignored
`.storage-audit/cleanup/`.

## Follow-up

Check the team's Usage view for both Deployment Storage and Functions Storage,
filtered to P-Town Poker and the appropriate date range. Vercel records daily
maximums and stops a deployment's storage contribution at first deletion;
historical daily usage is not a live remaining-byte counter. See
[Vercel Deployment Storage](https://vercel.com/docs/deployment-storage).

If current storage still appears excessive after the next accounting update,
reconcile the dashboard's metric/date scope with this ledger and provide these
27 deletion IDs and timestamps to Vercel support if the credit remains unclear.
Do not infer permission for additional deletions or policy/billing changes.

The optimized artwork commit `e675f34e659189f0b98ecc1b6c22068fc82fcb33` remains
unpublished. Its existing 15 full-gate failures and pending physical-iPhone
acceptance remain release blockers; cleanup does not waive them.

