# Async results/history local checkpoint — October 29, 2026

Status: implemented local candidate on `codex/async-combined`, continuing checkpoint `c4ead759b`. Publication, main integration, hosted migration, activation and customer-data changes remain on hold. Production remains the published sibling completion correction `43545662c08baf1e2e7b764c25048989a1d9721b`.

## October 29 illustrated finale revision — local only

Owner rejected the schematic figures and selected polished original arcade illustration. The latest direction supersedes chip transfer: centered referee raises the winner's anatomical left arm; the winner holds a cash bag in their anatomical right hand. Runtime displays the absolute authoritative net amount on the bag and usernames beneath the corresponding boxers. The illustrated winning pose is on the left; UUID-based runtime names map the actual winner/loser to those poses. No persistent player-avatar identity is inferred from the generic fighters. A separate neutral draw scene has no bag, dejected fighter, transfer or confetti.

Built-in image generation created original neutral and decisive scenes. No stock reference pixels were accessed or copied. The final 1254-square JPEG assets are approximately 466 KB and 415 KB, encoded from generated PNGs without composition edits. Full selected prompts and provenance are in `src/assets/async-finale/README.md`. Usernames and dollar amounts remain runtime text; confetti remains the existing winner-viewer-only effect. The chip-flight markup and its unused CSS were removed under the latest owner direction.

Existing finale phase timing, reduced-motion timing, acknowledgement owner, net-based winner selection, history destination, child scores and settlement are unchanged. The technical phrase “One authoritative match settlement” is still retained and flagged for owner review.

Validation on final JPEG assets: 20 focused result/history component tests, application typecheck and production build pass. Eighteen installed-Edge cases pass: winner/loser/draw at 320px, 390px and 1440px, each in normal and reduced motion. They verify decoded images, square uncropped geometry, readable name/amount bounds, correct player UUID-to-pose mapping, no chip transfer, winner-only confetti, neutral draw, exactly one review acknowledgement, return to actual read-only history and no gameplay/account requests. Zero page errors and zero external origins. Phone winner/loser, desktop winner and reduced-motion draw screenshots were visually inspected. Evidence: `boxing-focused-final.log`, `boxing-typecheck.log`, `boxing-build.log`, `boxing-browser-final.log`, `boxing-browser.json` and `boxing-*.png` under `qualification.local/async-combined/`.

The running local preview at `http://127.0.0.1:15325/` now uses this revised artwork. Choose Winner finale, Loser finale and Neutral draw finale to review. Local owner visual acceptance remains pending. Nothing was published and no hosted or customer state changed.

## Implemented scope

Accessible whole match cards show local start dates, named signed Current Net, outstanding-child Unsettled, player-specific progress, pending score contributions, clock layout, Words bag count and randomized-first-player disclosure. Own completed scores show immediately; opponent cumulative points include only attempts acknowledged by this viewer. Shared Words scores retain their public-board policy.

Private immutable review events and per-viewer acknowledgements are separate from temporary sanitized board snapshots. Existing completed attempts receive derived compatibility receipts without changing authority or copying historical private boards; unavailable boards have an explicit fallback. Prior organizer turns retire obsolete acceptance notices. Capture and backfill install under table locks in one transaction.

Take Turn reviews pending opponent results before automatic Start; a started attempt resumes directly. Saved boards use frozen shared-game celebration/count schedules and shared presentation/audio owners. Explicit replay admission defaults off for existing live callers. Child results progress through count, winner-only confetti and stake presentation. The net-based parent finale supports winner, loser and neutral draw, then the authoritative breakdown. The boxing-ring SVG remains a visual review candidate, not owner-approved artwork.

Gameplay and viewer-disclosure revisions are independent. A second-device acknowledgement updates totals without creating a conflicting equal-revision gameplay snapshot. Unconfirmed requests survive same-tab reload with their exact UUID, revision and segment; success or definitive rejection clears the stored copy. Sign-out clears pending requests.

Persistent acceptance, grouped child completion and final-match notices use existing per-match notification rows. Account and game history share a read-only match detail route. History uses indexed 30-row keyset pages. Play-money history is informational and never posts to real accounts. Removed settled matches retain read-only history; child replay actions remain unavailable.

Temporary non-Words board cleanup is private and unscheduled. Playback begin and cleanup take the parent lock; pruning rechecks eligibility after locking. Pending final viewers and active leases retain boards. Immutable receipts, child authority and audit state are never pruned. No customer cleanup has run.

## Preserved contract

Parent settlement, canonical ledger/player-chip ownership, existing negative balances, ordinary synchronous rules, child stakes and forfeitures, 36-hour deadline and 24-hour Last Call are unchanged. There is no funded wallet, ring fence, reservation, available-balance gate or child transfer. Review acknowledgements do not change financial authority or extend turn availability.

Candidate migration `20261029155233_async_results_review_local_candidate.sql` retains exact deployed-function preimage guards and mirrors `supabase/delayed/reviews.sql`. It has NOT been applied to hosted Supabase.

## Local evidence

- SQL rollback proof covers sanitized capture, own/unseen/partially viewed scores, viewer independence, duplicate ACK, authorization, immutability, notification retirement, final masking, history and board retention.
- Fifteen loopback HTTP/service/PostgreSQL checks pass: legacy compatibility with unchanged authority; same-ID duplicate/reload Start; distinct-ID competing Start in all four round games; fingerprint rejection; cross-device ACK at equal gameplay revision; playback-begin/prune lock race; 30+2 history pagination; participant checks and table/RPC ACLs. Real service code and role-scoped SQL run in disposable local databases, with fixture authentication at the HTTP boundary.
- Canonical parent proof passes: provisional zero writes, balanced net settlement with negative chips, net-zero receipt without transfer, independent-connection simultaneous last-child completion, atomic rollback/retry, child forfeiture, 32 obligations and browser denial of financial authority.
- Ten synthetic browser cases pass: five shared saved-board renderers, winner/loser/draw finales, and home/history at 320px and 390px. Four round games issue one Start after review; Words issues none. Checks cover winner-only confetti, no draw transfer, breakdown, one finale ACK, keyboard navigation, pagination and overflow. Corrected phone scores and single-player Quintzee replay were visually inspected.
- The earlier cold-navigation history-detail timeout is superseded by the October 29 17:21 UTC warm-server follow-up. Existing assertions were retained. Winner, loser and neutral-draw finales pass; read-only history passes at 320px and 390px, with no Take Turn/delete controls or gameplay/financial requests. Fresh draw and history screenshots were visually inspected. Both draw boxers are neutral, with no winner arm, confetti or chip transfer. Hosted and physical-device owner acceptance remain unobserved.
- Application typecheck, all 3,226 source/server tests across 461 files and 241 harness tests pass. The production build passes, retaining the existing chunk-size and stale Browserslist warnings. The final pending-request cleanup adjustment separately passes all 36 mounted async-shell cases.

Evidence: `qualification.local/async-combined/review2-*.log`, `review-service-proof.json` and `review-browser.json`. Follow-up evidence: `review3-remaining.log`, `review-remaining-browser.json`, `review3-history-final.log`, `review-ui-browser.json`, `review-preview-final.log` and `review-preview-proof.json`. No hosted state or release receipt was changed.

## Verified local preview — JeremyLaptop

Owner authorized remaining local checks and a preview, with publication still withheld. At the 17:21 UTC checkpoint product code was exactly candidate `44ce20f12b7d8be659326b9a1e37f62c139a4991`; that follow-up changed only fixtures, preview, qualification and documentation. The later illustrated-finale revision above supersedes its artwork and chip-flight presentation only.

Open `http://127.0.0.1:15325/` on JeremyLaptop. The independent background process serves actual candidate components with synthetic data and no sign-in. Menu links cover match home, paged history, winner/loser/draw finales and read-only draw history. Gameplay, invitations, deletion, customer data and hosted services are not connected. The server binds loopback only and has `envFile:false`; Supabase and delayed-client imports use the existing fixture transport.

Start command if the local process has stopped: `node dev/async-combined/review-preview.mjs`, from this worktree. The server confirms readiness at `/review-health`. Browser qualification waits for the full imported module graph to render its readiness marker before beginning assertions; it does not lengthen the existing flow assertion timeouts.

Standalone installed-Edge verification passes seven checks: menu/health, browser module readiness, match home, 30+2 history pagination, and each of three finales returning to the actual read-only history route with one fixture acknowledgement. There are zero external network origins and zero page errors. A navigation-cancelled module request (`net::ERR_ABORTED`) is recorded; all destination assertions pass. The app browser panel did not attach, so verification used installed Edge directly.

Visual inspection identified inconsistent settled values in the original synthetic history fixture. Only fixture values were corrected: five completed children, zero unsettled stakes, signed child totals matching the parent net, and final scores consistent with outcomes. Both affected phone-history cases and standalone preview qualification passed again afterward. No product correction was needed.

Review instructions: open Neutral draw finale; observe neutral poses and no transfer, then its automatic history return. Compare Winner finale and Loser finale; only the winner view gets confetti. Open Match list and history, load older entries, and inspect the settled breakdown. The phrase **“One authoritative match settlement”** remains unchanged and explicitly flagged for owner review, along with the candidate boxing-ring artwork.

## Remaining gates

Integrated local validation is complete. Review the local candidate and finale artwork. Hosted migration qualification, coordinated publication and production smoke remain withheld under the explicit publication hold. Local evidence does not claim production acceptance.
