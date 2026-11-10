# Run21 / Horses Blitz v5 / 357 Drop v6 — November 9, 2026

Jeremy explicitly approved one coordinated production publication, superseding
the earlier Run21 screenshot hold. The integration branch is
`codex/nov10-coordinated-scoring-release`, based on `ea1fb95a` and preserving the
complete Run21 correction in `e4fed5f6`. Unrelated Six Card Golf work is excluded.

## Qualification

- Run21 uses visible text-free casino art, metallic column frames, recessed felt
  and tied-rank-aware medals. No gameplay JavaScript, state machine, rule,
  animation, audio owner, layout geometry or lobby tile changed in its correction.
  [Visual evidence and preservation](RUN21_MIDNIGHT_HIGH_LIMIT.md).
- Horses freezes `/5`; only its versioned scoring table, first-roll bonus,
  five-ones base and completed-round time bonus change. `/1`–`/4` offers and
  registry configurations remain identical. All 756 v5 offers match the exact
  evaluator. All 1,020 standard-timing strong-hand decision cases are within
  ±10%, with 633 within ±5%.
- Drop freezes `/6`; only the 3s paytable changes. All 22,100 possible three-card
  hands match PostgreSQL. Minimum trips 800 exceeds maximum pair 775. Six exact
  requested examples pass. The 5s/7s scorer and all carry/placement/clock owners
  are retained. 600,000 complete rounds cover three public-information policies
  and both versions. [Full matrices, EV and simulation audit](COORDINATED_SCORING_AUDIT.md).
- Migration `20261110054915_horses_blitz_v5_drop357_v6` installed both versions
  with admission closed. Ten candidate and installed hosted rollback proofs
  pass, covering all older Drop versions, historical Horses offers, immutable
  results, replay/late replay, authorization, recovery, active-version pinning,
  terminal continuation, tied ranks and personal-best separation. They assert
  zero financial or multiplayer writes. No historical session was edited.
- Qualified scoring authority digest: `ee8cbea897e558d390fcbb113f392236`.
  The existing recovery worker remained healthy; no worker or API deployment
  change is required. Public RPC dispatch selects the pinned scoring version.

## Application checks

Application TypeScript passes. `tsgo` is unavailable here (its configured package
lookup returns 404), so the installed TypeScript compiler was used. Scoped ESLint
passes. The production Vite build passes (14.49 seconds, existing chunk warning).
The complete source suite reports 3,991 passed / 13 failed, with three mock errors.
All 13 failures and all three errors reproduce on unchanged `main` at `ea1fb95a`:
`DealerGameSetup.stakeDefaults`, `catalog/DefaultsAndRules`,
`megaCardGolf/Defaults`, and the direct-renderer allowlist in `cardFaceContract`.
They are existing failures; this release does not change those owners. All 241
harness unit tests pass. The previously qualified Run21 set is 530 passing tests.

Native browser, 390×844, real components with disposable PostgreSQL authority:
Horses `/5` admits correctly, renders +25%, animates rolls, retains held faces,
banks 747 for natural three 6s on Roll 2 and resets to hand 2. Drop `/6` renders
the new board label, resolves a natural pair of 6s with a 10 kicker to 198,
accepts both carries, locks rows, counts a 744-point round and advances to round 2.
No input gate, polling, network request or animation duration was added.

Run21 local component coverage includes empty/populated Arcade, Multiplayer,
Async review-to-play, real leaderboard data and tie medals. The exact baseline
geometry is retained at 390×844, with responsive checks at 320/390/430 portrait.
These local fixtures are distinct from live two-account multiplayer or Async
acceptance. Physical iPhone PWA and audible speaker verification require a device.

Local evidence directories:

- `C:/Users/jerem/.codex/visualizations/2026/11/10/01a1c3a8-0480-7241-b533-3787682513d7/run21-recovery/`
- `C:/Users/jerem/.codex/visualizations/2026/11/10/01a1c3a8-0480-7241-b533-3787682513d7/coordinated-release/`

## Publication and rollback

Publish one fast-forwarded `main` commit using the unchanged approved push helper.
Verify its Vercel production deployment and manifest, then Run21 phone screenshots.
Only afterward run `supabase/coordinated-score-release/activate.sql` with that
exact SHA. Activation requires the matching release-publication signal, unchanged
authority/configurations and a healthy recovery worker. New admissions use `/5`
and `/6`; old active runs retain their version. All historical leaderboards remain
selectable and incompatible scores stay separate.

The annotated `coordinated-run21-horses5-drop6-20261109-verified` tag records the
exact production SHA, URL and post-publication smoke outcome **only after those
checks pass**. Its absence means publication has not been verified. Final live
screenshots and the deployment receipt are saved in the evidence directory above.
`rollback-admission.sql` restores old admissions without changing any pinned run
or receipt; it does not undo the compatible client or frozen new rules.
