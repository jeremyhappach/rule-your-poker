# Async saved-result reader — November 14, 2026

Jeremy reported “Unable to verify this turn” when opening TheOG's results after
the Async incident holds were released. Refreshing and backgrounding the PWA did
not help. The failing request was the read-only `public.delayed_reviews(uuid)`
RPC used by `ReviewGate`, before result playback or the next playable turn starts.

## Cause and correction

The Chess correction release `3a2a0c292` switched the reader to
`private.delayed_current_review_events`, which excludes superseded final results.
Its SQL row alias therefore has the view's composite type. The unchanged privacy
predicate accepts `private.delayed_review_events`, the original table's type.
PostgreSQL does not implicitly match those signatures. Production logs and an
authenticated read-only reproduction returned SQLSTATE 42883.

Migration `20261114174824_async_review_event_row_type.sql` changes only that call
to pass `ROW(e.*)::private.delayed_review_events`. The deployed table and view
have the same ten columns in the same order. The guarded migration requires the
observed reader definition and is idempotent. Existing function ownership,
execution grants, stable/read-only behavior and security settings are retained.
The other two predicate callers already use table-typed local variables.

The current-generation view, authorization, Take 2 and shared-deck Crib Lab
embargoes, review order and acknowledgments remain unchanged. This migration
does not write gameplay, history, money, banks, deadlines or admission settings.
There is no client change and no need to clear PWA storage.

## Exact evidence and qualification

- Parent match: `86f00f02-35f8-4efa-9375-f31eed3539d1`.
- Quintzee child: `e5c6ddff-2129-49b7-9add-7183ec8816ca`.
- TheOG Round 2 event: `b1b6ef06-3d6a-4e20-baee-018fe52549a2`.
- The saved board exists; the reported participant read succeeds after correction.
- Candidate and installed production proofs each passed 174 participant
  projections across retained active and settled children. Repeated reads,
  current-generation filtering, outsider/missing-identity/anonymous refusal,
  and saved-board delivery passed.
- Synthetic Take 2 and shared-deck Crib Lab fixtures verify that opponent results
  remain hidden, including begin/ack rejection, until the viewer completes the
  corresponding round.
- Proofs preserve existing child/match rows and clocks, canonical transaction and
  transfer counts, outcomes, acknowledgment rows and playback rows. All fixture
  writes and candidate DDL are contained in rollback transactions.
- Proof: `supabase/delayed/review-row-type-proof.sql`. Run inside
  `BEGIN ISOLATION LEVEL REPEATABLE READ` / `ROLLBACK`; for the candidate,
  include the migration first. The candidate also applies the migration twice
  to prove idempotency. The installed proof omits the migration.
- Full `npm run build` passed TypeScript, 4,172 application tests, 241 harness
  tests, 46 release-tooling checks, Vite and the unchanged 90 MB static-size gate.
  The final authenticated read returns the saved Round 1 and Round 2 boards,
  with Round 2 still unseen; validation has not acknowledged it for Jeremy.

The earlier four incident holds were released through the canonical measured-hold
resume function at 17:42 UTC on November 14. That was a separately authorized
operation; this correction neither reopens holds nor changes those clocks.

## Owner acceptance

Return to the match and open TheOG's pending Quintzee result. Confirm Round 2
plays, its score is shown, and the normal handoff admits your turn. Refreshing
mid-review should resume safely.

Jeremy answered “it worked” to the result-playback and turn-handoff smoke question
on November 14. This accepts that PWA path; it does not separately claim a
mid-review interruption test. Production manifest and READY deployment
`dpl_4WmjyBBoyhi2VvEnZD4TJJyPb5Q6` identify
`9aef7bcfed54903f02738c4a6b7724d7a036bddc`.
Release checkpoint: `async-review-row-type-20261114`.
