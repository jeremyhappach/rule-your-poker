# Vercel storage cleanup — Batch 1 executed November 9, 2026

Subsequent update: the remaining 24 were separately authorized and deleted in
four groups of six. See the [complete 27-ID ledger](VERCEL_STORAGE_CLEANUP_RESULT.md).
This document preserves the original Batch 1 results and approval boundary.

Exactly the three owner-authorized deployments were deleted. No other deployment
changed, no code was deployed or pushed, and no Supabase, billing, alias,
protection or retention setting was changed.

## Confirmed deletion receipts

| Deployment ID | DELETE confirmed (UTC) | Receipt | Final GET |
|---|---|---|---|
| `dpl_HygmYvgTtqJwXXWDQ2oQn4JEtKtB` | 2026-11-09 19:47:57.457 | `DELETED`, matching ID | 404 |
| `dpl_BDmoAMuKW7H2BHB6PkfG6eXoNTkA` | 2026-11-09 19:48:12.430 | `DELETED`, matching ID | 404 |
| `dpl_CT6Z1qPgTueQ95p9oLxbq9QY5YwJ` | 2026-11-09 19:48:27.665 | `DELETED`, matching ID | 404 |

The complete inventory changed from **384 to 381** deployments. The exact set
difference contains only those three IDs; there are no additions. All **219
alias mappings** retain the identical fingerprint. Final independent verification
completed at 19:49:10 UTC. The batch stopped after the third deletion.

## Safety checks and preservation

Before every deletion the script refreshed the complete deployment and alias
inventories, direct candidate aliases, Git identities, production/predecessor,
rollback flags, latest branch previews and 228 known preservation holds. Each
candidate was READY, unaliased, explicitly not a rollback candidate, superseded
and outside the preservation holds. Available candidate runtime logs contained
no entries in the 19:16–19:46 UTC preflight window. The owner's accepted limitation
remains: complete static/direct-origin traffic and deletion-retention metadata
are unavailable; no protection error was bypassed.

These four explicitly required deployments remain READY:

| Purpose | Deployment ID | Commit |
|---|---|---|
| Current production | `dpl_BDFK4NK8QiFFJeF6jUiuS1f12rHY` | `97372c3b025d4b5b59b82bcaf617e0fb10f425f4` |
| Immediate predecessor | `dpl_4n3BvhW4JnnEZzWg5WzUsQC1SSPH` | `0a0a82cf7ae67f26e3a5ca0648e19461ef29e9bd` |
| Gameplay-tested checkpoint | `dpl_BEoJpuZ5isvwcu77ggyri2rQPEYy` | `79d113de791616f20ab716a33bbe558db8c91f56` |
| Run21 browser-tested checkpoint | `dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo` | `8415395b545f16a94542cdcb9925237e715fedf0` |

The production aliases `holm357.com`, `ptown-poker.vercel.app`,
`ptown-poker-jeremy-8e2b.vercel.app` and
`ptown-poker-git-main-jeremy-8e2b.vercel.app` still target current production.

## Production verification

The 164-resource health comparison passed before deletion, after each of the
three deletions, and in the final independent pass. Both public domains still
serve build `97372c3b025d4b5b59b82bcaf617e0fb10f425f4` with identical HTML,
current JS/CSS and expected public resources. Checks cover all 108 preserved
public URLs on the primary domain, 24 startup references on both domains,
manifest, push worker, auth/Async route shells, and all eight function endpoints.

Function checks use unauthenticated GET requests and validate existing
method/route/authentication rejection responses. They do not run gameplay,
write balances, deliver push notifications or access Supabase. Signed-in gameplay
and physical iPhone behavior were not exercised by this cleanup.

The post-batch 30-minute runtime-error query returned no error clusters. The
production error/fatal log query, ending 19:48:59 UTC, returned no records.
This is a bounded observation, not a claim of long-term zero errors.

## Storage accounting and unexpected behavior

Estimated retired public assets total **197,337,216 bytes (197.34 MB / 0.197 GB)**.
This is the prior measured public-directory estimate, excluding compiled assets
and functions; it is not a measured account-storage reduction. Live usage remains
unavailable: the billing charges API returned `404 costs_not_found`. Verify the
team Usage dashboard for the actual credited amount. Vercel documents daily
maximum accounting and exclusion from storage contribution at first deletion:
[Deployment Storage](https://vercel.com/docs/deployment-storage).

Before any DELETE, the first REST inspection exposed that its inventory uses
`uid`, while the connector snapshot used `id`. The local collector now normalizes
that field and rejects conflicting identities. All 18 cleanup safety tests pass,
including REST normalization, identity conflict and existing stop conditions.
The live dry run then passed. There were no unexpected deletion responses or
post-deletion production differences.

The credential was loaded from the owner-configured Windows-encrypted file into
the child process environment and cleared afterward. It was not printed or
committed. Local ignored evidence is under `.storage-audit/cleanup/`, including
`execution.jsonl`, `batch1-result.json`, production health results and telemetry.

The optimized commit `e675f34e659189f0b98ecc1b6c22068fc82fcb33` remains local and
unpublished. Its existing 15 full-gate failures remain release blockers. The
remaining 24 proposed deletions and any publication require separate explicit
authorization; Batch 1 does not expand automatically.
