# Async results/history release — October 29, 2026

## Scope and authority

Owner approval at 18:35:50 UTC: “new previews are in, good to go to prod.” This releases the qualified results/history package through candidate `497483e7fecfdd3beeab83409d464e148857a02e`, including per-viewer result review, saved presentation, durable Start retries, persistent notifications, paged history and the approved illustrated cash-bag finale. The separate platform transition audit is not part of this publication. No customer balance/session repair, real-money admission change, global cleanup, protection change or release-signal write is authorized or performed.

The starting production SHA is `43545662c08baf1e2e7b764c25048989a1d9721b`. The candidate descends without divergence. The known main checkout is `C:/Users/jerem/Documents/Codex/2026-10-27/task/incident-release-main`. Integration uses fast-forward only and the unchanged main push helper.

## Installed database qualification — PASS

Supabase project `xvhmbuppghwmwpwrkzao` registered `20261029184517_async_results_review` once. The repository migration was renamed to that actual recorded version; executable SQL is the reviewed candidate. Its four guarded function preimages matched deployment. Both candidate and installed proofs passed within BEGIN/ROLLBACK. Post-proof synthetic profile count is zero. All six new private tables have RLS and postgres-only table privileges. Five-game fake-only admission and recovery remain enabled; the recovery worker is recent.

`supabase/delayed/reviews-proof.sql` exercises actual hosted functions, triggers and constraints: invitation acceptance causes no financial writes; own score is immediate, opponent score requires acknowledgement; private deck/evidence does not escape; duplicate acknowledgements, outsider denial, immutable receipts, final-result masking, history, notification stability and playback-retention eligibility pass. Global pruning and recovery sweeps are not invoked. Backfill preserves existing authority and derives metadata only; historical board fallback and authority preservation also pass in the local service proof.

Financial preservation is verified against the unchanged deployed hashes of `settle_gameplay_chip_transfers`, `record_session_results`, `finalize_gameplay_transfer_batch` and `delayed_finalize`. A completed 5-chip child produces exactly -5/+5 canonical player chips, one balanced transfer and two zero-sum final snapshots. An incomplete parent has no canonical game or transfer. Injected terminal failure rolls back the final child outcome, review and every financial artifact. Retry succeeds. Opposing 5-chip children close at zero with one receipt and no transfer. Duplicate/late finalization returns the same receipt; conflicting outcome replay fails. Fake matches cause no real-account transactions.

Independent local database connections, using those same financial owner hashes, simultaneously finish the last two children and produce one parent settlement. The local service suite additionally proves duplicate/distinct Start races, lost-response retry, immutable action identity, separate disclosure revisions, playback/pruning lock order and private keyset history. Hosted proofs do not claim a new hosted multi-connection race; the unchanged authority is tied to the actual concurrent local proof.

Security-advisor baseline and post-install results are retained locally. The existing public `gameplay_transfer_pending_changes` RLS advisory predates this migration. Private review tables deliberately have no browser policies and are exposed only through participant-checked RPCs.

## Client and service qualification — PASS

- Application typecheck, 3,230 source/server tests across 461 files, 241 harness tests and the production build pass.
- Fifteen actual HTTP/service/database checks pass, plus the canonical parent financial/race proof.
- Previously qualified unchanged UI evidence includes ten synthetic browser flow cases, warm history/navigation checks and 18 winner/loser/draw artwork cases across phone/desktop and reduced motion. Owner approved the refreshed previews. These are local fixture results, not production gameplay acceptance.
- Build retains its existing chunk-size warning. No dependencies or tools were installed.

Evidence is under `qualification.local/async-combined/`: `release-review-*.log`, `review-hosted-candidate-result.json`, `review-hosted-installed-result.json`, `review-hosted-inspection.json`, `review-parent-proof.json` and `review-service-proof.json`. Proof composition is `dev/async-combined/review-release-proof.mjs`.

## Publication gate

Pending main integration and agreement among remote main SHA, Vercel production READY, public build manifest, successful current-head GitHub publisher and persisted Supabase release receipt. No release signal is written directly. Production smoke remains Jeremy's acceptance step.
