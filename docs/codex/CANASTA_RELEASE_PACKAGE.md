# Canasta local admission correction and release package

October 21, 2026. Authorized scope: implement/test fake-money-only admission,
preserve closed defaults, prepare hosted qualification. No main merge, push,
production SQL, deployment or activation. Candidate parent:
`367310e6a8d7e06698a148373c69d7de231a60ad`.

The subsequent authorized local reconciliation starts from `6e439fd40` and
integrates main `6b15f4eb0` into the isolated candidate only. See
`CANASTA_RECONCILIATION.md` for 300 tests, browser and combined SQL evidence.

The exact procedures, artifacts, tester matrix and rollback policy are in
[`supabase/canasta/release/README.md`](../../supabase/canasta/release/README.md).
[`manifest.json`](../../supabase/canasta/release/manifest.json) records ordered
source hashes, bundled worker identity and unregistered migration status.

The configure RPC now rejects any locked session whose real_money is not false,
before setup receipts or mutations. The internal begin owner independently rejects
real money before recovery/consent processing. Session capabilities return disabled
for real money. The gate remains closed by default, and committed fake setup retries
survive gate closure. Run Back shares configuration authority; no second admission
path is added. No gameplay engine, client, settlement or existing-game code changed.

Local SQL evidence covers positive fake setup; both closed modes; authenticated
direct and forged-mode attempts; unchanged rows/financial state on rejection;
private begin denial; genuine setup followed by a session money-mode change;
canonical consent, final revision RLS and controls. Existing independent races,
injected post-transfer rollback and worker restart passed again. Exact generated
candidate and installed proof bodies pass in the network-disabled PostgreSQL clone.
The installed proof requires genuine health when eventually run hosted; only the
local harness substitutes a heartbeat. No hosted evidence is inferred.

The package deliberately remains outside migration registration. Local
reconciliation now includes main `6b15f4eb060df319df13d576948c343920a23b21` and
its Race/11 Up/Battle31 integrations. The shared catalog and terminal branches
retain all released games. The combined local proof compares 305 prior functions
and changes only the Ante Up dispatcher through its guarded Canasta insertion.
Other releases may advance the baseline; Golf retains the next production slot.
A hash mismatch must stop the insertion. Do not deploy the captured reference
dispatcher or local snapshot repairs from qualification.

Remaining decisions/evidence: authorize a hosted qualification/release pass;
identify two human testers, canonical bot and negative-test identities with exact
fake-money session scope; authorize hosted synthetic rollback and isolated session
provisioning; collect authenticated end-to-end, real Realtime/cron/Edge, terminal/
Run Back and native iPhone evidence. Opening general fake-money admission is a
later decision. Real-money admission is prohibited in this initial scope.
