# Battle31 owner smoke — local qualification history

The local hold below was superseded by Jeremy's October 26 acceptance and
explicit Battle31 release approval. Other-game audit fixes remain read-only.
See [the release checkpoint](BATTLE31_RELEASE_20261026.md).

Owner authorized the nine smoke corrections on 2026-10-25 and explicitly held
production publication while other work proceeds. Baseline is
33b641bb6d9841764d7af59b27f0c935a2e42fd3. Worktree:
`C:/Users/jerem/.codex/worktrees/battle31-v1/rule-your-poker`, branch
`codex/battle31-smoke-local`. No main integration, push, production migration,
deployment, gate change or activation is authorized by this local pass.

## Completed independent changes

- Single-card exchange submits automatically after one own and one center card,
  in either order. Selection binds viewer/deal/revision/reconnect epoch. Local
  card-ID validation, synchronous duplicate protection, existing immutable
  request retry and server validation remain in place. Movement blocks input.
- Canonical Game Defaults now exposes the Battle31 turn timer. The local-only
  `supabase/battle31/smoke-defaults.sql` changes that row to 30 seconds. Existing
  configure authority freezes it for new matches. Existing match state is unchanged.
  Help uses the actual frozen duration inside a match.
- Removed Swap selected, Exchange cards, rounds-lost scoreboard/seat narration,
  duplicate result totals, and passive playing/revealing helpers. Round results
  retain the existing canonical announcement owner. Automatic final turns now
  use that same owner with authoritative decision-count admission and reconnect
  suppression; the actual-route `--final-turns` check passes.
- Max rounds remaining includes the current uncompleted deal, decreases once
  that deal resolves, and is zero at match completion. The separate Round X/4
  display maps decisions 1–2/3–4/5–6/7–8 to 1/2/3/4. Closing and special results
  retain the authoritative decision pair; no rule or decision limit changes.

## Completed visual corrections

Jeremy supplied one representative PNG directly and confirmed it replaces the
four similar Library references. Its actual pixels were inspected. A local copy
is retained at qualification.local/battle31/owner-smoke-reference.png.

- The original next-deal recording showed stable hand anchors but kept all own
  cards hidden until the center deal finished. Each card now takes over at its
  own canonical destination on settlement; duplicate/retired callbacks cannot
  redispatch or alter successor state. Fixed pane tracks reserve action space.
  Both player recordings prove nine physical flights, zero hand-anchor drift,
  and the complete hand visible while at least two community flights remain.
- Community cards are larger and centered higher, with a separate reserved
  showdown row above. Narrow/large portrait and landscape retain canonical
  felt-relative geometry; no viewport measurement or device-specific patch.
- Own lives share the actual 357 bottom-rail placement. Opponent lives share
  its inner-chip placement on both seat sides. The existing 357 constants were
  extracted to canonicalLegPlacement.ts and reused at both original call sites;
  their offsets and transition remain identical. No 357 rules changed.
- Only the committed lost marker grows to 2.6×, visibly holds, then dissolves
  over 1600 ms within the existing 5100–6900 ms life/dealer interval. CSS seeks
  persisted elapsed time rather than running an extra independent clock. Pause
  freezes it; reconnect seeks without replay. Ties never lose a marker. Third
  loss reveals Last Chance after the marker dissolves; fourth loss dissolves
  Last Chance before terminal presentation. No financial writes were added.

## Local qualification

- 40 focused Battle31/commands/life/canonical-seat/357 tests pass in this pass.
  The prior nine help/defaults catalog tests also pass. The added defaults test follows the
  existing collection-save behavior; it does not introduce a new save owner.
- Installed TypeScript compiler (`tsc -p tsconfig.app.json --noEmit`) and the
  actual-route Vite build pass. `bunx tsgo` was unavailable and its package
  lookup returned 404; no replacement compiler was installed. Diff checks pass.
- Local database `battle31_canonical_1792958804576`: defaults is 30 seconds and
  whole existing match rows have identical digests before/after the update.
  Actual route admission separately proves a new match freezes 30000 ms.
- Actual Game route: HH automatic swaps in both selection orders, all-three
  exchange, knock/stand, both highlights, persisted pause, reload, life loss,
  dealer movement and animated next deal pass. Eight layouts pass bounds checks:
  320×568, 375×667, 390×844, 430×932, 667×375, 844×390, 932×430, 1280×720.
- Human/bot: six moving exchange cards, three concealed arrivals, no private
  hand exposure, no page errors. Terminal: immediate exact 91/109 settlement
  for a nine-chip stake, held visual balances, fourth loss, both highlights,
  one result, Session Ended without artifacts and fresh-entry lobby pass.
- Retry tests preserve one UUID/payload across uncertain response recovery and
  reject stale revisions/scopes, absent card IDs and off-turn submissions.
  A full browser Run Back check now proves new dealer-game identity, fresh
  noncaller consent, zero old cards/lives/transports/selection, concealed opponent
  cards, frozen 30-second turns and no upfront debit in the successor match.
- Browser fixture hands and extended test-only deadlines isolate presentation
  checks. All fixture writes are in the disposable local database. No production
  defaults, admission, money-mode, financial state or other worktree changed.

Inspectable local evidence is under `qualification.local/battle31/`:
`smoke-browser.json`, `smoke-defaults-proof.json`, `smoke-320x568.png`,
`smoke-430x932.png`, other smoke viewport/result PNGs, `canonical-bot.json`, and
`canonical-terminal.json`, `smoke-successor.json`, `smoke-deal.json`, baseline
`baseline-deal.json`, and `smoke-final-turns.json` from the earlier pass. The bot and terminal
checks were rerun on this local candidate. Final route build and TypeScript pass. An initial parallel browser attempt
stalled waiting for Ante Up before gameplay; serial HH, bot, terminal and
successor checks passed without an admission-code change.
`dev/battle31/smoke-browser.mjs`, smoke-deal.mjs and smoke-successor.mjs retain
the actual-route checks. The life recording proves a visible 2.6× hold followed
by fade; measured viewer anchors are exactly 8 px from the rail and 55% across,
and opponent markers are inward. The final progress-pill placement passed all eight
layouts with zero page errors. Portrait, landscape and the enlarged-life hold were
inspected directly; smoke-life-hold.png and smoke-opponent-390.png retain the
additional views. The screenshot capture now starts before resume so it cannot
miss the short hold while the other client reloads. The local preview is ready for owner review,
not physical-device acceptance or permission to publish.

## Changed implementation and test files

- `src/components/GameDefaultsConfig.tsx`
- `src/components/battle31/Battle31Table.tsx`
- `src/components/battle31/Battle31View.tsx`
- `src/components/battle31/battle31.css`
- `src/components/battle31/useBattle31Selection.ts`
- `src/components/battle31/useBattle31Selection.test.tsx`
- `src/components/catalog/Battle31Catalog.test.tsx`
- `src/components/catalog/DefaultsAndRules.test.tsx`
- `src/components/rules/Battle31Rules.tsx`
- `src/hooks/useBattle31.ts`
- `src/hooks/useBattle31.commands.test.tsx`
- `src/lib/battle31/presentation.ts`
- `src/lib/battle31/presentation.test.ts`
- `supabase/battle31/smoke-defaults.sql`
- `dev/battle31/smoke-browser.mjs`

Checkpoint documentation: this file, CURRENT_RELEASE.md and INDEX.md.

Additional files changed for the visual pass:

- `src/components/MobileGameTable.tsx`
- `src/components/battle31/useBattle31Movement.ts`
- `src/components/battle31/useBattle31Movement.test.tsx`
- `src/components/canonicalShell/CanonicalLifeMarkers.tsx`
- `src/components/canonicalShell/CanonicalLifeMarkers.test.tsx`
- `src/lib/canonicalShell/canonicalLegPlacement.ts`
- `src/lib/canonicalShell/GameplayOpponentSeatLayer.tsx`
- `dev/battle31/smoke-deal.mjs`
- `dev/battle31/smoke-successor.mjs`

## October 26 local visual feedback

Owner authorized one consolidated local pass: dynamic $x BATTLE 31 title,
no stake byline, and compact opponent lives at the chip circle’s lower-right
outer edge. The shell consumes the existing authoritative v.stake; no rules,
financial, configuration, database defaults or production state changed.
The chip variant uses 8px markers with 1px gaps, clears the canonical 2px border,
and grows downward during loss presentation. Label states retain the compact
row’s right boundary. Own lives and other families keep their existing styles.

Validation: 39 focused shared-plate/seat/life tests pass, including a subsequent
life-test rerun; application TypeScript and the actual-route build pass. Both
seat projections pass title-fit, absent-byline, marker-outside-disc and viewport
checks at eight sizes (16 cases), using an authoritative nine-chip stake. The
live enlarged hold/dissolve stays outside the opponent chip throughout its
recording. The existing five-chip owner URL separately passes seven phone sizes,
gear-menu Resume, one accepted legal swap and Pause afterward, with no page
errors. Local evidence: title-lives-browser.json, title-lives-owner-proof.json,
title-lives-owner.png, title-lives-opponent-detail.png, title-lives-loss.png.
The local-only geometry proof adapts the existing smoke runner; its prior
inward-row assertion is updated for the new lower-right placement.

The preview remains loopback-only and provides no iOS network access. Inline
local screenshots may be rendered by Codex, but their iOS visibility is unverified.
This feedback is not visual acceptance and does not lift the production hold.

## Exact tangency correction — owner rejection supersedes prior geometry checks

The directly attached codex-clipboard-7537cb44-2aca-4838-a99d-457ee4b23ce3.png
was inspected and retained locally as tangency-owner-reference.png. This resolved
the unavailable Library materialization requirement without using the cloud path.
Before correction, measured first-life angle was 67.3801 degrees, circle gap was
2px, and all five sampled points were covered by card backs. The prior row-box
checks were insufficient and must not be cited as exact tangency/visibility proof.

The canonical chip publishes its existing outer radius (no size change). The row
uses the shared center and (R+r)/sqrt(2) on both axes, accounting for the symmetric
border. Its z-index keeps it above card backs. The compact lost marker scales
about its upper-left 45-degree circumference point, preserving tangent contact
through the existing 2.6x hold and 1600ms dissolve. Title, own lives, other game
layouts, rules, financial behavior, defaults and production remain unchanged.

New regression owners: dev/battle31/life-geometry.mjs measures actual painted
chip-disc and marker border boxes, circle contact, angle, and five interior hit
points; it detects card occlusion rather than trusting row bounds. The actual
Game-route runner dev/battle31/tangency-browser.mjs covers both seat positions,
eight sizes, and losses with three/two/one markers. Default execution rejects
viewport clipping; --diagnose-clipping records the unresolved limitation and
returns passed:false. It never turns diagnostic geometry success into release
qualification. The existing smoke runner now calls the precise geometry check.

Observed: 16 static cases at exactly 45 degrees; maximum contact error 0.01383px
from browser rounding. Six live loss cases / 576 frames pass contact and card
visibility, with maximum animated first-circle error 0.00258px and angle error
0.000026 degrees. 2.6x opaque holds and later dissolves were observed. Application
TypeScript, preview build and 34 focused life/seat tests pass.

Open decision: keeping the current canonical seat anchor and extending the lives
right causes the rightmost marker to exceed the viewport by 6.171875px at 320px,
3.96875px at 375px, 3.375px at 390px and 1.78125px at 430px. The 390px loss recording
reaches 14.34px overflow during its opaque hold and 18.46px during visible fade.
The geometry/occlusion checks pass, but the complete visual gate remains FAILED.
An owner question requests the minimum inward shift of only that Battle31 seat;
no shift has been applied or inferred from elapsed time. Keep the preview local
and production held. Evidence: tangency-before.json, tangency-static.json,
tangency-proof.json, tangent-detail.png and tangent-loss-*.png under
qualification.local/battle31/. Owner preview remains paused at its existing URL.

## Flexible angle — canonical chip stays fixed, October 26

Owner answered: "it doesn't have to be EXACTLY 45 degrees. I do not want the
chip circle moved, that is canonical". This resolves the preceding open
decision without authorizing a seat shift. CanonicalChipLives measures the
existing chip and seat-frame bounds, prefers 45 degrees, and moves only the
life row downward along the chip rim when needed. Its contact point also owns
the loss transform origin. The row reserves the full three-life 3.3x dissolve
envelope so it does not reposition during an animation. The existing 2.6x
opaque hold and 1600ms dissolve remain unchanged. No chip/seat owner was edited.

Actual-route verification passes all 16 static layouts (both seat projections,
eight portrait/landscape sizes) and six live three/two/one-life loss cases,
576 recorded frames, with zero clipping, card occlusion or page errors. The
left seat remains at 45 degrees; the right varies from 45 to 88.9923 degrees.
Maximum static circle-contact rounding error is 0.01532px. Comparing the actual
chip-disc boxes against tangency-static.json gives exactly zero difference in
x, y, width and height across every layout. The owner URL was refreshed and its
visible detail inspected. Application TypeScript, preview build and 34 focused
life/seat tests pass. Updated evidence: tangency-proof.json,
angle-preview-proof.json, angle-owner-preview.png, angle-owner-detail.png and
tangent-loss-*.png. These supersede the previous clipping failure.

This is local qualification, not owner visual acceptance or release approval.
The existing paused preview remains loopback-only. Production stays held;
rules, settlement, admission, database defaults and other game layouts are
unchanged.

## Canonical nameplate correction — October 26

Jeremy approved aligning Battle31 with 357 and auditing the other new games
read-only. The shared layer now accepts inwardCardContent independently from
the legacy inwardSeatContent name/card coupling. Battle31 uses the card-only
setting. No family-specific nameplate formula, seat adjustment or chip move was
introduced. Golf and all other callers retain their previous behavior.

Two rendered comparisons against 357's CanonicalSeatCluster prop path prove
identical nameplate styles and cluster classes under center and inner shared
attachments with nonzero offsets. Together with the existing shared-seat/life
suite and card-only regression, 37 focused tests pass. Application TypeScript
and the actual-route build pass. Both seats at eight sizes and all six life-loss
cases pass (576 frames); chip boxes remain exactly identical to the previous
baseline. The owner preview is refreshed and remains paused at its existing URL.

The canonical setting exposes shared long-name edge clipping: Route 3e072b
extends 3.57px outside the viewport at 320px and 0.77px at 390px. Placement parity
is verified, but complete name visibility is not claimed. This is queued for a
shared width/truncation correction without moving the chip. Evidence:
nameplate-owner-proof.json, tangency-proof.json, angle-preview-proof.json and
angle-owner-preview.png in qualification.local/battle31/. See the
[read-only other-game audit](CANONICAL_SEAT_AUDIT_20261026.md). Production remains
held; this approval does not publish prior local smoke changes.

## Lower card rows — October 26

Owner supplied codex-clipboard-07cff313-f2c5-48a5-8a78-76c0ee2447f4.png and
requested that exchange and tabled opponent cards move down because the max-rounds
label obstructed the opponent reveal. The image was inspected. The game-owned
battle31.css positioned the label at 19% and tabled-card centers at 35% of the
felt, leaving insufficient label/card clearance. Both rows now receive the same
container-relative downward shift (at least 5% felt height), reserving label
line height, padding and a 6px gap. The existing compact layout applies through
220px felt height so short layouts retain space for the bottom progress pill.
No canonical seat/name/chip/life owner or transport anchor was modified.

The actual-route build passes. Disposable local fixtures used real Knock/Stand
showdowns; only their presentation deadlines were extended for measurement.
Both seats at nine portrait/landscape sizes pass (18 cases): minimum label/card
clearance 8.49px, card-row clearance 2.61px and exchange/progress clearance 1.84px.
Lives retain visibility and tangency; no page errors. The same-frame previous
row-position comparison checks unchanged chip boxes. Evidence:
qualification.local/battle31/card-row-clearance.json and lowered-card-rows.png.
The owner preview was not used for synthetic state changes. Production stays held.
