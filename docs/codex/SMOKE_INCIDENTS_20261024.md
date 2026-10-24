# October 24 multiplayer smoke — investigation checkpoint

Status: incomplete; local correction candidates, no publication or production
mutation. Base: `48c26110e23b13727e208bfb8177c06c5699e492` (`origin/main`).
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
This is a source-backed collision risk, not a measured reproduction on the
reported viewport. The local `SccPotPosition` candidate resolves the existing
SCC dice descriptor and puts the same pot above its envelope, in the same
canonical felt coordinate frame. It reserves that position between rolls and
leaves Horses, Yahtzee and other pot layouts unchanged. It does not change
the pot amount, chip authority or dice rules.

The offline fixture `dev/oct24-smoke` renders the real pot, dice, fitter and
geometry components. `.codex/scripts/oct24-smoke-geometry.mjs` passed 14 checks
at 320x568, 375x667, 390x844, 430x932, 667x375, 768x1024 and 1280x800, with
unheld and SCC-locked states. Ninety animation frames per state checked actual
rendered die rectangles against the pot; no overlap or page error occurred.
The fixture does **not** reproduce the original overlap with the legacy pot,
and its landmarks are synthetic rather than the complete shell/seat ring.
Full-shell announcement/seat clearance and original-viewport reproduction
remain release gates. Screenshots and measurements are local evidence under
`.codex/evidence/oct24-smoke`; do not claim production acceptance from them.

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
budget; this session inherits the defaults. Jeremy clarified that real-money
strategic games pause on the first timeout, while Horses and SCC retain bot
play because their decisions are mechanical. This correction scopes the policy
change to HOLM/357 and does not infer changes to other games.

Candidate `supabase/policies/real_money_poker_timeout.sql` changes only the two
qualification checks inside the existing private pause guard. A real-money
HOLM/357 human on automatic play now qualifies immediately; fake money and
other games retain the aggregate threshold. Deliberately enabling automatic
play is covered by the same guard, so it cannot bypass the real-money pause.
Existing producers still validate expiry/actor/identity and mark timeout intent
before any decision. Existing pause authorization, locks, deadline renewal,
recovery-context restoration and continuation guards are preserved. Reclaim
clears automatic intent; only explicit authorized resume restarts the match.

The complete candidate proof ran successfully on production under BEGIN/ROLLBACK,
using only generated fixtures. It composes existing HOLM winner/tie/terminal,
authorization, settlement and replay proofs, the fake-money aggregate timeout
proof, plus first real-money HOLM/357 expiry, unchanged money/actions/rounds,
duplicate and late delivery, unauthorized/stale reclaim, valid reclaim while
paused, stale/valid host resume, and real-money Horses/SCC exclusion. No candidate
definition or fixture persisted. Runner:
`.codex/scripts/build-real-money-poker-timeout-proof.mjs`. The candidate remains
unregistered/uninstalled; no CLI is installed and tool-install permission is
pending under the repository's installation rule and Supabase skill workflow.

Client candidate `sessionPlayerIntent.ts` now reads HOLM's published round and
the participant's intent version in a single PostgREST embedded read, with
actual deployed foreign-key names. It selects the exact dealer/hand/round,
rejects a completed or missing published hand with a preparation explanation,
and keeps the existing one-retry stop-only/CAS rule. It never retries an
uncertain write, overwrites a competing participation version, or resumes a
paused game. The new embedded read still needs authenticated HTTP qualification;
unit mocks alone are not that evidence.

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
it was the sole gate blocking Hap's browser. Multi-client runtime qualification
remains required.

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

The affected game, viewer and intended timeout policy are now identified.
Package/register the proven SQL candidate after the pending tool decision,
then apply it once and rerun the complete proof. Qualify the new HOLM embedded
read over authenticated HTTP, full-shell SCC clearance and live HOLM presentation
progression. Continue from the exact identities above without broad discovery.
Attach the original three screenshots to preserve viewport and client evidence.
Reproduce exact rejected participation and held-HOLM progression, implement only
the demonstrated defects, then qualify fake-money/real-money boundary policy,
winner/loser progression, reconnect, and mobile geometry. All four incidents
remain outside production acceptance. The local high-card correction also needs
published multi-client smoke. No main integration, push or deployment occurred.

This checkpoint honors the execution-budget circuit breaker. Remaining work
requires incident-specific reproduction, not mechanical application of an
accepted reference pattern. Continue from these exact owners and identities;
do not repeat broad repository/history discovery.
