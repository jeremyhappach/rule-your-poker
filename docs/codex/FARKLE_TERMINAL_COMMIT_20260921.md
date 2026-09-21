# Farkle terminal COMMIT correction — September 21

Implementation: `9d0bad4d3402ed75b42531c89e8959a567287f3d`.
Applied production migration: `20260921172016_farkle_terminal_transfer_handoff`.
Published client/authority evidence SHA used for resumed browser checks:
`4d01916afdf7365e06b55e268de16634c88dba87` on `codex/farkle-playable`.

The deferred chip-transfer finalizer ran after the public Farkle action restored
its authority claim. Its cursor update therefore rolled back terminal Bank.
The new private single-use handoff binds the exact settlement transaction,
game/dealer/round/result, terminal event/receipt and opening/closing balances.
Only the finalizer's Farkle cursor-write branch acquires the existing claim;
it restores the previous context immediately afterward. The guards, public action
RPC, existing-game calculations and historical migration files are unchanged.

## Completed correction gates

- Authenticated target-reaching Bank really commits for both ordinary game-over
  and pending-session-end; separate PostgreSQL sessions verify banked score,
  completed round, terminal state, exactly one result/batch, exact balances,
  snapshots/history and receipt. Identical request replay and stale deferred
  callbacks cause no additional settlement. Direct/generic authority negatives
  and claim isolation pass.
- Two candidate/recovery/candidate executions restore exact captured definitions,
  owners, security attributes and grants. All 158 Wave 1/Wave 2 assertions and
  existing seven-game SQL regression proofs pass under candidate and recovery.
- Production pre-apply and post-apply rollback proofs, restoration checks and
  deployed metadata are green. No production Farkle fixture survives.
- Full application and harness suites, typecheck and build pass. The original
  validation comprises 1,657 application tests and 226 harness tests; the evidence
  includes the later validation at the resumed browser SHA.
- Four focused browser cases pass at the resumed SHA: actual admin setup, ante,
  local selection/Hold/Bank and refresh; Immediate; Equal Turns; One Last Turn.
  All terminal cases settle and continue into canonical next setup, then refresh
  without changing the terminal round or balances. Equal Turns additionally
  exercised Tiebreak Turn 1 and refresh in this run (recorded, not inferred).
- Local users/profiles, gameplay, transfer tickets/batches, creation receipts and
  telemetry are cleaned. All 384 public/private functions match the expected
  applied production definitions and metadata. Local services are stopped.

## Release boundary and next phase

Wave 2 is **not qualified** and has not merged to main. The focused four cases
are not a substitute for the complete Wave 2 browser matrix or the seven-game
browser regression campaign. Remaining explicit coverage includes partial
holds/Roll N, Hot Dice/Farkle presentation and refresh, timeout takeover/reclaim
and real-money pause, setup timeout through the client, complete frozen-rules
history/replay and remaining shared-surface/geometry/admission checks. Retain
the requirement for one final qualified SHA and a coherent full gate.

Production creation remains disabled, admin-only enabled, production defaults
unapproved and unseeded. No Horses/SCC product or geometry change was made.
The only shared function addition is the narrow Farkle cursor-write handoff.

Evidence and executable recovery:
`supabase/farkle/commit-boundary/`. The earlier failed browser evidence remains
unchanged in `supabase/farkle/wave2-live/20260921/` as historical reproduction.
