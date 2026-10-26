# Canonical nameplate and seat placement audit — October 26, 2026

Jeremy approved the Battle31 correction and requested a read-only audit of all
other new games. All multiplayer games should use the canonical nameplate and
seat-cluster placement, with 357 as reference. Only Battle31 is corrected here;
other game code, production configuration and databases were not changed.

## Reference and scope

357 renders CanonicalSeatCluster with namePlacement="above-chip", projected
slots from SeatAnchorLayer, and no keepNameInward override
(src/components/MobileGameTable.tsx, render357CanonicalSeat). The cluster reads
shellNameplateConfig for anchor, attachment and chip-relative offsets. The
canonical seat coordinate frame spans the shell column; felt paint width must
not replace that coordinate frame (GameplayOpponentSeatLayer and
PersistentTableShell). Reusing the cluster inside a different frame does not
guarantee the same seat placement.

Source audit covers the current local main at f651a34b6, plus the Battle31
candidate based on 205d18169. Main contains newer Quintzee and Mega catalog
entries absent from the Battle31 branch. Relevant local Canasta playability,
Mega transitions and unreleased Double Solitaire sources were also inspected
read-only. This is a source ownership audit, not fresh production screenshots
or runtime certification for every game. No remote release status is inferred.

## Findings

| Game / presentation | Nameplate and cluster result | Evidence / recommendation |
|---|---|---|
| Battle31 local candidate | Corrected to match 357; chip and seat anchors preserved | Battle31View uses inwardCardContent. GameplayOpponentSeatLayer keeps the card attachment but no longer enables keepNameInward for this caller. |
| Six-Card Golf | Canonical seat frame, overridden nameplate | GolfTable.tsx:132 sets inwardSeatContent, which forces keepNameInward. Apply the same card/name separation in a separately approved correction. |
| Canasta | Canonical nameplate primitive, different seat coordinate frame | CanastaArtifacts.tsx:35–36 mounts clusters in .canasta-seats; canasta.css:2 centers a shell-felt-w-wide frame. Canonical frame is full column width. Move ownership to the shared seat layer without changing logical seats; verify meld-content space separately. Same issue is present in the inspected playability worktree. |
| Race Poker | Custom player/score/balance strip, no canonical gameplay cluster | RacePokerView.tsx:62 and RacePokerTable.tsx:14. Preserve score/race content; migrate identity and chip endpoints to canonical clusters. |
| 11 Up | Custom score pills with name/balance, no canonical gameplay cluster | ElevenUpView.tsx:27 and ElevenUpTable.tsx:15. |
| Trip Flip | Custom score pills with name/balance, no canonical gameplay cluster | TripFlipView.tsx:57 and TripFlipTable.tsx:15. |
| Boxdrop | Custom score pills with name/balance, no canonical gameplay cluster | BoxdropView.tsx:43 and BoxdropTable.tsx:15. |
| Take 2 | Custom player strip, no canonical gameplay cluster | TakeTwoView.tsx:65 and TakeTwoTable.tsx:15. |
| Royal Flash | Custom player strip, no canonical gameplay cluster | RoyalFlashView.tsx:51 and RoyalFlashTable.tsx:15. |
| TriTowers | Custom scoreboard/balance endpoints, no canonical gameplay cluster | TriTowersView.tsx:30–49 supplies board scores and financial endpoints. |
| Quintzee | Custom player strip, no canonical gameplay cluster | Current-main QuintzeeView.tsx:27 and QuintzeeTable.tsx:20. |
| Run21 table presentation | Canonical placement, no nameplate override found | Run21GameTable.tsx:109 uses GameplayOpponentSeatLayer with dealer and balance accessors only. |
| Run21 fullscreen presentation | Scoreboard replaces the table branch and its clusters | Run21GameTable.tsx:124 selects Run21FullscreenView; its line 38 supplies Run21Scoreboard. Include in fullscreen multiplayer migration. |
| Cribbage, Gin Rummy, Yahtzee, Farkle | Canonical shared layer, no nameplate/seat override found in the inspected paths | Each uses GameplayOpponentSeatLayer with authoritative positions; no inwardSeatContent or publicTableau opt-in. |
| Mega Card Golf | Not applicable to opponent-seat placement | Current catalog mega-card-golf.ts specifies exactly one player, solo selection and no money modes. The GolfTable found in its worktree is Six-Card Golf, not proof of a Mega multiplayer override. |
| Double Solitaire (unreleased worktree) | Custom score strip and balance endpoints | DoubleSolitaireView.tsx:54 and DoubleSolitaireTable.tsx:14. Same migration recommendation before canonical multiplayer acceptance. |

FullscreenGameShell does not create canonical seat clusters itself. Adding
data-chip-center to a text balance supplies a transport endpoint but does not
make its nameplate, chip or seat placement canonical. Solo Arcade views have
no multiplayer seats and are outside this migration.

## Battle31 verification and shared edge case

Regression tests compare Battle31's actual rendered cluster with the 357 prop
path under center and inner attachment settings, including nonzero shared
offsets. Nameplate styles and cluster classes match. The existing Golf opt-in
and other family defaults remain unchanged. Actual-route geometry checks cover
both seats at eight sizes and the three/two/one-life loss presentations.

The current shared upper/center nameplate setting can clip long names at the
screen edge. In the owner preview, Route 3e072b extends 3.57px past the left edge
at 320px and 0.77px at 390px. Its transform now correctly matches the shared
configuration. This is a shared nameplate fitting issue, not permission to move
the chip or restore a Battle31-specific offset. Recommend a canonical width /
truncation policy that preserves the configured anchor and chip position, with
357 and all perimeter seats included in its acceptance checks. No such change
was made here.

## Follow-up order

1. Resolve shared nameplate edge fitting and migrate Golf's coupled opt-in.
2. Correct Canasta's coordinate frame using the existing shared owner.
3. Plan one reusable fullscreen multiplayer identity/seat integration, then
   apply it per game while preserving each game's score presentation and
   canonical financial transport. Do not replace score displays with chip
   values or infer approval for these broader migrations.

All findings above are queued for separate approval. Battle31 remains a local
preview; the existing production hold remains in effect.
