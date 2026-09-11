# Holm ending and Run Back qualification — September 10, 2026

Approved healthy qualification follows the verified Gin correction. Scope:
one deterministic solo win against Chucky, full local presentation on both
browsers, unchanged Run Back configuration, and both successor decisions.
Horses/SCC remain skipped. Fault, reconnect and End Session rows are separate.

The existing deployed `arm_target_rule_branch_harness` profile
`holm:solo:win` is admin/participant-only, exact-session, fake-money-only,
restricted to pre-hand status and expires after 600 seconds. The deployed
get/cancel definitions were inspected. Cancellation removes its exact request.
The test creates its own session and uses ordinary Stay/Fold browser actions;
there is no SQL fixture rewrite, migration or historical-session mutation.

The harness reuses the shared continuous observer and winner/payout checker.
Holm selects the exact pot transfer instead of a seat transfer. Its observed
community and Chucky card identities must match the authoritative round;
all four community faces must finish flipping and all four normal 600 ms
Chucky flips must complete before the winner announcement. The 20 ms card
sampling tolerance is separate from native CSS duration, which must remain
600 ms. The payout requires full native completion, exact transfer identity,
conserved balances and setup after completion. Both clients then retain the
complete saved configuration, enter a fresh dealer game/hand, and complete
their first Fold decisions within the unchanged six-second peer budget.

Product changes are passive DOM attributes only in MobileGameTable and
HolmCanonicalCommunityRow. Chucky uses its existing card-id and flip markers.
These expose existing
identity/render state without adding state, effects, requests or timers.
Rules, settlement, ledger ownership, reveal pacing, independent client
completion and all game flows are preserved. React review found no new
subscription, effect, rendering branch or network waterfall.

The native Chucky renderer browser control replaces only leaf card artwork;
the actual flip state machine, DOM structure and CSS transition run in Chromium.
Positive/negative controls distinguish a full flip from shortened CSS,
missing community completion, stale/duplicate identities, and early winner.
Pot-flight controls also reject cancellation and shortened animation.

App typecheck, all 1,564 app tests, 150 final harness tests and production build
pass. The 28 browser controls pass across the full run and focused Chucky
rerun (the initial Chucky control had a corrected esbuild resolve-directory
error). The final Chucky control uses the renderer's existing parent card ID.
The supplementary E2E typecheck has only the same ten inherited
`abortSignal` typing errors in the existing session/probe helpers.

Evidence: `artifacts/holm-presentation-20260910/`. Build
`33c69e736861a022f812b339d3d2353570332042` is published and manifest-verified
(Vercel `dpl_AiLGtjyU9LjxzXn4RwA1b7k1rXEL`, READY).

The first run, session `6b598cb4-f9b5-4075-9999-033146d301cd`, stopped
on an incorrect two-player payout-journal expectation. The $20 pot payout
correctly journals only its affected endpoints: pot and winner. The harness
now reads both pre-decision player balances, checks the journal against them,
carries the unaffected player's balance through the presentation proof and
compares both post-settlement rows. A focused regression rejects a mismatch.
The original failure remains failed; independent cleanup is complete.

The second run, session `a4a71389-9213-4124-b157-32cc1582a3c9`, captured
the complete ending but stopped on a Cribbage-only skunk-overlay expectation.
Source confirms `MatchWinCelebration` returns no overlay without a skunk
payload; Holm's reveal gate releases its winner plate and pot flight together.
The adapter now uses the existing simultaneous-announcement option and does
not require the unrelated skunk overlay. Retained diagnostic evaluation
passes both clients' four Chucky flips (600–620 ms), full pot flights
(2,426/2,412 ms), balances and setup ordering. That diagnostic does not change
the failed run's status or establish Run Back, which it never attempted.

The fresh full scenario passed in 57.4 seconds, with zero automatic retries,
on the same published build. Session `64a88909-e8e3-4fa9-8c1e-e8c5efddbc61`
finished source dealer game `0bf21204-e357-4c83-88b5-031c3dd550ba` and ran
back to fresh dealer game `20b7aed4-c06c-4e85-b571-c4953db30a6c`.
Both browsers showed all four community faces and four normal Chucky flips
(604–632 ms) before the exact winner plate. Both full pot flights lasted
2,420 ms. Setup followed their completion by 6,360/5,878 ms respectively.
The $20 pot was conserved, the winner finished at +10 and the other player
at −10 before the successor antes.

Run Back retained all eleven saved config fields, including stake 10,
four Chucky cards, disabled Rabbit Hunt/Pussy Tax/Pot Max, and their saved
values. Both clients entered fresh hand 1 and recorded the two legal Fold
decisions at exact successor round `ca9d7aae-6ba5-4653-aa99-d60ed9d487b0`,
turn sequences 1 and 2. The continuous observer recorded nine action
receipts, zero violations/progress problems and maximum peer delay 1,175 ms
against the unchanged 6,000 ms budget. Both final screenshots were inspected.

All three synthetic sessions and fixture requests are independently verified
absent, including players, rounds, dealer games, results, transfer batches and
snapshots. The first two failed runs remain failed. No product behavior changed
in either harness correction. This accepts the automated healthy Chucky win
and Run Back path, not reconnect/fault rows, all Holm outcomes or Jeremy's smoke.
