# Vercel deployment cleanup proposal — November 9, 2026

## Completed — all original 27 IDs

The owner separately authorized the remaining 24. They were deleted in four
groups of six, with zero skipped. All 27 original IDs are now confirmed deleted;
inventory is 357, all 219 aliases are unchanged, and production/preservation
checks passed. Estimated retired public assets total 1.783 GB; billed storage
reduction remains unverified. No further deletion is authorized. See the
[complete execution ledger and checks](VERCEL_STORAGE_CLEANUP_RESULT.md).
All proposal and pending-approval statements below are historical snapshots.

## Batch 1 completed — first three only

The owner explicitly authorized the three IDs below. All three were deleted
November 9 at 19:47–19:48 UTC. Inventory changed 384 → 381; all 219 alias mappings
and current production remain unchanged. Production checks passed after each
deletion. Estimated retired public assets: 197.34 MB; live account usage is not
available. The remaining 24 IDs are not authorized. See the
[exact receipts and final verification](VERCEL_STORAGE_BATCH1_RESULT.md).

The preparation and original proposal below are retained as historical evidence;
their pending-approval and no-deletion statements describe the pre-execution state.

## Original hotfix preparation: first three only

The owner's revised policy accepts missing retention/protection metadata as a
residual risk. It supersedes the previous zero-candidate classification. This
does not authorize deletion or permit bypassing a Vercel protection error.

The three oldest entries below are the proposed initial batch:

| Deployment | Created CST | Commit | Why selected | Estimated public bytes |
|---|---|---|---|---:|
| `dpl_HygmYvgTtqJwXXWDQ2oQn4JEtKtB` | Nov 4, 17:17 | `5407fd0fc` | Superseded production; no aliases or rollback flag | 65,779,072 |
| `dpl_BDmoAMuKW7H2BHB6PkfG6eXoNTkA` | Nov 4, 17:43 | `af559022f` | Superseded production; no aliases or rollback flag | 65,779,072 |
| `dpl_CT6Z1qPgTueQ95p9oLxbq9QY5YwJ` | Nov 4, 19:16 | `cb04c67cb` | Superseded Take 2 preview; newer branch preview and same-commit production retained | 65,779,072 |

Estimated first-batch recovery: **197,337,216 bytes (197.34 MB / 0.197 GB)**.
At the newly reported 10.55 GB usage, this alone would leave approximately
10.353 GB if fully credited. All 27's prior 1.783 GB estimate would leave about
1.233 GB headroom, but this first batch grants no authority for the remaining 24.

The refreshed 384 deployments and 219 aliases remain unchanged. Current
production and predecessor are still `dpl_BDFK4NK8QiFFJeF6jUiuS1f12rHY` and
`dpl_4n3BvhW4JnnEZzWg5WzUsQC1SSPH`. Preserve `dpl_BEoJpuZ5isvwcu77ggyri2rQPEYy`
and `dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo`, all assigned alias targets, latest branch
previews and known testing/checkpoint holds. The script also discovers and holds
new production, its predecessor, latest five production builds and any current
rollback candidates.

Each candidate returned no runtime logs for the available 30-minute window
(18:01–18:31 UTC). The initial one-hour request exceeded Hobby's retained window;
it was not treated as a zero-usage result. Aggregate observability schema access
returned 404. No runtime errors were returned by a subsequent recent project
error query. This is limited telemetry, not proof of no static/direct-URL traffic.

Current source contains no candidate-hostname or deployment-pinning reference.
Assets, PWA start/scope, worker registration and push navigation use same-origin
paths. The worker caches local push bindings/receipts, not an application shell.
Both public domains serve production SHA `97372c3b`; 164 resource checks passed,
including all 108 preserved public URLs on the primary origin, current JS/CSS,
24 startup references on both origins and all eight function rejection paths.
GET probes are unauthenticated and stop at existing method/route/auth guards;
they do not create sessions, deliver pushes, or call database operations. Auth
and Async route shells load; signed-in gameplay/PWA behavior was not exercised.

Residual risk: a dormant browser or PWA installed from an old direct deployment
origin can lose deferred assets, function access or push-entry navigation after
deletion. Installed-client inventories and externally persisted links were not
queried. Four-to-five-day-old candidates reduce recency risk but do not remove
it. Stop for positive usage/dependency evidence, any explicit Vercel rejection,
alias/production drift or unexpected health result. No claim of zero risk.

### Prepared automation

`scripts/storage/cleanup.mjs` uses the official Vercel REST API, a fixed original
27-ID allowlist and a narrower immutable first-three execution bound. It defaults
to dry-run, refreshes complete inventories and candidate aliases before every
DELETE, uses durable audit receipts for idempotency, and stops on error without
retry. It deletes by ID only; no alias URL, project deletion, force, policy,
environment, billing or database mutation path exists. Full protection metadata
is not an eligibility requirement. The 16 offline safety tests pass.

```sh
node scripts/storage/cleanup.mjs --snapshot .storage-audit/cleanup/snapshot.json --review .storage-audit/cleanup/review.json
node --test scripts/storage/cleanup.test.mjs
```

The saved snapshot is dry-run only. Live REST dry-run and later execution require
`VERCEL_TOKEN` supplied privately in the process environment; no token or Vercel
CLI is currently available. Do not paste credentials into chat, command arguments
or tracked files. Actual token permissions and live DELETE responses have not
been tested. No authentication bypass or share link was created.

After explicit owner approval, record that authorization against the exact plan
hash and IDs using the unapproved example JSON, refresh the traffic/dependency
review, then run with `--execute --approval <local-file> --review <local-file>`.
Execution refuses snapshots, stale approval/review, or a changed plan. It probes
production before and after every deletion and stops permanently after these
three. Missing/ambiguous deletion responses require reconciliation, not retries.

After the batch, separately review recent request errors, signed-in access when
an authorized session is available, and account storage. The connector currently
cannot expose complete traffic or live storage accounting. Vercel uses daily
maximums, so stale usage alone never authorizes another batch. Recommend the next
bounded batch only after reviewing actual or pending recovery.

The image optimization, 108 URLs, splash behavior, sounds, push and Run21 region
are unchanged. Full gate repair, coordinated deployment-frequency controls and
versioned object-storage evaluation remain separate prevention work; no release
gate is bypassed and no code is published in this cleanup-preparation pass.

---

**Proposal only. No deployments have been deleted. Explicit approval is required.**

Inventory refreshed 2026-11-09T17:25:23.256Z (11:25:23 CST). Project `ptown-poker`, team `jeremy-8e2b`. All 384 deployment records and 219 aliases were paginated.

## Selection and estimated recovery

27 superseded READY deployments: 22 production and 5 preview. Their exact Git public directories total **1,782,548,722 bytes (1.783 GB)**. This excludes compiled assets/functions and is not an account-billing guarantee. Against the user-reported 10.24 GB total, that corresponds to roughly 1.54 GB headroom if Vercel credits those bytes; verify the dashboard after deletion.

Every row has **zero aliases**, `rollbackCandidate=false`, and no identified recent-deployment/branch retention exception. Every commit is already in live production ancestry. All branch-latest READY previews, all aliases, the latest five production builds, and the latest production checkpoint of each day from November 1 onward are excluded. Old testing URLs outside those holds must still be reviewed by the owner before approval.

Project authentication is `all_except_custom_domains`; it is unchanged. Exact saved retention periods and per-deployment protection overrides are unavailable through the connector. This is a proposed manual cleanup, not a claim that an age-based retention policy has expired.

## Required keep list

| Deployment ID | Commit | Purpose |
|---|---|---|
| `dpl_BDFK4NK8QiFFJeF6jUiuS1f12rHY` | `97372c3b025d4b5b59b82bcaf617e0fb10f425f4` | Active production |
| `dpl_4n3BvhW4JnnEZzWg5WzUsQC1SSPH` | `0a0a82cf7ae67f26e3a5ca0648e19461ef29e9bd` | Immediately preceding rollback candidate |
| `dpl_BEoJpuZ5isvwcu77ggyri2rQPEYy` | `79d113de791616f20ab716a33bbe558db8c91f56` | Gameplay-tested 79d113de |

## Exact proposed deletion list

Times are America/Chicago (CST). Each row: aliases **none**; known retention exception **none identified**; project URL authentication **enabled**. The companion JSON records these statuses individually and includes full SHAs.

| # | Deployment ID | Created CST | Branch | Commit | Environment | Public MB |
|---|---|---|---|---|---|---:|
| 1 | `dpl_HygmYvgTtqJwXXWDQ2oQn4JEtKtB` | 2026-11-04 17:17:33 | `main` | `5407fd0fc710dd4790dc51f07760e94c150071c7` | production | 65.779 |
| 2 | `dpl_BDmoAMuKW7H2BHB6PkfG6eXoNTkA` | 2026-11-04 17:43:07 | `main` | `af559022f079f193d928e07dbd12ce86b09ca198` | production | 65.779 |
| 3 | `dpl_CT6Z1qPgTueQ95p9oLxbq9QY5YwJ` | 2026-11-04 19:16:54 | `codex/async-take-two` | `cb04c67cb9d1d6efd6bd80d70d570b0414edba26` | preview | 65.779 |
| 4 | `dpl_F9Hyk5BrKRiV1DsYdhGG9p95zQrd` | 2026-11-04 19:16:59 | `main` | `cb04c67cb9d1d6efd6bd80d70d570b0414edba26` | production | 65.779 |
| 5 | `dpl_98gVba75crv5FY5JzNaGFsGVjnQN` | 2026-11-05 06:56:13 | `main` | `be61150a98f2be0ed5202e1e9aad464c0b0d5906` | production | 65.779 |
| 6 | `dpl_8KfgkdVVfWTEmsxdZCtszL8FsTxQ` | 2026-11-05 10:27:44 | `main` | `47939ceffadbbb5423e5ef0ee98e25624f43d39b` | production | 65.779 |
| 7 | `dpl_Gp2tU3F1K67r2u4ofaJeMdysv55o` | 2026-11-05 12:05:39 | `main` | `76f3c7917a8d2baeb877d722585de99105b5c63c` | production | 65.779 |
| 8 | `dpl_7xCpvSG7PdNKDcpoFjx2BQbxyQQW` | 2026-11-05 12:29:17 | `main` | `76f3c7917a8d2baeb877d722585de99105b5c63c` | production | 65.779 |
| 9 | `dpl_4pwNVo5GP2F6Do6eNyovqngqSHiB` | 2026-11-05 14:31:35 | `main` | `84696641119d3aaa2c432f6284cb82343fe067a2` | production | 65.779 |
| 10 | `dpl_8Vj8YxwypVXZVjTD4MY6NPN1UKWK` | 2026-11-06 09:03:55 | `codex/async-latency-audit` | `5e096e2759a4bfd106ae5d6db7289e21f5acc068` | preview | 65.779 |
| 11 | `dpl_9unexg79SeLod2ooBk38gm3GhQPy` | 2026-11-06 09:03:57 | `main` | `5e096e2759a4bfd106ae5d6db7289e21f5acc068` | production | 65.779 |
| 12 | `dpl_C9bfY3FeWbZ6HVEyK4yoyXH1gkXb` | 2026-11-06 09:08:18 | `main` | `8c7d22a45377861810adb22533b438c3d7868c1a` | production | 65.779 |
| 13 | `dpl_HVfwkjk2KrVFDo6EkzA87XSK1ivA` | 2026-11-06 10:30:42 | `main` | `6f9b15226dd683ffb646fc6e413b266048804ddb` | production | 65.779 |
| 14 | `dpl_8Lr1KLyuzDtVbsePsGQWw2LGwQRa` | 2026-11-06 12:06:55 | `main` | `670f5a9f52c3fbef3dd545cdbafff5d6a603595a` | production | 65.779 |
| 15 | `dpl_35HxT5CjWjRdEW1TUxWx5YggQzvA` | 2026-11-06 12:45:10 | `main` | `176c7065979c96b2e8bb07be7da4c30a515628f0` | production | 65.926 |
| 16 | `dpl_9FWyjDpXderHNqev73rcV1gK7H7L` | 2026-11-06 13:20:24 | `main` | `4a2af74f420e4ffb9ceae359f44e9c844054e143` | production | 66.107 |
| 17 | `dpl_56dijaBzpYuQcYtSPJFeRygQ1kNT` | 2026-11-06 15:07:11 | `main` | `3b0702053c0d0d07994b965550096329422112ef` | production | 66.107 |
| 18 | `dpl_9q6n1TwmmxUTsd9w5rq5iRbVTAgC` | 2026-11-06 17:19:01 | `main` | `b8c893acab4f1c653385efd7e5a5f38b1a0eba2f` | production | 66.349 |
| 19 | `dpl_3c8qCRB5Ab9pqToE5FeaLFT9jKbS` | 2026-11-06 17:25:08 | `main` | `4a72affb6475f43318756a8c5c612eb127d9f6c2` | production | 66.349 |
| 20 | `dpl_7tdKPHXYJDwe7edXThbFwhbnGzxh` | 2026-11-07 08:24:45 | `main` | `169734bfb3d8caf9765d1af1e113aa95f2547ab1` | production | 66.350 |
| 21 | `dpl_HTow8nDGUzAzTim4JTiTokYG5a9x` | 2026-11-07 08:48:47 | `codex/async-push-delivery-first` | `f7038cf74f4870c88ae57bfcfbf04c5e97e5a88c` | preview | 66.350 |
| 22 | `dpl_BVkKyfihgnVkhj3Apj3nu51dYsCF` | 2026-11-07 08:48:50 | `main` | `f7038cf74f4870c88ae57bfcfbf04c5e97e5a88c` | production | 66.350 |
| 23 | `dpl_6noqqQFZdZ9xaSLTp2SvKHVQGPQ2` | 2026-11-07 10:04:09 | `codex/async-push-delivery-first` | `a6d6e59c726c87160166436beee5e7d837bc2a80` | preview | 66.350 |
| 24 | `dpl_5B7tDAzAhbG4ynXham7fo3o6GmhG` | 2026-11-07 10:04:12 | `main` | `a6d6e59c726c87160166436beee5e7d837bc2a80` | production | 66.350 |
| 25 | `dpl_2Anqd2PFeR1w1CUNf9JiDA6p8z1n` | 2026-11-07 10:27:52 | `codex/async-push-delivery-first` | `8f0635b66754a302b430348a5b165a935c704eac` | preview | 66.351 |
| 26 | `dpl_72J1wxQEz23j5zaHarr9x3wJTcfA` | 2026-11-07 10:27:55 | `main` | `8f0635b66754a302b430348a5b165a935c704eac` | production | 66.351 |
| 27 | `dpl_7tShrZGrMn4Px3cbkvnHT5GkFHQn` | 2026-11-07 10:40:21 | `main` | `7b2542f37746661c64e5fcf27c9dcfe76b422f9d` | production | 66.351 |

## Approval and execution boundary

Approval must name this 27-ID list. Immediately before deletion, refresh the keep set and every selected identity; stop on drift. Do not delete aliases, remote branches, the project, or any Supabase data. Do not change protection, billing, or retention. Remove only approved deployments in bounded batches and stop once account storage shows the requested headroom. Do not rely on a deleted deployment remaining recoverable.

After each batch, verify current production identity, production aliases and the
required rollback deployments with read-only checks. Reconcile successful
deletions against account usage when storage accounting updates; delayed usage
must not trigger deletion of anything outside the approved list. No promotion,
rollback or production write is part of cleanup verification.

The full inventory snapshot remains local under `.storage-audit/inventory.json`; the portable row-level proposal is [storage-deletion-proposal-20261109.json](evidence/storage-deletion-proposal-20261109.json).
