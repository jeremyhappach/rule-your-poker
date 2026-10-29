# Async results/history local checkpoint — October 29, 2026

Status: incomplete local candidate on codex/async-combined. Publication, main integration, hosted migration, activation and customer-data changes remain on hold. This checkpoint does not replace the released sibling completion fix at 43545662c08baf1e2e7b764c25048989a1d9721b.

## Implemented candidate

Match cards, local start timestamps, named signed Current Net, outstanding-child Unsettled, player-specific progress, pending score contributions, clock layout, Words bag count and randomized-first-player disclosure. Own completed scores show immediately; opponent cumulative points include only attempts acknowledged by this viewer. Shared Words scores retain their public-board policy.

Private immutable review events and per-viewer acknowledgements are separate from temporary sanitized board snapshots. Read-only review/history RPCs feed existing shared game renderers. Take Turn reviews pending opponent results before automatic Start; a started attempt resumes directly. Child result and net-based boxing-ring finale routes never own settlement. Persistent acceptance, completion and match notices use existing per-match notification rows. Async history is informational for play money, without real-account transaction writes.

The parent settlement implementation, canonical ledger/player-chip ownership, negative balances, ordinary synchronous rules, 36-hour deadline and 24-hour Last Call are unchanged. The candidate migration was created with the installed Supabase CLI and contains exact deployed-function preimage guards. It has NOT been applied to hosted Supabase.

Temporary non-Words board cleanup is private and unscheduled. Playback begin and cleanup take the parent lock; pruning rechecks eligibility after locking. Pending final viewers and active playback leases retain boards. Immutable receipts, child authority and audit state are never pruned. No customer cleanup has run.

## Evidence and limits

Local rollback proof covers sanitized capture, own/unseen/partially viewed scores, viewer independence, duplicate ACK, authorization, immutable receipts, accepted-to-turn retirement, final masking, authoritative history outcomes, negative-chip canonical parent settlement, zero play-money account posting, stable notices, pending-final/active-lease retention and receipt survival after synthetic board pruning.

The unchanged parent financial proof passes provisional zero-write checks, net settlement and negative chips, net-zero receipt, independent-connection simultaneous last-child completion, injected rollback/retry, child forfeiture, 32 obligations and browser financial-owner denial. These run only in disposable local PostgreSQL clones.

Eight synthetic 390x844 browser cases pass: five real shared saved-board renderers and winner/loser/draw finales. Each of the four round-based games sends one Start after review; Words sends no gameplay action. Finale checks assert winner-only confetti, no draw transfer, breakdown transition, one ACK and no financial action. The Run21, Tri-Towers and winner-finale screenshots were visually inspected. Synthetic transport is not hosted or physical-device acceptance.

Final application typecheck, 3,211 source/server tests across 459 files (including the begin-failure retry regression), all 241 harness tests and the production bundle pass. The bundle retains the existing chunk-size warning. Packaged migration preimage guards and SQL compile pass inside a local rollback; the current candidate also passes the canonical parent proof. Logs are in qualification.local/async-combined/review-*.log. These checks do not waive the remaining flow qualifications below.

## Required completion before release review

1. Handle existing matches whose completed attempts predate review-event capture: missing event rows currently leave opponent contributions pending with no corresponding review/ACK path. Establish acceptance-notice retirement for pre-existing active matches without replaying an obsolete acceptance notice. Preserve authority and show explicit unavailable-board fallback.
2. Reconcile a second device's review acknowledgement with an already-mounted turn's equal-revision snapshot guard. Review metadata must not create a false conflicting-gameplay snapshot; test the actual transport boundary.
3. Replace generic five-second saved-result playback with each shared game's canonical celebration/count timing and audio; finish child count → winner-only confetti → stake-overlay sequencing. Review interrupted playback, reduced motion and historical replay.
4. Prove competing Start/retry/reload request identities against the actual service and database, plus a simultaneous playback-begin/prune race. Current parent-settlement race proof does not prove these separate races.
5. Finish match-home/history phone and accessibility checks, bounded history pagination, and final integrated validation. The current finale artwork is a local SVG candidate, not owner-approved visual acceptance.
6. After the above passes, perform a final scope/security/ACL review and request release review under the existing publication hold. No additional product-direction decision is needed to continue this approved local scope.

The execution-budget checkpoint preserves this incomplete candidate rather than claiming that a passing renderer or settlement proof qualifies the whole flow.
