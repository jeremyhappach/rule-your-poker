# Async Words — single-child fake-money release

Owner approved production under the current narrow scope on 2026-10-27.
Base: `b0b2288e4846a0f513b3278ebdd4cbe16bede4cc`.
Migration `20261028012319_async_words_single_child_fake_money.sql` is installed;
candidate and installed hosted rollback proofs passed. Do not install it again.
Admission and recovery were installed disabled. Publication and activation must
follow the exact-SHA release agreement below. Owner production smoke remains due.

## Scope and financial contract

Exactly two human accounts, one Words child, fake money only. The server rejects
real money, other games and additional children. Invitations expire after 72h.
Acceptance freezes the stake, shared rules and standard opening tile draw and
starts the first 36h turn; Last Call begins after 24h. No live timer, time banks,
autoplay or player pause/request actions are available in this mode.

Acceptance and interim play have no financial effects. Immutable child outcomes
record normal completion, tie or timeout forfeiture and both signed deltas.
Parent home derives its provisional net from those records. A parent lock and
unique settlement receipt protect one transaction containing the final outcome,
canonical transfer, result, post-settlement snapshots and terminal closure.
Net zero receives a receipt with no transfer. No wallet, reservation, available-
balance gate or child payout exists. Existing live negative-balance/account
behavior is unchanged; this release does not activate real-money async play.

`public.finalize_gameplay_transfer_batch`, `public.record_session_results` and
`public.settle_gameplay_chip_transfers` remain byte-for-byte unchanged. The
parent creates a nonjoinable canonical accounting session only at settlement;
fake-money canonical chip deltas and balanced ledger entries are proven, with
zero real-account transaction writes. The helper alone is not a dedupe boundary:
all terminal writers take incident gate → parent → child locks, then consult the
unique receipt. Recovery uses the same owner. A stale job must match both child
segment and expected deadline. Competing final moves/expiry settle once.

## Owners and preservation

- `supabase/delayed/`: frozen terms, private state/results/receipts, participant
  projections, notification rows, shared Words adapter, recovery and incident
  procedures. Browser roles cannot write private tables or choose outcomes.
- Shared Words `rules_for`, `deal` and `reduce` add frozen `/3` orchestration
  timing. Current live `rules()` stays `/2`; /1 and /2 remain supported unchanged.
  Dictionary, scoring, blanks, exchange, passes, endgame and opening draw are
  shared, not forked. Async completion never invokes live Words settlement.
- `src/pages/Delayed.tsx`, `components/delayed/`: setup, acceptance, parent home,
  shared Words presentation and persistent account notification provider.
- `src/lib/delayed/drafts.ts`: device-local private drafts keyed by viewer,
  child, turn, board and rack. Restore validates current authority; no draft
  auto-submit. Explicitly sent requests retain their UUID for uncertain retries.
- The earlier Run21/TriTowers prototype is preserved in the separate
  `delayed-head-to-head` worktree and is not part of this release.

Ordinary live Words, Golf and Quintzee admission/settlement owners are unchanged.
The accounting session is excluded from the ordinary lobby before its row limit.
One per-user/per-match notification obligation persists; reading it does not
dismiss an outstanding turn. Realtime carries invalidation signals, not racks.

## Qualification

- Local authoritative DB proof: 15 units, actual roles, canonical chips and
  balanced ledger, injected failure rollback, normal/tie/forfeit, duplicate and
  late requests, private views, zero-client recovery and incident clock shifts.
- Independent database connections: duplicate final commands, final move versus
  expiry, acceptance versus invitation expiry, obsolete deadline jobs and Last
  Call obligation persistence. Final rerun passed.
- Full shared Words core proof for live /2 and async /3; exact old/new reducer
  comparisons for live /1 and /2 pass, timeout and /2 time banks passed.
- Hosted candidate and installed BEGIN/ROLLBACK proofs passed through actual
  canonical financial triggers. Synthetic identities/results are rolled back.
- All 441 source files / 3,068 assertions passed. The aggregate run reported one
  Node WebSocket/Event environment exception during unchanged Cribbage tests;
  the isolated Cribbage plus draft rerun passed all six assertions without it.
  Harness/focused run: 15 files / 268 assertions. Typecheck and final production
  build passed (existing bundle-size warnings only).
- Two-browser local actual-route/RPC bridge: invite/accept, private board/rack,
  offline draft/reload without submit, pass/handoff/home, no banks/pause,
  390×844 and 1440×900 layouts passed. This bridge uses real local database roles;
  it is not evidence of hosted Auth transport or physical-device owner smoke.

Reproducible runners are in `dev/async-words/`; compact result receipts are in
`dev/async-words/evidence/`. Full logs, screenshots and disposable local identities
stay under ignored `qualification.local/async-words/`.

## Publication, recovery and risk

Publish only this qualified candidate. Require Vercel production READY, deployed
build manifest, successful release publisher and persisted release signal to
agree on the exact commit before opening admission. Enable the private recovery
heartbeat and a once-per-minute pg_cron job invoking
`private.delayed_words_recover()` together with admission. Verify its first run.

A heartbeat gap over two minutes holds adjudication with an audited incident;
it never silently forfeits across an outage. Operations must investigate and
close the incident through the private procedure, which shifts the frozen turn
clocks by the measured hold. This is not a player pause. Monitor overdue turns,
open incidents and settlement errors. Never delete receipts or replay transfers
to repair a UI symptom. Disable new admission for rollback while preserving
active match recovery and immutable history.

Debt exposure remains the existing account-model concern for any future real-
money phase. Such a phase requires separate qualification; do not add funding,
reservations or balance gates as an incidental remedy. Multi-child and other
game releases also require their own acceptance and concurrency proof.

Owner smoke: create an Async Words invitation from lobby with another human,
accept, play and reconnect on both devices, verify persistent notification and
saved private draft, then confirm final result/receipt and ordinary live games.
