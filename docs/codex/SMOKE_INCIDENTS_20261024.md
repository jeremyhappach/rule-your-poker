# October 24 multiplayer smoke — investigation checkpoint

Status: application published and scoped database policy installed,
owner smoke pending. Base: `48c26110e23b13727e208bfb8177c06c5699e492`.
Source checkpoint: `oct24-multiplayer-smoke-corrections-20261024`.
Branch: `codex/oct24-smoke-incidents`. The original Six-Card Golf checkout and
all its local changes are preserved. Jeremy's pasted report authorizes scoped
investigation and implementation; another routine approval is not required.

## Production evidence

Read-only Supabase queries targeted `xvhmbuppghwmwpwrkzao`. No existing session,
balance, history, participation, or configuration was modified. The attachment
contained the written report only; its three referenced screenshots were absent.

The times and cards identify real-money session **Oct 24 - Scents and Subtle
Sounds**, `ed1ef3fb-78be-4f6b-863d-b2e8893bd0db`. Times below are America/Chicago.
The session remains paused on HOLM hand 6; do not resume or repair it.

### 1. Dealer-draw card in 3-5-7

First dealer game: `44b6700a-e95c-4c90-9e3e-5d4d4fa21a85`.
First round: `311f53c7-1254-49da-8db0-054414d0cfe0`.
Hap's stored three cards are J-spades, A-hearts, 8-clubs, matching the report.
His high-card overlay logged visible at 3:57:29 and unmounted at 3:57:35,
before the dealer game began at 3:57:51. The initial hypothesis that the
canonical overlay never unmounted is contradicted by this evidence.

Source confirms a separate, unconditional bottom-hand renderer consuming
cached `dealerSelectionCards` in `MobileGameTable.tsx`. It could paint a draw
card beside normal gameplay after the canonical overlay retired. Refresh
reinitializes that local card store. The surviving 2-spades identity itself
cannot be independently verified without the screenshot or original draw row
(the current persisted dealer-selection state is null).

Local correction removes this duplicate renderer. The existing phase/receipt-
owned felt overlay remains the sole draw-card owner, including the viewer's
card. The dealer-winner spotlight now uses the same phase/receipt eligibility.
The gameplay hand, draw animation, ties, canonical card backs, geometry and
financial ownership are unchanged. Consumers inspected: route dealer-selection
props, all MobileGameTable draw-card consumers, and the separate Cribbage
dealer-selection handoff. Cribbage's renderer is unchanged.

### 2. Ship dice/pot overlap

Ship dealer game `24847e05-cb34-4c87-9e6d-7a38858b6179` began at 4:08:40.
The pot uses a percentage of the table (`top:28%`, translated by its height);
opponent dice use a separate resolved gameplay rectangle (anchorY 0.42,
widthPct 0.75). There is no shared exclusion bound between these placements.
The full-shell fixture reproduces a concrete held-die/pot overlap. The
absolute held/scatter dice paint outside their 140x84 intrinsic box, so the
assigned-rectangle fitter previously measured an incomplete envelope.
The final SCC correction includes those intrinsic paint bounds in the fitter
and allocates a felt-relative dice stage below a compact pot. The same pot
flows under the existing shell game/stakes label instead of using a separate
percentage position. Horses, Yahtzee, amounts, chip authority, holds, dice
identity/order, roll timing and game rules remain unchanged.

The offline fixture `dev/oct24-smoke` renders the real pot, dice, fitter and
geometry components. `.codex/scripts/oct24-smoke-geometry.mjs` passed 14 checks
at 320x568, 375x667, 390x844, 430x932, 667x375, 768x1024 and 1280x800, with
unheld and SCC-locked states. Ninety animation frames per state checked actual
rendered die rectangles against the pot; no overlap or page error occurred.
The fixture does **not** reproduce the original overlap with the legacy pot,
and its landmarks are synthetic rather than the complete shell/seat ring.
That initial candidate was superseded after actual-shell screenshots exposed
top clipping and label interference. The final fixture is
`dev/oct24-smoke/full.html` with `.codex/scripts/oct24-full-shell.mjs`.
It passed 42 checks (zero through five held dice at seven viewports), plus
12 checks of the full six-seat ring at phone and landscape sizes.
It mounts the actual MobileGameTable, shell, seats, label, HUD and dice, blocks
all external requests, and checks held layouts against pot/label/seat/HUD
rectangles and the felt clipping boundary across the same seven viewports.
Screenshots and measurements are local evidence under
`.codex/evidence/oct24-smoke`; they do not establish production acceptance
or identify the exact missing original screenshot viewport.

### 3. mcru81 timeout/rejoin

User UUID `e13e2dd9-6b38-4073-a313-2286877af40c`; player UUID in this session
`a3052c46-393f-424c-a8ac-d54076442954`. Current row has auto_fold=false,
sitting_out=false, waiting=false and sit_out_next_hand=false. These current
flags do not establish whether a prior request failed. Other October 24
sessions exist for this user, including real-money incident sessions already
frozen by earlier work; do not conflate them.

The canonical timer registry identifies the timeout as **HOLM hand 2 at
4:15:48.793967 PM**, round `d1690512-0dca-49a5-acca-b425052809d9` in dealer
game `b6a226aa-f976-42d4-9318-be695d5edf9e`. Its `holm_decision` deadline was
4:15:48.624311; the completed result records `deadline_applied=true`, this
player's locked decision, and advancement to position 5. The earlier debug-log
searches were insufficient; this is direct canonical scheduler evidence.

Supabase HTTP logs show mcru81 calling `set_automatic_play` at 4:16:02.892 and
4:16:05.402, after hand 3 was created at 4:16:02.537796. Both returned HTTP 200
with response content length 29. That length matches the deployed function's
`stale_identity` response, but the response body and request identity were not
logged, so the exact rejection remains an inference. A third request appears at
4:17:29.715. The current clear flags and intent_version=3 do not independently
date an accepted request or prove how the checkbox appeared on that client.

Checkbox path: MobileGameTable/HorsesMobileCardsTab -> Game.handleAutoFoldChange
-> sessionPlayerIntent.setAutomaticPlay -> deployed public.set_automatic_play.
It is a real RPC, not only a local toggle. The server validates session,
dealer game, hand, round and participation CAS; rejects completed/stale rounds;
and defers dice takeover release until the actor's turn boundary. The 357
client already reads a fresh atomic frame; HOLM and the other games submit the
rendered round plus a fresh intent version. A held presentation can therefore
send a completed predecessor while authority is on the successor. The timing
and response lengths support this failure path, but do not expose the client's
submitted round. No timeout, pause, bot, authorization or participation policy
was changed.

**Resolved policy discrepancy:** the report describes a
pause on real-money timeouts, whereas deployed `holm_apply_deadline_decision`
marks an individual timed-out human for automatic play and next-hand sit-out,
then invokes `private.pause_all_humans_auto_fold`. That shared guard pauses
only when the nonempty eligible human cohort is entirely on automatic play,
in either money mode. This agrees with the October 9 decision in
`DECISION_LOG.md` and migration `20261009231202_restore_all_human_auto_fold_pause`.
The HOLM and 357 defaults enable timeout auto-fold with a 30-second decision
budget; this session inherits the defaults. Jeremy corrected the initial
first-timeout interpretation: HOLM/357 timeouts enable auto-fold and must offer
legitimate rejoin. Real-money play pauses when only one eligible human remains
outside auto-fold (also zero). Horses/SCC retain automatic play. Other games
retain their existing policies.

Installed migration `20261024221401_real_money_poker_last_present_human.sql`
changes only the two qualification checks inside the existing private guard.
Three humans with one on auto-fold continue; with two on auto-fold they pause.
Two humans pause after one times out. Manual folds do not imply absence.
Fake money and other games retain the aggregate threshold. Deliberately
enabling automatic play is covered by the same guard.
Existing producers still validate expiry/actor/identity and mark timeout intent
before any decision. Existing pause authorization, locks, deadline renewal,
recovery-context restoration and continuation guards are preserved. Reclaim
clears automatic intent; only explicit authorized resume restarts the match.

The complete candidate proof ran successfully on production under BEGIN/ROLLBACK,
using only generated fixtures. It composes existing HOLM winner/tie/terminal,
authorization, settlement and replay proofs, the fake-money aggregate timeout
proof, plus three-human real-money HOLM/357 first-expiry continuation,
last-present-human containment, zero-present containment, two-human expiry,
unchanged money/actions/rounds at the pause boundary,
duplicate and late delivery, unauthorized/stale reclaim, valid reclaim while
paused, stale/valid host resume, and real-money Horses/SCC exclusion. The host
resume owner remains unchanged; the next authoritative guard re-pauses if the
cohort still qualifies. Runner:
`.codex/scripts/build-real-money-poker-timeout-proof.mjs`.
Supabase CLI 2.122.0 was installed with permission and created the migration
files. The earlier first-timeout migration `20261024221035` was installed before
Jeremy's correction and is superseded by `20261024221401`. The full proof
passed both before application under rollback and after application against
the installed definition. Only function DDL persists; generated fixtures roll
back and historical session rows are unchanged.

Client candidate `sessionPlayerIntent.ts` now reads HOLM's published round and
the participant's intent version in a single PostgREST embedded read, with
actual deployed foreign-key names. It selects the exact dealer/hand/round,
rejects a completed or missing published hand with a preparation explanation,
and keeps the existing one-retry stop-only/CAS rule. It never retries an
uncertain write, overwrites a competing participation version, or resumes a
paused game. The new embedded read passed authenticated HTTP qualification
using an existing E2E account and its visible ended HOLM participation.
That proves FK syntax, returned envelope and access, not an active-hand browser
rejoin. Exact active identity, CAS and hand-boundary selection have focused
unit and database coverage.

### 4. HOLM completed showdown

Dealer game `b6a226aa-f976-42d4-9318-be695d5edf9e`, hand 1,
round `c81cc079-d208-4c6e-b86f-b2e9962d0d5b` exactly matches the reported
community cards: 7-clubs, A-hearts, 5-diamonds, 6-hearts.

Actions: Lance stayed at 4:14:44, mcru81 folded at 4:14:45, Hap stayed at
4:14:47. Canonical ledger cursor 69 paid the $9 pot to Hap; cursor 70 collected
$9 from Lance into the replacement pot. Both committed at 4:14:47.688335.
Those were the only settlement transfer batches in the inspected hand window;
their opening/closing balances match their transfers. No duplicate settlement
was found in this hand. This is historical evidence, not a new financial proof.

Successor `d1690512-0dca-49a5-acca-b425052809d9` was created in the same
transaction. Hap acknowledged it at 4:15:17.339264; Lance and mcru81 did not.
Later hands exist, so the server did continue. Jeremy subsequently confirmed
that **Hap was the frozen viewer**. The matching hand records Hap winning,
despite the initial report saying he lost. Hap's acknowledgement establishes
later client progress but does not establish whether refresh produced it.

The failure boundary is client presentation/acknowledgement rather than missing
settlement. Exact local failure remains unproved. One concrete source concern:
Game's continuation effect admits through live games.awaiting_next_round but
reads result/identity from held holmView; the live flag can clear while a local
predecessor remains held. Other gates include exact community reveal and ledger
cursor receipts. A local correction now makes result admission consume the
same held snapshot as result/identity and felt props. A focused barrier test
covers completed H1 held while H2 is betting with its awaiting flag cleared,
then exact H1 completion releasing admission. No receipt, community reveal,
ledger-stage or financial guard is bypassed, and no repair timer was added.
This proves a concrete source-level stall path; historical logs do not prove
it was the sole gate blocking Hap's browser. Published multi-client smoke must
confirm both winner/loser continuation without refresh.

## Shared cause and validation

No common cause across all four incidents is established. The duplicate
dealer-card renderer is distinct from the HOLM continuation barrier. Stale
presented identity could link HOLM and rejoin, but that remains a hypothesis.

The earlier local high-card correction passed 66 tests across seven focused files:
MobileGameTable dealer receipt, useSessionDealerDrawReceipt,
useHighCardDealerSelection, sessionDealerDrawPresentation,
sessionDealerDrawTieHarness, sessionPlayerIntent and holmPresentationBarrier.
The new ownership assertion forbids dealer cards in the gameplay hand pane;
existing hook tests cover live transition, ties, cold entry and stale receipts.
Application TypeScript, the Vite production build and git diff --check passed.
The build retained existing Browserslist/chunk warnings. This is not viewport
or production acceptance. No dependencies were installed; the isolated
worktree reuses the existing node_modules through a junction.

The subsequent candidate passed 77 tests in six files: sessionPlayerIntent,
holmPresentationBarrier, holmTransferPresentationStage, MobileGameTable dealer
receipt, horsesSccAuthority and holmDatabaseResolutionOwnership. Application
TypeScript and Vite production build pass, with existing warnings. React review
checked stable component identities, new effect dependency, gesture-only fresh
reads and unchanged non-HOLM branches. The SCC component uses existing canonical
geometry and portal ownership rather than window measurements or device patches.

## Remaining work

Application publication is verified: Vercel deployment
`dpl_5dL74fPETNGMbwBCAbUP22rcJfC4` is READY and `holm357.com/build-manifest.json`
served `4ab4f4cc9dcf62bf36b4329a19387291da6f6f12`.
The production two-client HOLM solo-exposure/Run Back test passed in 52 seconds.
Its fresh fake-money fixture `1aef0880-678d-408a-a96e-f3d2daf09b8f` was cleaned
up and cleanup verified. The preceding attempt stopped before gameplay
because the harness expected obsolete Card Games/Dice Games tab labels;
fixture `b5c32c29-8082-4375-91c0-af3e1a73c00c` was also cleaned up.
The shared setup selector now matches Cards/Dice and all four helper tests pass.
This establishes the tested reveal and Run Back flow, not the exact historical
head-to-head freeze or a live timeout/rejoin acceptance result.

Final local validation: 2,883 source tests exercised across 414 files. The
only failure was a source-text assertion for the old inline HOLM predicate;
it now asserts the shared predicate, and all five tests in that file pass on
rerun. The other 2,882 source tests passed in the full run. All 241 harness
tests pass, as do application TypeScript, production Vite build and diff
whitespace checks. Existing Browserslist/chunk and React test act warnings
remain. No unrelated files or credentials are included in the release.

Database installation and complete installed rollback proof are finished.
The authenticated HOLM read and local full-shell SCC clearance pass. Smoke the
published build with refreshed
clients: dealer draw retirement into 357, SCC rolls/holds, HOLM timeout and
rejoin across a hand boundary, real-money last-present-human pause, and HOLM
winner/loser continuation without refresh. Verify reconnect and authorized
resume separately. Historical sessions remain frozen; use fresh sessions.
All four incidents remain outside Jeremy's production acceptance.

The missing original screenshots and absence of a client presentation trace
limit historical attribution. Do not turn the demonstrated HOLM source-level
stall path into a claim that Hap's exact browser failure is proven resolved.
