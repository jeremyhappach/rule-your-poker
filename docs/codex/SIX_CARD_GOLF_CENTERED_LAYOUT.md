# Golf centered layout — October 21, 2026

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
