# Blue Hour gameplay shell — local review

Run `node dev/blue-hour/server.mjs` in this worktree, then open
<http://127.0.0.1:5198/dev/blue-hour/compare.html> for Holm and Cribbage side by
side in 390 × 844 frames. Individual phone views are `/?game=holm` and
`/?game=cribbage`. This loopback-only fixture mounts the real shell and gameplay
components with isolated local data; its transport never contacts Supabase.
Header account controls and game submissions are fixture placeholders.
The fixture is outside the production import graph.

The supplied `Holm and Cribbage, Three Midnight Themes.png` center column is
the finish reference. The current implementation remains the geometry
reference. `src/lib/canonicalShell/blueHourShell.css` supplies the shared
navy/ivory palette, blue light and muted amber reflections. The reflection
field is CSS, with no second bridge, new bitmap, animation or overlay layer.
Canonical felt paint, geometry, seat/chip/card owners, action/status tokens,
disabled opacity and handlers are unchanged. The body's tab portal receives
the same palette explicitly; the existing cross-game dissolve stays navy.

## Verification

- TypeScript (`npm run typecheck`), 36 existing shell/lifecycle/tab/timer
  tests, Vite build and 90 MB static-size gate passed.
- `bunx tsgo --noEmit` was unavailable (registry 404); the installed repository
  TypeScript script was used. No dependencies or tool installations were added.
- Before/after browser measurements at 390 × 844 and 320 × 568 matched for
  all 187/183 Cribbage elements. Holm's 160 elements matched except for the
  existing Buck marker's animated vertical position (two nested elements);
  its anchor, size and all other positions are unchanged.
- Fold stays `rgb(239,68,68)` and Stay `rgb(34,195,93)`. Cribbage's disabled
  Send to Crib remains gold `rgb(255,191,0)`, black text, opacity 0.5 and
  disabled until two cards are selected. The announcement blue, timer green,
  chip colors and card faces remain owned by their current components.
- The existing short-phone Cribbage hand crop is present before and after;
  this presentation-only pass deliberately preserves that geometry.
- Screenshots and geometry JSON are under `qualification.local/blue-hour/`.
  `compare.ps1` places those screenshots beside each other and beside
  aspect-preserved crops of the supplied Blue Hour reference. It does not
  modify gameplay artwork.

No production publication. Review on `codex/blue-hour-gameplay`.
