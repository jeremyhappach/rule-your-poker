# TriTowers stage results and presentation — 2026-10-15

Approved scope: turn clarity, automatic stage result/count-up, removal of surface
helper text, visible stock count, and authoritative Take Score. Financial and
admission routines are unchanged. Fake-money-only approved-account access remains.

Applied migration: `20261016011439_tri_towers_stage_results`. The service-assigned
version replaces the candidate filename; SQL content is identical to qualification.
Production verification preserves match/history/request/result/snapshot hashes,
catalog, release eligibility and every unrelated routine. Existing public RPC
grants remain; the new private helper is inaccessible to authenticated callers.
Release checkpoint: `tri-towers-stage-polish-2026-10-15`.

## Ownership and compatibility

The SQL reducer owns stage completion, result identity and the five-second hold.
The existing recovery job advances an expired hold with no connected browser.
Intermediate stages start playing immediately; the next human receives the
existing 30-second Ready window only after the prior terminal result completes.
Final standard and bonus stages no longer bypass presentation. Give Up and a
playing timeout end the entire remaining run after presenting earned points;
an initial Ready timeout retains its existing abandonment behavior.

Take Score is an authenticated action under the existing dealer/revision/request
UUID and actor checks. It records current cumulative points; it does not add them
again or award time/peak/card points. Normal two-stage/80,000 bonus eligibility
applies. The last-card clear is the only path awarding a clear time bonus.

Each new result persists dealer/round/player/stage identity, reason, previous
cumulative score, increment, resulting total, time bonus, completion time and
turn disposition in existing match/history JSON. No new table or backfill is
needed. Old Ready/playing/result snapshots remain valid; original deadlines and
historical records survive installation unchanged. Legacy Continue cannot skip
the hold; other playing actions during the hold are rejected.

`stagePresentation.ts` derives the count from the authoritative window and the
synchronized server clock. Both roles use the same projection. Repeated snapshots
retain the result node; remounts resume elapsed progress. Reduced motion shows the
final count with a static clear treatment. The animation performs no RPC or score
write. Pause freezes the display at the server's pause timestamp.

## Qualification gate: PASS

- Migration compatibility: old matches/history/requests/results/snapshots/batches
  unchanged; unrelated routines unchanged; existing shared triggers retained.
- Twenty-two unchanged TriTowers/financial function bodies match production
  exactly, including settlement, continuation, admission and canonical transfers.
- SQL engine and adapter rollback proofs pass. Actual financial-trigger rollback
  covers winners, partial/all ties, duplicate/late settlement, balanced transfers,
  snapshots, authorization, invalid stakes, injected snapshot failure and terminal
  Session Ended. No production financial fixture was created.
- Independent-connection integration covers all nine prior-game handoffs,
  seven-player admission, revoked accounts, redaction, replay/stale/concurrent
  actions, pause, independent decks, whole competitions, ties, dealer policy and
  zero-client races.
- Two independent Edge browser contexts exercise the production hook/view with
  authenticated SQL RPCs: stock 23/10/1/0, active/watcher controls, live draw,
  count-up, duplicate snapshots, reload during hold, final-card clear/time bonus,
  automatic bonus stage, final hold, next-human Ready, one canonical settlement
  and idempotent continuation to game selection.
- With both browsers closed, the actual recovery SQL completes full holds,
  starts the next stage, processes timeout/handoff and settles once. The loopback
  harness schedules recovery calls and substitutes commit notifications/SSE for
  Supabase Realtime; the unchanged production pg_cron job is verified separately.
- Responsive play and result checks cover 320×568, 390×844, 844×390, 768×1024,
  1024×768 and 1440×900 as applicable, plus rotation and reduced motion.
- Full regression, typecheck and production build pass. Existing build warnings
  concern Browserslist age, mixed imports and bundle size.

Evidence: `dev/tri-towers/stage-polish.evidence.json`. Commands:
`stage-polish.proof.mjs`, `local-proofs.mjs`, `financial-polish.rollback.mjs`,
`local-integration.mjs` (TRI_TEST_DATABASE set to the isolated clone),
`stage-polish.browser.mjs`, `fullscreen.preview.mjs`, `stage-polish.layout.mjs`,
and `npm run build`. Scripts are under `dev/tri-towers/`; loopback evidence and
screenshots are under ignored `qualification.local/tri-towers/`.

Owner acceptance remains pending: refresh both devices, use approved accounts in
a fake-money session, compare active/watching treatment, Take Score after partial
play, clear all three towers, watch each five-second result and automatic next
stage, reload during a result, finish the competition, Continue, then Run Back.
Check phone portrait/landscape and confirm final scores, stakes and dealer order.
