# Expanded Session Results history scrolling — September 13, 2026

Jeremy reported that an expanded hand would not scroll and confirmed the entry
point as Lobby → Session Results → Hand History. This is a regression from the
approved canonical-history release `597d22a5a`, corrected within that scope.

The new HandHistory wrapper used `h-full overflow-y-auto`; Session Results gave
it only a minimum height, inside an unconstrained fixed dialog. Thus history's
height grew with its content instead of overflowing. The modal's page scroll
lock left the offscreen content unreachable. The earlier browser check mounted
the renderer alone and did not exercise this containing dialog.

The correction changes only SessionResults layout while history is selected:
cap the dialog to its containing screen height with the established margin,
use an auto header row and a `minmax(0,1fr)` history row, and allow the history
slot to shrink. HandHistory remains the scroll owner. Shared history data,
game-table history paths, ordinary Session Results and Chat layouts are unchanged.

`node scripts/verify-hand-history-scroll.mjs` bundles the actual SessionResults,
HandHistory and canonical view with the repository's CSS. Only Supabase data is
replaced by a local fixture; the browser cannot contact external services.

Before correction (`--expect-blocked`), a 1,369-pixel history had equal client and
scroll heights. At 390×844 the dialog extended from -309.5 to 1153.5 pixels.
After correction, it remains inside the screen from 16 to 828 pixels, with a
718-pixel scrollport. Wheel and real browser touch input both move scrollTop.
The last hand can be reached and expanded while the header and Close remain
visible. These checks also pass at 844×390 and 1280×900, without horizontal
overflow or page errors. Evidence is in `artifacts/hand-history-scroll/`.

Local `npm run build` passes: TypeScript, app/harness tests and production
bundle. After Vercel publishes the
correction, Jeremy should refresh, reopen the same lobby history, expand a long
hand and scroll through its ending stacks and the following hands. That smoke
remains the final acceptance step.
