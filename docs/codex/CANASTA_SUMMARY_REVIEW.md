# Canasta summary and fans — local review, October 22, 2026

Approved continuation from `d4546c03b8af54aecefab5a7f28c1619e16fa3c2`.
No main integration, push, migration, deployment, admission or production mutation.
Golf and Canasta's play-money-only availability are outside this local change.

## Result

- Opponent felt cards are replaced entirely by compact count × rank buttons.
  N means natural; W2 means two wild cards; C and a distinct outline mark a
  completed canasta. Incomplete melds have no C. A tap inspects the actual cards.
  There is no opponent heading, per-card caption or repeated canasta sentence.
- Actual cards remain in the hand and both detail views. One Canasta fan owner
  wraps rows at fixed card size, preserving physical IDs and exposed selection
  targets. Red threes remain first, committed canastas next, other groups by rank;
  hand Jokers precede twos. Draft marks remain separate from committed state.
- Piles sit lower and closer, discard left/stock right, with no control border.
  Keyboard focus remains visible. Canonical card-back artwork is unchanged.
  Pile cards adapt to the measured felt's height; action targets stay at least
  44px. Empty-pile placeholders use the same dimensions. Frozen status remains
  in the accessible label and pickup explanation, with a compact snowflake cue.
- A Canasta-only exclusion solver reserves the canonical title, chip, score,
  name and opponent card-count bounds. It packs summaries and pile controls
  together inside the felt ellipse without moving the shell or seats. At short
  landscape the summary becomes a narrow scrollable column beside the piles;
  all melds remain accessible in the existing detail view too.

## Geometry Lab

The existing Geometry Lab now offers a Canasta section, using its existing
modal draft, Apply/Cancel, registry and realtime ownership. No dummy anchored
descriptors or game-catalog changes were introduced. New domain:
`canasta_presentation`. Defaults: 48px card width; 0.14 hand/detail overlap;
0.86 maximum summary width in felt units; 0.94 preferred pile bottom; 0.16
pile gap in 44px card units. Overlap is capped at 0.14 and interactive exposure
is at least 44px. Placement may move inward to respect shell exclusions.

Runtime owners: `src/components/canasta/{CardFan,CanastaArtifacts,HandEditor}.tsx`
and `geometry.ts`; the admin control is `CanastaGeometryPanel.tsx`. The shared
Geometry Lab receives only the Canasta selector/panel integration. Shared card
faces, rules, deadlines, privacy, commands, recovery and finances are unchanged.

## Qualification and review

- 100 focused tests across Canasta, geometry bounds/packing and draft cleanup,
  existing catalog and Run21 geometry; application TypeScript and preview build.
- Existing playability browser regression: 16 combinations of 15/30/60/71-card
  hands and four viewport sizes, plus actual shared-reducer actions and recovery.
- `dev/canasta/summary-browser.mjs`: four rendered sizes (390×844, 430×932,
  320×568, 812×375), five summary rows including two canastas, summary-to-card
  inspection, all 25 opponent card identifiers, direct glyph-bound visibility,
  44px hand targets, duplicate selection, and actual Geometry Lab preview/close
  restoration with selections retained. `melds-browser.mjs` delegates to this
  superseding check.
- Portrait shows all 15 hand cards together; compact/landscape hands scroll.
  Short landscape shows one summary row at a time. Physical-phone acceptance
  remains owner review, not claimed by desktop mobile emulation.

Open `http://127.0.0.1:4338/playability.html`, select **Red threes, canastas and
wilds**, then tap a summary or open Melds. The fixture's header offers the actual
Geometry Lab controls in a local draft-only wrapper. Closing discards preview;
database access is blocked and no Apply persistence is exposed by that wrapper.
All scenes are labelled synthetic and use the actual table/shared reducer.

Evidence: `qualification.local/canasta/summary/{browser.json,table-390.png,
table-812.png,inspect-390.png,opponent-390.png,own-390.png,duplicates-390.png,
geometry-lab.png}` and `CANASTA_SUMMARY_BROWSER.json` beside this document.
The previous in-app browser denial was respected; qualification uses the
existing local test/artifact route. No production comparison or release claimed.
