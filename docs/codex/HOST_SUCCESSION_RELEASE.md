# Host succession production release — 2026-11-03

Jeremy explicitly authorized production migration, main integration/push and
deployment without staging or preview. No further approval is required within
this scope. No live table may be closed or financially changed to pass the gate.

## Reconciliation

Fresh remote main: `46a7b1f6e8b3f7220fbde81cc3743ac57a244f68`.
Release branch: `codex/host-succession-release-20261103`, in its own worktree.
It combines `48ac2026b` and `c41f05f0b` with that main. Runtime hunks merged
cleanly; the release-note header retains both records. Newer pause/resume, sound
and 357 changes are preserved. Activity-aware recovery is excluded.
The unapplied migration was resequenced after installed 357 migration
`20261103000630`. Supabase recorded it as `20261103144601`; the repository filename
matches that actual version. Its runtime SQL is otherwise unchanged.

## Local qualification

- 62 host announcement, waiting-start and participation tests pass.
- 182 focused pause/resume tests pass on the combined source.
- Application TypeScript check and Vite production build pass (existing chunk
  size warning). No dependencies installed.
- `node dev/session-membership/proof.mjs --release`: 21 check groups pass,
  including tenure, disconnect/rejoin, bots/inactive humans, full-game inactivity
  thresholds, dealer reassignment, duplicate and concurrent transitions,
  successor/old-host authorization, and synthetic financial preservation in both
  money modes. Refusal, lock contention, injected failures and code restoration
  retain atomicity and financial/history rows.

The release runner clones the existing localhost synthetic transition fixture.
Read-only production captures verify 13 host/participation/financial function
entries, 86 trigger functions/enabled states and 18 indexes. Golf's associative
OR trigger expression is deparsed differently by the local server; recreating
the exact captured production trigger produces the identical local definition.
The exact current-main 357 owner is installed in the clone, normalizing Windows
checkout CRLF to the deployed LF body; its production hash is verified.

The archive omitted new history-seal tables/functions and push table metadata.
The clone receives empty history-seal table shapes and exact captured trigger
definitions; no historical audit rows, production accounts or secrets are copied.
Push schema has empty preferences/subscriptions and no dispatcher. An empty Auth
session table supplies only the columns referenced by that trigger. This does not
claim hosted Auth or notification-delivery validation.

Initial fixture bootstrap attempts failed on omitted dependencies and formatting;
the final runner resolves those setup failures. The append-only account guard
correctly rejected the old blanket truncate. The final runner deletes only the
nine copied `Transition assurance` fake-money fixtures after proving none has an
account posting, with every trigger enabled. Original fixtures are untouched;
the uniquely named copy is dropped afterward. No product assertion was removed.

## Production gate and receipt

Read-only checks at 14:35 and 14:44 UTC found zero `public.games` rows where
`status NOT IN ('session_ended','completed')`. This includes paused/empty tables;
async matches normally use separate private rows. The migration repeats the
predicate under table locks with a three-second lock timeout.
The observed prior latest migration is `20261103000630`; the exact affected owner
hashes still match their captured preimages. The preserved 357 recovery MD5 is
`4c45cfbc7e4afdab3fefae46534ec391`.

The final read-only gate was also zero. Production migration
`20261103144601_session_host_succession_and_inactivity` applied successfully. All
seven candidate triggers are enabled; all three private tables have RLS and deny
authenticated SELECT/INSERT/UPDATE/DELETE. The setting is three dealer-games;
the end fallback is removed and transfer eligibility is installed. The 357 owner
hash is unchanged. No historical tenure was fabricated (zero seeded tenures).
Pre/post-install counts are identical: players 1,136; results 33,708; transfer
batches 30,881; account entries 494. No production gameplay or financial test
mutation was performed. Exact commit/deployment receipt is recorded in the local
`release-host-succession-20261103` and matching `-verified` tags.

## Remaining owner smoke

Use a fresh table with three humans and a bot. Brief host disconnect/reconnect
must not churn hosting. Explicit host departure selects the eligible human with
the longest continuous tenure and announces once at a safe moment. A departed
and reseated human has a new tenure; bots never host. The successor can pause/end;
the former host cannot. A seated sitting-out host retains hosting until removal.
After three fully missed consecutive dealer-games, the seat releases at settled
continuation; host/dealer succession stays valid and chips/results remain intact.

Hosted multi-client Auth/Realtime and physical-device smoke have not been run.
The user explicitly chose release with that remaining acceptance checklist.
Restoration remains a forward code migration using captured preimages, with
sessions drained; retain receipts and financial history rather than undoing money.
