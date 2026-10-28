# Canasta Beginner/Expert local checkpoint — October 22, 2026

Local candidate only. Golf owns the production lane. No push, migration,
deployment, activation, owner production smoke, or live-session mutation was
performed for this follow-up. The existing installed package and failed hosted
fixture remain intact. This checkpoint is not publish-ready.

## Connected terminal diagnosis

`ChipTransportProvider` omitted Canasta from durable presentation-cursor
registration. Consequently the real ledger did not persist the cursor state,
while `CanastaTable` required that state to become settled/reconciled before
emitting its terminal completion token. A positive settlement cursor could
remain unknown indefinitely despite completed database settlement.

The local correction registers Canasta with that existing shared owner and
retires its settlement artifact when the canonical ended phase is admitted.
`CanastaLedgerTerminal.test.tsx` uses the real provider/ledger and proves one
completion callback; the earlier test's mocked settled cursor hid this boundary.
This is source/test proof, not a claim that the hosted browser gate now passes.

Preserved evidence: session `07f06622-4b34-40e6-98ae-f95792fc9046`, match
`9c16bffb-f635-47d6-84db-dfdd8f9bb9ec`, result
`3ab817ca-5c8e-4702-a39d-6f52d0871b33`, transfer batch
`479fdf97-0307-43ad-927e-76c6d65e7982`, cursor 2. See the unchanged historical
record in `CANASTA_HOSTED_QUALIFICATION.md`.

## Local behavior

- Existing typed Game Defaults selects Beginner (180 seconds) or Expert
  (configured standard timer, 30–300 seconds, initially 120). Mode and budget
  freeze in the admitted match; actions and helper changes never reset time.
  Older admissions without the new snapshot retain 120 seconds.
- Run Back carries the prior dealer-game identity so the server can reuse its
  frozen pacing and stake while performing fresh roster/admission/ante consent.
  It does not trust client-submitted timing values.
- Personal helper visibility is a separate profile preference, initially on.
  An Expert match does not overwrite that preference. Helpers derive opening,
  pickup, meld and going-out feedback from the existing versioned rule base.
- Instructions and selection feedback remain above the paged physical-card
  controls. Duplicate identity, local draft cancellation, committed server
  actions, and reconnect boundaries are retained.
- Public discard projection contains the top card, count, freeze status and
  visible wild freeze marker. Buried card faces are omitted. Canonical transport
  supports an optional stack count for a single whole-pile transfer.
- Per the follow-up inactivity clarification, an admitted fake-money match
  continues through canonical automatic play even if every human is away.
  Eligibility is evaluated between matches. Real-money inactivity pause,
  reclaim and queued sit-out controls remain. Real-money admission stays denied.
  This supersedes the earlier fake-money all-human pause restriction; the
  120-second budget of older matches is preserved.

Rules remain `canasta-classic-two/1`, including signed scoring and fixed +S/−S
canonical match settlement. There is no alternate client rules engine.

## Owners and checks

Shared changes are bounded to Canasta registration in `ChipTransportProvider`,
optional stack-count transport metadata/rendering, typed defaults/profile
fields, and the existing exact Run Back resolver. Nonstack transports keep
their existing behavior. The local SQL candidate replaces only Canasta
configure/begin/commit/pause functions and adds two typed settings fields;
the installed financial settlement body is retained.

The combined focused run passed 88 tests, followed by targeted defaults,
full absent-human match, and Run Back/setup checks. Coverage includes the real
chip ledger, physical-card transport, Holm manifests, profile preference,
Canasta rule/recovery boundaries and shared configuration behavior. App/server
TypeScript, production build and native Node entry proof pass. These results
do not substitute for the complete release CI or database financial gate.

`dev/canasta/beginner-browser.mjs` passes 12 rendered combinations: 15, 30, 60
and maximum 71 cards at 320×568, 430×932 and 812×375. It verifies physical IDs,
at least 44px card targets, paging, one canonical shell, a real-reducer
draw/discard/reconnect, frozen 180-second timing and helper toggling without
deadline changes. Narrow portrait and landscape screenshots were inspected.
This is desktop mobile emulation, not owner/device smoke.

Review surfaces while the isolated server is running:

- `http://127.0.0.1:4328/authority.html?viewer=2` — actual reducer transport.
- `http://127.0.0.1:4328/?scene=maximum` — 71-card interaction fixture.

Local ignored evidence: `qualification.local/canasta/beginner/browser.json`,
`max-320.png`, `max-430.png`, `max-812.png` and `beginner-committed.png`.
The isolated preview blocks production database access.

## Remaining qualification and release gates

1. Restore availability of the existing isolated Docker database without
   interfering with Golf. Its inspect call returned HTTP 500 from
   `dockerDesktopLinuxEngine`; no local SQL proof could run. The new
   `beginner.candidate.sql`, `beginner.proof.sql` and `beginner-proof.mjs` are
   unexecuted candidates, not installed migrations or passing database evidence.
2. Prove actual configure/ante freezing, exact Run Back source identity,
   settings/profile authorization, immutable pacing, all-away recovery and
   pause/reclaim against SQL. Extend the rollback proof for the new Run Back
   branch and actual admission path; the current added proof covers defaults,
   state fencing, recovery flags and profile isolation only.
3. Run the mandatory canonical settlement/rollback/replay/concurrency gates
   against the combined candidate, then qualify the installed revision only
   after an explicit production-lane handoff. Preserve the earlier package's
   hashes and evidence; generate new worker/provenance artifacts separately.
4. Recheck whole-stack pickup animation including terminal pickup, connected
   terminal hold → Session Ended, and fresh ended-session reconnect → lobby
   through the real hosted transport. No old mocked terminal success waives it.
5. Complete required CI and reconcile current main/Golf without losing its
   published work. No push or production action before the explicit handoff.
   Only after all gates pass may the approved all-user, nonexpiring play-money
   admission open; real money remains server-denied.
