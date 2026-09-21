# Wave 2 live qualification — blocked at terminal Bank

Started from published client-routing SHA
`fc430c6bf78345c0183f18f645ce12c5b601131d` on `codex/farkle-playable`.
The production migration `20260921155336_farkle_wave2_postgame` and all earlier
authority SQL remain unchanged. No main integration or production mutation.

## Isolated environment and source changes

Dedicated Supabase stack `farkle-wave2-local`, API port 57321 and PostgreSQL port
57322. Existing stacks were untouched. Captured public/private schema through the
authorized CLI without copying production players, sessions, or Auth users.
All 383 function definitions, owners, security attributes, and grants match the
production capture before and after the local authority proofs.

The plain schema dump restored foreign keys in a different creation order.
That initially made fixture cascade deletion fail. Restoring the original
production constraint creation order locally, using unchanged definitions,
resolved the environment discrepancy. No constraint was relaxed or disabled.
The existing 158 assertions and included candidate/restored seven-game proofs
then passed. This is a transactional proof, not proof of a successful terminal
transaction commit (see the defect below).

Admin setup now has an explicitly opted-in local development path. It requires
both browser and API loopback hosts, a development build, and an admin; the form
remains Stake + Target Score + Endgame. The request uses labeled TEST ONLY rules
through the unchanged `configure_dealer_game` owner. Normal production builds
retain the disabled Coming Soon button. Backend release/identity/config guards
remain authoritative. The generic setup transport accepts the Farkle discriminator;
the existing seven-game liveness registry and other games' behavior are unchanged.

## Browser results

A fresh core scenario passed in 30.0 seconds with desktop and mobile peers:
actual login/session creation/dealer draw, admin setup, ante, canonical lower-seat
first actor, Roll, local select/deselect, Hold, Bank, banked score and completed
turn count, frozen help, and refresh before first roll, Awaiting Hold, and after
committed Hold/Bank-or-Roll. Refresh preserved the complete authoritative state.

The first bootstrap attempt lacked a local scheduler. The next attempt passed
the playable assertions but used the generic admin Blast RPC for cleanup; Farkle's
guard correctly rejected it. The final passing scenario uses the existing scoped
private `cleanup` claim solely from the isolated test host. Neither failed attempt
is counted as passing. The local scheduler invokes the existing canonical timer
owner; no client timer or alternate gameplay progression was introduced.

The terminal campaign stopped at its first failed case, Immediate. Equal Turns
and One Last Turn did not run. Hot Dice, Farkle, Roll N, remaining refresh stages,
tiebreak, takeover/reclaim, real-money pause, terminal/setup timeout browser proof,
and the complete seven-game browser campaign remain unqualified.

## Concrete terminal defect

Actual client Roll and Hold committed sequences 1 and 2. Bank with THIS TURN 50
against target 50 failed and left sequence 2 intact. PostgreSQL reported:

```
farkle:authority_claim_required
private.farkle_require_claim_v1 -> private.farkle_guard_shared_v1
UPDATE public.games SET chip_transfer_cursor = chip_transfer_cursor + 1
public.finalize_gameplay_transfer_batch(), line 119
```

`gameplay_transfer_pending_finalize` is DEFERRABLE INITIALLY DEFERRED. Farkle's
action/settlement owners restore the prior authority claim before returning.
At transaction completion the shared transfer finalizer attempts its cursor write
after that claim is gone, so the guard rejects it and the entire Bank rolls back.
Production has the same deferred trigger and identical finalizer definition
(MD5 `5459fd01314cee7fe3fff421ce5e11b4`). This is a real authority integration defect,
not a browser assertion, random-roll outcome, or a demonstrated Wave 2 postgame
owner defect. No production gameplay repro or mutation was performed.

The rollback proofs assert settlement before transaction end and clean up or roll
back their fixtures. They do not force the deferred transfer finalizer at the
real commit boundary. Their 158 passes therefore missed this failure. The new
browser case remains failed; it is not waived.

Smallest candidate to investigate in the next bounded phase: a new additive
Farkle-only authority correction that completes the named deferred transfer work
while the exact Farkle action claim remains valid, before restoring prior context.
Prove real transaction completion, one batch/settlement, duplicate/late receipt
replay, context restoration, generic mutation negatives, and multi-game isolation.
Do not edit applied migration history, leave a broad claim active until commit,
or grant the generic shared finalizer unrestricted Farkle authority. Whether a
safe isolated drain suffices is not yet proved. Stop before any material shared
owner extension if it does not.

## Evidence and release boundary

The final local `npm run build` passed typecheck, all 1,657 application tests
(247 files), all 226 harness tests (11 files), and Vite build (33.30 seconds).
This does not override the failed terminal browser case. Source/log hashes and
the explicit incomplete-gate status are in the evidence manifest.

Evidence: `supabase/farkle/wave2-live/20260921/` contains the failing authoritative
states, screenshot, exact database stack, production metadata/release verification,
and cleanup inventory. Operational scripts and credentials remain ignored under
`runtime-farkle.local/`; they are excluded from commits. The dev server and local
scheduler were stopped. All six synthetic Auth/profile identities, gameplay,
creation receipts, voice presence, and test telemetry were cleaned. Only the
three local release/timer control rows and seven copied existing-game defaults
remain populated. Farkle defaults rows remain zero.

Production remains creation-disabled, admin-only, defaults unapproved, with zero
Farkle defaults rows. Wave 2 is not qualified and must not merge to main. Existing
Horses/SCC product code and geometry, all applied SQL, and shared owners are unchanged.
