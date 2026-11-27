# Async result and bonus handoffs — November 27, 2026

Jeremy approved all three corrections, including the database correction and the
narrow OG receipt repair. Checkpoint: `async-flow-repair-20261127`.
Production owner smoke remains pending.

## Causes and corrections

- `ChildResults` acknowledged the final outcome and fetched fresh match state,
  then ignored that response and always returned home. It now uses the existing
  server-qualified `mayViewFinale` gate to continue directly to the match finale.
  Pending reviews or settlement still return home. Failed ACK/refresh cannot
  admit the finale.
- `DelayedTurn` latched the segment that rendered round two. A server-owned
  pending bonus belongs to a new segment, even when the same player owns it.
  After the existing result presentation/hold, the presentation identity now
  admits that exact pending bonus on the same route. Play preserves the existing
  Start/gameplay owner. Skip has no bonus attempt and routes its authoritative
  terminal result through the ordinary game-result owner.
- The November 24 per-child undo projection did not include the November 18
  multi-child availability restoration or legacy match-scoped outcome writes.
  The shared effective-correction view now includes direct corrections and
  restoration membership. Current outcomes retain each child's current
  correction generation, plus valid legacy untouched siblings, exactly once.
  The existing outcome writer and review trigger use the same identity.

The shared result owner applies to all eleven Async games. The bonus handoff
applies only to an existing server-qualified decision in TriTowers, Quintzee
or Boxdrop; eligibility, money mode, scores, rules, clocks and stakes are unchanged.
Presentation does not award a win, settle or acknowledge an unseen result.

## Preserved OG incident

Parent `678aebe0-29ff-4a0e-a4f1-0282ea622afc` is Hap–TheOG.
Quintzee children 1 and 3 were unavailable:

| Child | Hap | TheOG | Existing authoritative outcome |
| --- | ---: | ---: | --- |
| `77940b7a-972c-4d1b-9dfc-b5dbec846817` | 61,192 | 95,552 | TheOG, $5 |
| `f749e475-e29d-48e1-be9f-10499d51caf3` | 57,767 | 61,755 | TheOG, $5 |

Their stored state, terminal revision, segment and winner agree with the immutable
reopened outcomes. The third game's old timeout receipt occupied its unversioned
final key. A preimage-guarded, idempotent repair adds its corrected final receipt
from the saved outcome using the restoration identity. It never copies the old
timeout ACK or invents a viewed receipt.

The installed participant read reports three completed Quintzee games and
provisional Hap net -$15. Games 1 and 2 retain their existing acknowledgements;
game 3 has one unseen final result. Words remains active at Hap 90 / TheOG 71.
No gameplay/parent row, original outcome, balance or historical ACK was changed,
and the repair performs no settlement.

## Qualification

Migration `20261127184114_async_restored_outcomes_and_final_review_receipt` is
installed in `xvhmbuppghwmwpwrkzao`. Candidate/idempotence and installed rollback
proofs pass. Reproduce using `node dev/async-flow/proof.mjs` (or `--installed`)
and execute the generated SQL under `qualification.local/async-flow/`.

The proof covers the exact incident for both participants, multi-child restoration
through its actual admin owner, legacy untouched sibling outcomes, independent
later child undo, winners/ties in both money modes, canonical chip changes,
balanced account/transfer records, snapshots and terminal state, repeated/late
outcome replay, outsider denial, final-ACK/finale gating, and both viewers'
independent acknowledgements. It also runs all 12 optional-bonus cases and the
existing 16-case admin-undo financial suite, including 24 real Words
move/timeout restores and injected rollback after financial writes. All fixtures
roll back. No new independent-connection race test was run.

All 132 focused component tests pass, including opponent-round-two-first,
Skip/Play, pending-choice reconnect, lost Skip reply reuse, opponent-owned
decisions, all three bonus games, final ACK, another-tab completion and failed
refresh. Full `npm run build` passes TypeScript, 4,446 application tests,
241 harness tests, release tooling, Vite and the unchanged 90 MB cap.

`node dev/async-flow/browser.mjs` passes four scenarios through real routed
components and the production auth guard with isolated bearer-authenticated
HTTP fixtures: round-two-first bonus → Skip → game result → final ACK → match
finale; Play and reload; incomplete parent; failed ACK and retry.
Phone/desktop screenshots were inspected. These are HTTP fixture tests, not
hosted player sessions; database authority is independently proved above.
Local logs/screenshots are ignored under `qualification.local/async-flow/`.

## Owner smoke

1. Open the affected OG match; game 1 shows its saved result and game 3 offers
   View Result, then shows the saved loss. Words and its turn remain active.
2. Finish round two after the opponent when only you qualify. After your score
   presentation, the bonus choice appears without Match Home/Take Turn.
3. Skip: observe game-over, then match-over if settlement and your final result
   acknowledgements are complete. Play: retain normal bonus Start and gameplay.
4. Review the final outstanding game in another completed match; enter the
   match finale directly. A pending game/result still prevents early match end.
