# Run21 production release transplant

## Published September 22

Application commit: `9e1a609d2ba97b3b7e826a6d1c6b336af8992b29`.
Production deployment: `dpl_9gWa8omvxy8q7Bmx6ze7EGtefWAL`,
https://ptown-poker.vercel.app (also https://holm357.com).
The fresh remote production build includes the server-only Run21 variables.
The manifest registers `api/run21`, Node 24, with a 300-second limit.
Explicit authority routing precedes filesystem handling; unmatched `/api/*`
requests return 404 rather than the SPA. Node ESM imports use explicit `.js`
extensions. The existing authority engine and authorization behavior are unchanged.

The four versions below applied successfully through an isolated release set
containing only already-recorded remote versions and those four pending Run21
versions. No historical local-only migration was applied or history repaired.
The gate is enabled solely for Hap's verified admin UUID. Anonymous authority
requests return JSON 401; an authenticated non-allowlisted fixture returns JSON
403 before and after gate enablement. Both temporary auth users were deleted.
Another admin's capability response is disabled. Hap's existing browser session
opened Other → Run21 setup; Holm and Yahtzee options also loaded. The temporary
fake-money setup was ended through the canonical UI and its removal verified.
Jeremy will perform the first gameplay test. The preflight notes below are
historical and superseded by this publication.

Base: exact current-main commit 3d8a5f3db22f3e865fec9386840b9b90bf082199.
Preserved draft checkpoint: 5d13c2279484abcb9049d6e44cb912b2812e26b7 on codex/run21-app-test-reconciled.
Release branch: codex/run21-production-release.

Only Run21 changes from 8353b340f, 5344b6408 and the draft checkpoint were
transplanted. Overlapping shared registrations retain current-main Farkle
entries and add Run21. All existing historical migrations, .gitattributes,
Farkle/Gin files and non-Run21 proofs remain exactly at current main.

The Supabase CLI generated these unpublished migrations, in order. Their
committed SQL blobs are identical to the corresponding checkpoint SQL:

| New version | Run21 content | Checkpoint source version |
| --- | --- | --- |
| 20260922023415 | Release capability gate | 20260921211828 |
| 20260922023434 | Persisted authority and isolated settlement | 20260921213310 |
| 20260922023436 | Fixture cleanup dependencies | 20260921221208 |
| 20260922023438 | Admin-plus-UUID gate and server revision notifications | 20260922010105 |

The old Run21 migration filenames are absent from this release branch. The
previous disposable local state and the locally applied 20260922010105
migration remain preserved with the original worktree.

## Production gate

Jeremy selected the existing Hap administrator UUID:
d7dc1928-3727-4351-b0ff-0e80c81c2953. Enabling requires both that UUID's
allowlist membership and its current administrator role. This is now the sole
production allowlist entry, and the qualified production gate is enabled.

## Blocking production preflight

Command:

    supabase db push --project-ref xvhmbuppghwmwpwrkzao --dry-run --skip-vault

Result: LegacyDbPushMissingLocalError — Remote migration versions not found
in local migrations directory.

The same historical mismatch remains on the exact requested current-main
base after regenerating the four Run21 migrations. Existing historical files
were not inspected, rewritten or repaired. No alternate application path was
used. Production application is conditional on a dry run containing only the
four newly numbered migrations, and that condition has not been satisfied.
The full dry-run output is retained in the ignored qualification.local folder.

Per the requested bounded release procedure, no full tests, SQL proof
collection, replay campaign or local Vercel artifact build was rerun.

Final-branch checks: application typecheck and one Vite production build passed.
