# Canasta mobile checkpoint — corrected local review

This branch is a local, isolated interaction review. No catalog, route admission,
database migration, live RPC, financial write, production deployment or main
integration is authorized at this checkpoint. Main remains unchanged.

## Owner inventory completed before edits

- `PlayingCard`: shared by Holm/3-5-7, community/Chucky, Gin, Cribbage, Run21,
  TriTowers, Take Two, Royal Flash and Trip Flip. Explicit opt-in Joker prop;
  standard Card/Rank/Suit and all evaluators unchanged.
- `resolvedCardFace`: unchanged standard/masked validation. New physical-card
  wrapper validates suitless Joker separately without accepting fabricated suits.
- `CardTransportProvider` and `CardTransportRuntime`: persistent shell, Holm/Gin/
  Cribbage/3-5-7 orchestrators and deal runtime. Separate flight/card IDs preserved.
  Joker is opt-in; ordinary visibleFace and existing manifests remain compatible.
- `ActiveHandFan`: Holm/3-5-7, Gin, Cribbage, PlayerHand, MeasuredActiveHandFan,
  admin hand layout. Not edited: arbitrary large hands require a scrollable tray
  in canonical row four, using the same PlayingCard primitive, not a compressed fan.
- `PersistentTableShell`, `CanonicalSeatCluster`, `ShellHudGrid`, shell tab,
  announcement, timer, chip and card transport owners are imported, not duplicated.
- Geometry uses existing container-relative safe-felt exclusion solver. No
  product viewport-specific rules or shell row retuning.
- New rule predicates live in `src/lib/canasta/rules.ts`; fixture identities and
  UI-only scene assembly live under `dev/canasta`, outside production routing.

The original checkout has an active Six-Card Golf branch and unrelated changes.
This work uses a separate managed worktree from a150cd6ae. Shared-owner changes
must be reconciled with that work before eventual integration, not overwritten.

## Review

From this worktree:
`node node_modules/vite/bin/vite.js --config dev/canasta/vite.config.ts`

Open `http://127.0.0.1:4327/mobile.html`. The wrapper offers five real iframe
viewport sizes, including portrait/landscape; the inner app uses the actual shell.
No environment file is loaded. Any accidental Supabase/auth call throws.
Existing dependencies are reused through a junction; nothing was installed.

Scenarios cover 15/30/60 cards, duplicate selection and sorting, Joker allocation,
opening feedback, frozen pickup, final discard/out, cancellation and reconnect to
the committed fixture. Clock presentation uses the canonical timer owner.

**Superseded first-checkpoint limitation:** 104 (all non-red-three cards) is an absolute physical
stress bound, not a proved maximum-reachable hand. The scene labels this
explicitly and supersedes the initial 88-card measurement. It tests capacity
beyond any legal hand without imposing a new gameplay cap. Exact reachable maximum
still requires an executable full-deck legal-action witness; it is not proved
by the layout fixture. That requested evidence remains outstanding.

Fixture commit/reconnect uses versioned local session storage, not a claim of
database receipt/recovery qualification. Financial/recovery/full-match proofs
are deliberately not implemented before interaction acceptance.

Canonical AudioManager and card-swoosh cue are wired to accepted fixture flights,
with offline-only preferences and a review mute control. No profile access occurs.
The mounted shared celebration owner is retained; no fixture fabricates a match
winner or payout from a single hand going out.

## Validation recorded October 20

- 82 tests in seven focused files pass: 21 Canasta boundary fixtures plus standard
  card-face, hidden/masked rendering, highlights, Joker and manifest regressions.
- App TypeScript and `dev/canasta/tsconfig.json` pass using installed TypeScript.
  `tsgo` was unavailable; no tool or dependency was installed.
- Isolated Vite production bundle passes. This is a local build, not a deployment.
- Browser interaction verified: one duplicate remains selected after sorting;
  Joker reassignment produces two drafts and flags the now-invalid two-card
  source group; frozen pickup rejects 30 against a 50 opening, accepts the
  added three aces and retains the countdown; final discard legally ends the
  two-canasta fixture; reconnect retains 30 committed cards/revision 2 while
  clearing an unsubmitted draft.
- `evidence/canasta-mobile/layout-matrix.json` records actual DOM measurements.
  `capacity-104-matrix.json` adds ten final capacity checks, with and without
  safe-area envelopes. The earlier 88-card rows remain labeled historical
  intermediate measurements rather than being silently rewritten.
  Five iframe viewports: 320×568, 375×812, 430×932, 812×375, 932×430.
  One shell, distinct physical IDs, 52×approximately 90 CSS-pixel card targets,
  no document-level horizontal overflow. The workspace scrolls inside row four.
  Safe-area envelopes reserve explicit test chrome; physical Safari's native
  safe-area and touch behavior remain owner acceptance, not claimed here.
- Compact/landscape arrangement requires vertical workspace scrolling plus a
  horizontal hand strip. This is intentionally presented for interaction review,
  not declared an accepted final interaction.

## Acceptance and release gates

- Frozen contract: `CANASTA_CONTRACT.md`.
- Focused unit evidence and rendered evidence: recorded below when run.
- Owner interaction review: PENDING.
- Maximum hand: 71 after pickup / 70 after discard. Shared-predicate witness and mathematical bound pass; full authority reducer proof remains later work.
- Full gameplay/authority, bot matches, privacy, concurrency, recovery,
  both-money financial rollback, terminal and production qualification: MISSING.
- Production admission: CLOSED / no Canasta admission added.
- No production publish at this checkpoint.

## Bounded correction, October 20

- Canonical header markup is extracted without changing route-owned actions.
  Production Game and this fixture share CanonicalTableHeader. The fixture uses
  CanonicalPlayerIdentityRow; session controls are visibly disabled offline.
- Presentation snapshot is read-only production evidence: canonical_shell_layout
  top 2 / bottom 8; shell_nameplate and shell_chip_balance values are captured in
  dev/canasta/presentation.ts and applied through registered canonical owners.
  No shell/global geometry is retuned. Matching shell/global geometry_overrides
  query returned no rows. Personal visual preferences remain explicit defaults,
  not a claim to reproduce Jeremy's saved profile.
- Canasta gains a canonical fixed-stake felt plate. No catalog/admission changes.
- Hand arrangement uses the existing shared Dialog, with rank filtering and
  container-measured card pages. Card faces stay 48 by 68, selection targets
  56 by 84; fixed navigation, footer actions and close control are at least 44.
  Compact felt areas omit piles that cannot fit full cards; pickup remains in
  the editor. There is no scrollable felt or nested hand-strip scrolling.
- The maximum scene consumes the actual 71-card witness. See CANASTA_MAXIMUM_HAND.md.
  The 104-card stress scene remains separately labeled.
- Browser checks cover duplicate selection through sorting, multiple drafts,
  wild reassignment exposing an invalid source meld, opening rejection then
  accepted frozen pickup, local committed-revision reconnect, and legal final
  discard. Timer was not reset by these operations.
- legal-71-layout-matrix.json records every physical card page at five viewports,
  with/without safe-area envelopes. Audits inspect clipping through ancestor
  bounds, target size and hit-test overlap, not only element rectangles.
- These remain desktop-browser viewport/envelope checks. Native iPhone Safari,
  touch gestures and owner interaction acceptance remain outstanding.
- Complete authority, live network recovery, bot matches, financial qualification,
  release and admission remain out of scope. No merge, push or deployment.

Validation for correction: 59 focused tests passed, including three maximum-hand
and three presentation regression tests; application and fixture typechecks and
local Vite bundle passed. Ten all-card-page audits and ten safe-area draft/finish
control audits passed (zero clipping, target, overlap or scrolling failures).
Hit testing uses button centers and points 8px inside rounded corners; ancestor
intersection separately checks full target bounds. Original evidence above is
historical; legal-71-* and *-corrected images are the corrected checkpoint.

Development limitation: hot replacement while a dialog was open produced a portal
cleanup error during editing. A clean reload rendered successfully with no new
console errors. Use a clean reload when reviewing a changed checkpoint.

## Appearance correction, October 20

The preview forced `html.dark`, while the authenticated production table uses
the default light document theme. The mobile review wrapper also supplied its
own dark background and black safe-area envelope. Those preview overrides are
removed. The wrapper now imports the application's `index.css` tokens, and the
editor controls use canonical background, foreground, border and focus tokens.
Felt pile labels retain white text for contrast against the dark shared felt.

The user opened the production Cribbage table for comparison. Both the rendered
production table and local Canasta use CanonicalFeltSurface's exact 2px
`rgb(120, 53, 15)` amber border, white page background, bridge image at
`center 38%` / opacity 0.28, and gradient from rgb(26,26,26) to rgb(10,10,10).
The border is canonical, not a review/debug outline; no shared border change is
made. Production build inspected: 44dbd5a7d4de4635b258f731558fe346473d82b9.

`dev/canasta/comparison.html` places the captured production table beside the
live local fixture at the same 461 by 604 viewport. See
`evidence/canasta-mobile/appearance-side-by-side.png`. This proves appearance
parity for the page, felt and outline, not identical game content or seat
projection: the reference is Cribbage and the fixture is Canasta.

Validation: fixture TypeScript and isolated Vite build pass. Portrait 375 by 812
and landscape 812 by 375 with a safe-area envelope expose all 71 physical cards
with zero target-size, clipping, overlap, overflow or nested-scrolling failures;
see `appearance-layout-audits.json` and `appearance-editor-landscape.png`.
Existing Browserslist age and bundle-size advisories remain. No rules, database,
production settings, admission, deployment or financial behavior changed.
