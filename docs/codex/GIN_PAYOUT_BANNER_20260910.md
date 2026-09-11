# Gin payout banner correction — September 10, 2026

Jeremy approved correcting the reproduced +10 banner for a 96–0 match that
settled for 106 ($10 stake plus $1 per point). Both source failures remain
preserved in GIN_PRESENTATION_20260910.md and its artifact directory.

`GinRummyGameTable.tsx` already awaits the identity-only settlement request
before emitting the winner announcement. It now retains that response's
`payoutAmount` for the canonical match-win payload and matching presentation
metadata. The deployed public settlement wrapper and its legacy implementation
were inspected: both `settled` and `already_settled` responses supply the same
authoritative payout amount. No client payout calculation or extra request is
introduced.

Preserved: settlement and replay ownership, game rules, balances, transfer
batches, announcement identities, the hand-result dismissal gate, animation
timing, independent client completion, and normal Run Back/End Session paths.
This is a display correction; it does not change financial settlement or the
database schema.

App typecheck, 1,564 app tests, 140 harness tests and production build pass. Evidence
and the unchanged strict live scenario
`gin-presentation-win-run-back` are recorded under
`artifacts/gin-banner-fix-20260910/`. Live acceptance requires both banners to
show 106, each full payout to finish before setup, exact saved configuration,
fresh successor hands and both players' legal turns.

Production qualification passed on build
`63786ce94ed42e6190351a921b3fe59ebfdef4cc` (Vercel
`dpl_CAqFdNRyfVfJoVVVEM7qz3UhGGhF`, READY, manifest verified).
Session `5ea61b21-3f21-40a3-b1cd-45d325bad298` completed in 53.4 seconds
with zero retries. Both banners displayed `Hap wins96 — 0 · +106` and
matched the authoritative 106 result. Host and peer payout flights lasted
2,410 ms and 2,423 ms; setup appeared 2,503 ms and 2,002 ms later respectively.
Run Back retained all five saved settings: stake 10, target 50, per-point 1,
Gin bonus 25 and undercut bonus 25. The fresh successor had zero scores,
fresh hands and both players completed legal turns.

The continuous observer recorded 12 action receipts with zero violations,
zero progress problems and a maximum peer delay of 1,106 ms against the
unchanged 6,000 ms budget. Both final browser screenshots were inspected.
Teardown and an independent database query confirmed zero session, player,
round, dealer-game, result, transfer-batch and snapshot rows. The exact
consumed/cancelled fixture request was also removed; proof is retained in
`artifacts/gin-banner-fix-20260910/independent-cleanup.json`.

This accepts the automated healthy Gin ending and Run Back case. It does
not convert the earlier failed runs into passes or claim fault/reconnect
coverage or Jeremy's own production smoke.
