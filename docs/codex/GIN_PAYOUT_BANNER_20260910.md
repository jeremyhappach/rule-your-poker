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
fresh successor hands and both players' legal turns. Production browser
qualification is pending at this publication checkpoint.
