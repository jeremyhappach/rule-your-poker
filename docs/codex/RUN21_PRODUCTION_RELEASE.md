# Run21 production release transplant

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
allowlist membership and its current administrator role. No production
allowlist, migration or deployment configuration has been changed.

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
