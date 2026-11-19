# Async availability and historical timeout restoration — November 18, 2026

Jeremy approved 72-hour availability, Last Call at 48 hours, Words timeout passes,
zero-score unstarted Quintzee rounds, restoration of the five identified old
36-hour forfeits, fresh timers, settlement reversals and renewed-turn pushes.

## Authority and preservation

The old `private.delayed_expire` availability branch recorded an immediate
`timeout_forfeit`; Words' separate entered-turn clock already passed correctly.
The shared child-row trigger now normalizes current availability to 48/72 hours.
Existing active turns are extended from their original availability time;
restored incident turns receive a new full window. Entered gameplay clocks,
frozen scoring/dealing configurations and all other games' timeout outcomes are
preserved. Words retains ordinary four-pass completion. Quintzee uses the shared
rule core to produce an empty zero-score attempt and normal participant/round
continuation; an already-entered round retains its gameplay deadline.

The existing correction generation, account reversal and canonical chip-transfer
owners are reused. An immutable per-child audit extends the prior single-child
correction to several children in one parent. Original outcomes, financial
receipts and completed siblings remain retained. Current readers exclude the
superseded timeout results; future completion settles once into the correction's
new financial generation. No winning result is invented by the actual repair.

Exact target children: Words `38318206-7bd4-497d-8744-44af80c17a00` and
`a8d4272a-0b66-4f22-b712-cbad9aa89aa5`; Quintzee
`181f8754-2425-4802-b918-ca9c599b41a5` and
`f749e475-e29d-48e1-be9f-10499d51caf3`; Chess
`8664c23c-2f3f-4d13-9415-46a431e964be`. These span three matches and two existing
settlements. The affected turn owner is TheOG. Older synthetic Chess cases and
ordinary completed games are excluded by exact identity and retained evidence.

## Database and worker qualification

Installed migration: `20261119011153_async_72_hour_availability_and_timeout_recovery.sql`.
Candidate and installed rollback proofs pass: exact-five restoration, intact
siblings/boards/moves, authorization, stale expiry, replay, injected failure
after financial writes, reversal atomicity, future corrected settlement,
Words/Quintzee continuation, winner/tie, real/fake money, canonical chips,
balanced account postings, final snapshots and terminal replay.
Proof: `supabase/delayed/timeout72-proof.sql`.
The incident repair is pinned by parent/child revision and outcome hash in
`supabase/delayed/timeout72-incident.sql`; request IDs make retries harmless.

`delayed-recovery` version 5 is ACTIVE with unchanged dispatcher-token
authentication. Its bundle passes local startup and unauthenticated rejection;
source SHA-256: `85b090012d091613e4c6c1cf01314952be7dabbdf6720e6239b4ba77a6fa480b`.
Adapter/service changes use the entered Quintzee deadline in both API and worker.

TypeScript and the three new recovery tests pass. All 53 Async sibling-shell
tests pass after updating the intentional timer copy. The broader server test
run exposes two pre-existing `triStep.test.ts` assertions expecting the retired
`delayed_tri_step` name; HEAD already calls `delayed_tri_bonus_step`. These are
outside this correction and were not changed. Full release checks are recorded
under ignored `qualification.local/async-timeout72/` by
`node dev/async-timeout72/qualify.mjs`.

## Owner smoke

Actual repair committed at 2026-11-19 01:15:31 UTC: five active restored children,
three active parents, four account reversal entries for the two prior
settlements, and three renewed-turn pushes queued to one enabled device.
Two concurrent identical repair calls returned `restored` / `already_restored`,
with exactly five child audits, three parent corrections and three alerts.
Fresh expiry is November 21, 7:15 PM Central; Last Call is November 20, 7:15 PM.
The release qualification passes TypeScript, all 4,342 app / 241 harness / 46
tooling tests, Vite and the original 90 MB limit: 89,704,807 bytes.
The focused adapter/recovery run passes all 12 tests.

Open the three restored matches, confirm existing scores/boards, availability
at 72 hours with Last Call at 48 hours, and normal turn entry/continuation.
Confirm the renewed-turn phone alert opens the correct match. Local validation
and database proofs do not substitute for Jeremy's production smoke.
