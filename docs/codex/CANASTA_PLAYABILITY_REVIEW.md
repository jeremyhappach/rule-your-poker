# Canasta playability pass — local review only, October 22, 2026

The later approved felt-summary and fan refinement is documented in
[CANASTA_SUMMARY_REVIEW.md](CANASTA_SUMMARY_REVIEW.md); its rendered checks
supersede the nonoverlapping tile presentation described below.

No main integration, push, production mutation, migration, deployment or admission
change is authorized for this pass. Live Canasta remains the separately qualified
`dc894c3cfbd3da7a30c310271e90396ed93b25b8` with play-money-only admission.
Golf owns the production lane. Owner review is required before any release.

## Diagnosis and correction

`CanastaArtifacts` rendered noninteractive pile faces. `HandEditor` hid the hand
behind Arrange, paged one row at a time, and put draw/submit under Finish.
`CanastaGame` already owned drafts, receipt retries and the synchronous busy guard.
Those authority boundaries are preserved; no gameplay rule or timing change is made.

- Stock and discard controls render in the artifact owner's canonical felt slot.
  Stock invokes the existing draw command once; discard opens the exact count and
  Yes/No confirmation. Invalid qualification explains what to select; only a legal
  selection enables Yes. Only the public top card/count/freeze state is used.
  Empty stock clearly offers End hand only when the shared guidance permits it.
- All physical cards render in MY in stable rank/suit/physical-ID order. There is
  no Arrange popup, rank filter, sort menu, or Next/Previous paging. Duplicate
  copies remain independently selectable. Full-size targets stay at least 44px.
  Continuous overflow, with a visible Scroll cue, handles larger/compact layouts.
- Public opponent melds render as rank/count and canonical card fans on the felt.
  Smaller discard sits left of stock at bottom-center. Observers retain read-only
  piles; private opponent cards are never rendered.
- Melds lists committed groups and local additions, explicit Add selected to rank
  targets, validation/opening progress, wild reassignment, Unassign selected and
  Cancel draft. Marking a discard removes that physical card from any draft.
- Done submits a valid ordinary turn. Go Out submits a valid final discard or
  no-discard meld-out using the same shared turn plan and server command. Pending,
  paused, inactive, expired and automatic seats retain their existing guards.
  Cancelling a draft cannot undo a committed draw/pickup. Reconnect keeps authority.

Touched runtime owners are limited to the four Canasta components and Canasta CSS.
No shared shell, reducer, server, bots, scores, stake, settlement or recovery owner
changed. The table's pile-slot ref lets the existing draft owner provide controls
without another action owner or another table/HUD.

## Actual local review

Start: `node node_modules/vite/bin/vite.js --config dev/canasta/vite.config.ts --port 4338`

Open `http://127.0.0.1:4338/playability.html`. It provides 15/30/60/71-card scenes,
fresh stock draw, frozen pickup, existing-meld extension and both going-out cases,
with four viewport choices. Reset fixture restarts the local match.

Scenes are explicitly synthetic presentation/action fixtures. They conserve all
108 cards and use the actual `CanastaTable`, shared reducer, private projections
and local HTTP transport. The old separate review transition implementation was
removed. The 71-card count comes from the existing maximum-hand witness; the
display fixture is not represented as a newly played full historical match.
Production database/audio aliases remain isolated by the existing review config.

## Evidence and limits

- 64 focused Canasta rule, authority, recovery, bot and terminal tests passed.
- Application TypeScript passed; the actual-table local Vite build passed.
- `dev/canasta/playability-browser.mjs`: 16 rendered combinations (15, 30, 60,
  71 cards × 390×844, 430×932, 320×568, 812×375), physical-ID uniqueness,
  44px targets, containment/no horizontal page overflow and continuous access.
- Browser actions passed: duplicate-copy selection, invalid drafts blocked,
  multiple drafts, wild reassignment, cancellation without commit, rapid stock
  taps producing one draw, frozen pickup Yes/No with opening qualification,
  unchanged deadline after draw/pickup, committed-pickup reconnect, existing-meld
  extension with Done, and Go Out with/without a discard. No page errors.
- `dev/canasta/playability-capture.mjs` verifies the final visible scroll cue and
  captures 15 cards plus the top/bottom of a 30-card hand. Modal screenshots use
  completed CSS animations so the images show the settled readable dialogs.

All 15 cards are simultaneously visible in the normal 390×844 and 430×932
portrait MY area. At 320×568 and short landscape, the canonical pane cannot fit
the full hand plus controls at these tap sizes; continuous scrolling is used,
including for 15 cards. This is an explicit review limitation, not a claim of
all-card visibility on every screen. Larger hands similarly scroll in one surface.

Evidence: `qualification.local/canasta/playability/browser.json`, `15-390.png`,
`30-390.png`, `30-bottom-390.png`, `maximum-390.png`, `15-320.png`,
`pickup-confirmation.png`, `add-to-meld.png`, `out-ready.png`, `out-meld-ready.png`.
The browser evidence JSON is also retained beside this document.
These are desktop mobile-emulation checks; owner/physical-device smoke is pending.

## Follow-up: red threes, wild visibility and meld order

The owner requested readable opponent wild cards, hand twos after Jokers, and
own red threes first, followed by canastas and remaining melds in rank order.
This local-only refinement builds on candidate
`7243e742ebad0b82ef8bf0c4772bade588eb6060`; it changes no authority or admission.

Verified existing red-three behavior:

- `engine.startHand` deals alternately, exposes dealt red threes, and repeatedly
  replaces them until each hand has 15 non-red-three cards. Replacement red threes
  are exposed too, before the initial discard pile is processed.
- `rules.initialPile` buries an initial red three/wild and turns another card.
  Red threes freeze that pile until the whole pile is legally acquired.
- `rules.stockDraw` exposes red threes and continues toward two ordinary cards.
  At stock exhaustion one ordinary card still permits the final turn; zero
  ordinary cards ends the hand immediately, including a tail of red threes.
- Committed `pickup` exposes buried red threes without drawing replacements.
  The new authority fixture proves unchanged stock, preserved physical identities,
  public red-three projection and conservation of all 108 cards.
- `rules.handScore` assigns 100 per red three, or 800 for all four, positive with
  at least one meld and negative without one. They are separate from black-three
  melds and cannot be ordinary draft meld cards or discards.

Existing rule/engine tests cover initial-upcard handling, dealt replacement,
stock tails and signed scoring. No core-rule conflict was found in these paths;
the missing behavior was their presentation in Your Melds.

`presentation.ts` owns display sorting only. It leaves the frozen comparator
used by timeout completion/bots intact and retains physical IDs for duplicates.
Only committed canastas receive canasta classification and sorting priority;
local drafts remain visibly identified. Natural/mixed labels use existing wild
classification. Canonical card rendering, shell geometry and transport remain
unchanged.

Opponent felt cards now have nonoverlapping faces and explicit labels. The
existing Melds dialog includes Your/Opponent controls and a full-size wrapped
opponent view. At 320×568 the felt only previews part of a meld; at 812×375 the
existing safe-area admission omits the felt preview. The dialog provides every
card at both sizes with ordinary scrolling, without shrinking identifiers.

Choose **Red threes, canastas and wilds** in the local review wrapper. This is a
synthetic 108-card-conserving display fixture with four red threes, natural and
mixed canastas, ordinary groups deliberately supplied out of rank order, and a
hand containing duplicate wild types. It uses the actual table, shared reducer
and public/private projections, not a second rules implementation.

Qualification: 67 focused Canasta tests, application TypeScript, local preview
build, existing playability regression, and `dev/canasta/melds-browser.mjs`.
The new browser check covers 390×844, 430×932, 320×568 and 812×375, physical-ID
order, no opponent tile overlap, explicit wild labels, own row order and access
to all 14 opponent fixture cards. Images and JSON are under
`qualification.local/canasta/melds/`; browser JSON is retained as
`CANASTA_MELDS_BROWSER.json`. Screenshots include `opponent-390.png`,
`own-top-390.png`, `own-bottom-390.png`, and the corresponding compact layouts.

The production reference available in this thread remained signed out after
refresh. A side-by-side production outline/background comparison is not claimed.
The in-app browser also rejected acquisition of the existing localhost review
tab through its URL policy; no bypass was attempted. Independent local browser
tests and their saved screenshots supplied the rendering evidence.

No main integration, push, migration, deployment or production mutation. Stop
for owner interaction review; physical-device acceptance remains outstanding.
