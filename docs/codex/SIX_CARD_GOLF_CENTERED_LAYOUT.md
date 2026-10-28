# Golf centered layout — October 21, 2026

Publication of final candidate `5d2db057` is now owner-approved. See
[SIX_CARD_GOLF_UI_RELEASE.md](SIX_CARD_GOLF_UI_RELEASE.md) for integration and
release evidence; the earlier local-only holds below are historical.

## Card shape and opponent enlargement — latest local candidate

Based on `e77b771794dacb24771593b19da6a77c18effafc`. The reported circular felt
cards were reproduced in the built candidate: `PlayingCard` uses the generic UI
`Card`, whose `rounded-lg` resolves through `--radius: 0.5rem` to **8px**.
The owner landscape's exposed opponent card was 17.73×24.83px and discard was
15.83×22.17px. An 8px radius therefore rounded almost the entire short edge.
Computed clip-path was `none`; this was corner geometry, not a circular mask.

The correction is scoped to `.golf-felt [data-playing-card-root]`: faces and
backs use proportional **10%** corners, matching the canonical active-hand
shell treatment. The scoped override is needed for the back renderer's inline
fixed 4px radius. The stock-count badge is outside that selector and retains its
50% radius. Shared renderers, other games, MY cards and financial chips are untouched.

The centered felt region uses slightly more available width and a larger opponent
card cap. In the actual owner-session captures, opponent width increases from
52 to 55.61px in portrait and 17.73 to 19.16px in landscape (about 7% and 8%).
Opponent art is now 25% larger than pile art. Discard-left / stock-right, 8px
visible pile gap, upper-left count chip and tight centered MY cards remain intact.

19 focused tests, isolated authoritative browser actions, production build and
all 63 rendered geometry cases pass. The browser proof now verifies rectangular
card proportions, corner radius at most 10%, no clip-path and the circular count
badge across every case. Both final owner-session screenshots and four-player
renders were inspected directly. The owner snapshot returned HTTP 200 and
Realtime joined successfully, without page errors or gameplay actions.

Evidence is in `dev/six-card-golf/evidence/rectangular-cards/`, including before
and after computed styles, the before landscape, final PNGs, per-case shape
checks and source/image hashes. This pass changes runtime CSS only; no additional
financial campaign or unrelated game sweep. Physical-device owner approval is
pending. No push, release, migration, admission changes or live-session mutation.

## Subsequent pile refinement — local only

Based on `185ee06493ebc4aa32ed456f266075a4ed6595c0`, Jeremy requested discard
left / stock right, smaller closer piles, opponent cards slightly larger than
piles, tighter MY spacing and the standard upper-left circular stock count.
The final refinement uses a shared size budget: opponent card art is 12% larger
than pile art, visible pile edges are 8px apart, and MY grid gaps are 2px.
All primary targets retain at least 44×44 px. Compact art scales with the
canonical felt; enlarged public views remain available through Info.

`CanonicalCardCountBadge` reuses the established Take 2 / 11 Up circular styling.
Golf is the only new consumer; financial chip rendering and other games are
unchanged. Stock has no visible word label; its accessible button name retains
the action and authoritative count. Discard precedes stock in DOM and visual
order. Pending draws still occupy the actor-private stock-side slot.

The shared default is now in `ARCHITECTURE.md` under Stock/discard convention.
It applies to future work without authorizing unrelated retrofits.

19 focused tests, application typecheck, production build, isolated browser
actions and all 63 rendered geometry cases pass. The geometry proof now also
checks the 12% card-size relation, 8px visible pile gap, left/right order and
count-only stock text. Final owner-session portrait/landscape images and
four-player images were inspected directly. Actual owner capture remained
read-only: snapshot HTTP 200, Realtime OK, no page errors or gameplay actions.
No financial campaign or other-game runtime sweep was repeated for this change.

Final evidence and source/image hashes are in
`dev/six-card-golf/evidence/right-handed-layout/`. The earlier centered-layout
evidence remains intact. Physical-device owner acceptance and release approval
remain pending; no push, deployment, migration, admission or live-state changes.

## Earlier centered-layout candidate

Local review candidate on `codex/golf-interaction-polish`, based on
`5edc96f904dabf71c4192ccf094930131dda1da5`. **No release approval.**
Jeremy rejected that candidate's seat-attached opponent cards and split MY pane.
This supersedes its layout proposal while retaining its opening-interaction fix.

Opponent 2×3 grids now occupy a shared centered region inside the existing
canonical felt interaction layer. The canonical seat owner still renders names,
chips, completed totals and timers separately. Golf supplies only public card
artifacts using canonical cards and the existing transport anchor identities;
no shared shell or other game component changes. Multiple grids retain player
identity through accessible names and the public inspector.

MY contains the horizontally and vertically centered local grid as primary
content. Longer instructions, Rules, Auto-play reclaim, reconnect and the full
score list move into Info. The existing identity row shows a concise status,
hole and completed-hole total. Piles are centered beneath opponents. On short
felts their labels sit beside the piles to preserve card space above. Public
grids remain mounted at the authoritative final reveal; results replace piles.

## Executed checks

- 18 focused tests pass, including opening taps, authority blocking, Info/reclaim,
  public inspection and final-reveal card-anchor retention.
- TypeScript application check and production build pass.
- Isolated authoritative browser actions pass: both openings, private stock draw,
  reload persistence, replacement and discard pickup/replacement.
- 63 final rendered cases pass: 2/3/4 players, every participant viewer, seven
  portrait/landscape viewport sizes. Checks cover MY centering, felt centering,
  title clearance, opponents above piles, unchanged chip anchors, public inspector,
  non-overlap and unobstructed local card targets. Local/pile targets remain at
  least 44 px in both dimensions.
- The final built candidate reads the preserved owner session successfully:
  snapshot HTTP 200, Realtime join OK, no page errors. No gameplay action is sent.
- Final 390×844 and 844×390 owner images were inspected directly, as were the
  four-player portrait, landscape and short-landscape images. Earlier drafts
  with title overlap or overly small compact grids were corrected and recaptured.

Very short MY panes retain contained scrolling. Compact opponent grids can be
enlarged through Info without exposing concealed values. Physical-device owner
acceptance remains pending. The prior native-Auth action campaign and financial
campaign were not rerun for this presentation-only correction.

Evidence: `dev/six-card-golf/evidence/centered-layout/`. `provenance.json` pins
runtime source and image SHA-256 hashes and distinguishes owner-session captures
from isolated four-player fixtures. Direct `library.create_library_file` is not
available in this tool session; no Library IDs can be supplied. Local PNGs are
the review deliverable, without a substitute public upload.

Rules, scoring, stakes, timeouts, action receipts, privacy, SQL, live session data,
financial history and admission flags are unchanged. No push, merge, deployment
or publication. Other releases remain held. The unrelated Cribbage file is excluded.
