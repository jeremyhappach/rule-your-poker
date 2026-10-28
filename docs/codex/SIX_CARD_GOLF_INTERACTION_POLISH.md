# Golf interaction and layout candidate — October 21, 2026

Status: prepared for owner review; **not pushed or deployed**.
Base: `52aa5528143fe031c4ddf8c3787eff85c0392aa9`.
Branch: `codex/golf-interaction-polish`. Release requires Jeremy's approval.

## Observed owner session

Session `9acfb496-5564-4cfa-9d1a-bf2c3fd7bb1f`;
dealer game `100b31e9-e196-494a-b94c-d6c7c9a95ae7`;
hole `dd7395d9-c034-4e8b-b936-4f9e731eb5d5`.

Hap maps correctly to player `b7ab2db0-a745-4f98-9e15-58d4798ae7f8`
and is the current opening actor. All six own cards are concealed; the bot has
two legitimately public cards. The session is paused at revision 4 after the
normal fake-money opening timeout set autoplay/deferred sit-out and invoked the
all-human safeguard. Stock/discard are not legal during opening.

Original iPhone requests show successful setup and snapshot responses at
00:11:07–00:11:09 UTC, including the bot-to-human opening transition. No
`golf_action` request appeared in the inspected interval, and the authoritative
request table has zero accepted human moves. Recovery had no failed run in that
interval. Current authenticated production inspection returned snapshot HTTP 200,
a successful Golf Realtime join, correct viewer/actor mapping and no page errors.
Current `canAct=false` is consistent with pause/autoplay, not evidence that the
original phone was on the wrong turn.

## Confirmed defect and correction

A real browser reproduction of the old UI selected a concealed card internally
(`aria-pressed=true`) but rendered **zero** selection highlights. The shared
card renderer's concealed-card branch does not render its highlight prop.
The old flow also required a separate Reveal 2 button after selecting both cards.
This explains a reproducible apparently unresponsive first tap; it does not prove
every historical physical tap or an unrecorded original transport failure.

The Golf-only correction shows a gold first-selection outline and count. Tapping
a second distinct position submits the existing atomic `open` action with those
two indices. Tapping the first again deselects it. No value is exposed before
server acceptance. Existing pending-request, connection, actor, pause, deadline,
revision and immutable receipt guards remain unchanged.

Paused/autoplay, connecting and pending-action states now have explicit text.
The six local cards always render inside the canonical MY pane, including
landscape. Opponent grids retain the canonical seat owner. Stock/discard sit
at bottom center of the felt; the narrowest felt wraps them vertically to avoid
opponent cards. The private pending card retains the stock-side action slot.

Cards preserve their proportions. Every local/pile target is at least 44 px in
both dimensions in the layout matrix. Very short MY panes use contained scrolling
instead of moving local cards onto the felt or covering the identity row.
Normal owner portrait/landscape screenshots show all six cards in MY.

## Executed validation

- 17 focused tests pass: two distinct opening taps, deselection, visible
  selection, paused/opponent/disconnected/pending/expired blocking, revision
  reset, private projection and canonical transport coverage.
- `tsc -p tsconfig.app.json --noEmit` passes. The repository's preferred
  `bunx tsgo --noEmit` was unavailable (registry 404); no dependency was installed.
- Production build passes. Initial local full-app inspection used the checkout's
  stale backend environment; the final candidate build uses the published app's
  public production URL/key. Repository environment files were not edited.
- Actual touch interaction against isolated authoritative PostgreSQL passes:
  both openings, stock draw, private peer projection, reload persistence,
  replacement and discard pickup/replacement.
- Real SDK/Auth test verifies both existing approved users' JWTs through Auth,
  then routes Golf RPCs only to the isolated PostgreSQL authenticated-role owner.
  Five actions returned HTTP 200: open, open, draw, replace, discard.
  Production data writes are forbidden by the test. This is not a claim that
  production gameplay was advanced.
- 63 rendered layout cases cover 2/3/4 seats, every viewer, seven viewport sizes,
  public-grid inspection, unchanged canonical chip anchors, target sizes,
  contained MY scrolling, unobstructed card hit targets and non-overlapping
  actual card controls.
- Authenticated built-candidate inspection of the actual owner session passes:
  HTTP 200 snapshot, successful Realtime subscription, zero page errors,
  six MY cards in both orientations. The session remains unchanged.

Evidence is in `dev/six-card-golf/evidence/interaction-polish/`.
Native test: start `node dev/six-card-golf/native-serve.mjs`, then run
`node dev/six-card-golf/native-interaction.mjs --run-approved-fixture`.
It requires the existing private E2E credential file; credentials/tokens are
never written to evidence. The local test database is the existing loopback
Golf UI database, not the deployed project.

## Preserve and release boundary

No rules, scoring, stakes, timeout policy, SQL authority, session state, financial
history or admission settings changed. Both production Golf release flags remain
true, as authorized separately. The owner session remains paused at revision 4
with zero accepted human moves. No live reset, forced move, deletion, migration,
push, merge or deployment occurred. The unrelated Cribbage snapshot is untouched.

Physical iPhone acceptance is pending. After approving release, Jeremy can uncheck
Auto-play and explicitly resume his preserved session, then verify the first
selection outline, second-tap reveal, stock/discard flow and MY placement.
