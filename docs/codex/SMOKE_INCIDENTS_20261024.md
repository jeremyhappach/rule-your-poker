# October 24 multiplayer smoke — investigation checkpoint

Status: incomplete; one local client correction, no publication or production
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
This is a source-backed collision risk, not yet a measured reproduction on the
reported viewport. No geometry change made. Next: measure the actual small-
phone dice and pot bounds, then position the pot through existing canonical
geometry with explicit separation; preserve Horses, Yahtzee and other layouts.

### 3. mcru81 timeout/rejoin

User UUID `e13e2dd9-6b38-4073-a313-2286877af40c`; player UUID in this session
`a3052c46-393f-424c-a8ac-d54076442954`. Current row has auto_fold=false,
sitting_out=false, waiting=false and sit_out_next_hand=false. These current
flags do not establish whether a prior request failed. Other October 24
sessions exist for this user, including real-money incident sessions already
frozen by earlier work; do not conflate them.

No matching checkbox attempt/timeout record was found in the inspected
session events, participation debug log or player-specific timeout diagnostics.
The named session has no private replay stream. A question is pending for
Jeremy identifying the game in which this happened.

Checkbox path: MobileGameTable/HorsesMobileCardsTab -> Game.handleAutoFoldChange
-> sessionPlayerIntent.setAutomaticPlay -> deployed public.set_automatic_play.
It is a real RPC, not only a local toggle. The server validates session,
dealer game, hand, round and participation CAS; rejects completed/stale rounds;
and defers dice takeover release until the actor's turn boundary. The 357
client already reads a fresh atomic frame; other games submit the rendered
round plus a fresh intent version. A stale presented round is therefore a
possible rejection cause, but is not established for this report. No timeout,
pause, bot, authorization or participation policy was changed.

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
Later hands exist, so the server did continue. The report says the viewer lost,
while the matching hand records Hap winning. Jeremy was asked to identify the
frozen viewer before attributing it to winner/loser-specific behavior.

The failure boundary is client presentation/acknowledgement rather than missing
settlement. Exact local failure remains unproved. One concrete source concern:
Game's continuation effect admits through live games.awaiting_next_round but
reads result/identity from held holmView; the live flag can clear while a local
predecessor remains held. Other gates include exact community reveal and ledger
cursor receipts. Do not bypass any of these or introduce a repair timer without
a focused reproduction. No HOLM patch made.

## Shared cause and validation

No common cause across all four incidents is established. The duplicate
dealer-card renderer is distinct from the HOLM continuation barrier. Stale
presented identity could link HOLM and rejoin, but that remains a hypothesis.

The local high-card correction passed 66 tests across seven focused files:
MobileGameTable dealer receipt, useSessionDealerDrawReceipt,
useHighCardDealerSelection, sessionDealerDrawPresentation,
sessionDealerDrawTieHarness, sessionPlayerIntent and holmPresentationBarrier.
The new ownership assertion forbids dealer cards in the gameplay hand pane;
existing hook tests cover live transition, ties, cold entry and stale receipts.
Application TypeScript, the Vite production build and git diff --check passed.
The build retained existing Browserslist/chunk warnings. This is not viewport
or production acceptance. No dependencies were installed; the isolated
worktree reuses the existing node_modules through a junction.

## Remaining work

Resume timeout/rejoin and HOLM first once the affected game/viewer is identified.
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
