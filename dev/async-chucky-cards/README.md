# Async Chucky card visibility regression

Investigation and approved correction: November 20, 2026. Source baseline:
`2d12f967a` on `main`. The shared renderer now imports its existing stylesheet.
Production data, rules, timers and scoring are unchanged; no migration is needed.

## Finding

The cards survive the server-to-component path. The Async import graph omits
`chuckyShowdown.css`: only `SoloChuckyShowdown.tsx` imports it, through the lazy
Arcade route. `OriginalsBoard` mounts `ChuckyRoundTable` directly. Without the
stylesheet, the card slots and portrait lose their constrained layout; the
actual player faces render far below the clipped board. Merely finding a
`.cs-table`, decision button, or card DOM node is insufficient.

In the 390 x 844 baseline browser, the first player face starts at y=3562 px;
the table uses block layout. Loading only the existing Chucky stylesheet in the
diagnostic browser restores the grid and visible faces, with the same snapshots,
deadlines and scores. Baseline: 12/12 visibility checks fail. Diagnostic: 12/12
pass, with no page errors. After the approved import, the normal regression also
passes all 12 checks without diagnostic injection. The existing Chucky layout
fixture passes its four sizes, three phases, reveal/life transitions and
competitive layout. This is local browser evidence, not production smoke.

## Authority and renderer trace

1. The deployed `public.delayed_originals_core` delegates `visible` to
   `private.originals_visible`. The latter calls
   `private.chucky_showdown_scene_v2`, which preserves all four player cards,
   projects community cards through `boardShown`, and Chucky through `revealed`.
   Fold/Stay exposes two community faces; Choose exposes four. Hidden community
   slots remain backs. No private deck is projected.
2. `server/delayed/adapter.ts:project` exposes the current board only to the
   authoritative actor. `sqlBoard` uses the child's UUID and deployed core.
3. `DelayedTurn` checks child/match identity and monotone revisions via
   `admitTurnSnapshot`, rejects conflicting equal revisions, and adds only ID,
   revision, ruleset and server time before passing the board to `OriginalsBoard`.
   Reconnect reads the existing turn; it does not send Start.
4. `OriginalsBoard` forwards that snapshot unchanged to `ChuckyRoundTable`.
   Silent/recovery epochs call `seek`; decision scenes preserve the card arrays
   and persisted deadline. Card slot keys include the exact round/hand identity.
5. `ChuckyRoundTable` renders four player and four community slots during either
   decision. `CardSlot` passes actual faces or hidden backs to `PlayingCard`.
   These DOM nodes exist in the failing browser, but their CSS is absent.

The reported production match is `7710579e-78f8-4d6c-a7f0-f2aa2441c28c`, child
`5b42ec82-8955-4966-98d2-1cb6dc764566`. Read-only inspection found mcru81's first
turn already retained as a completed 100-point attempt and the child awaiting the
other participant, at segment 2 / revision 17. The retained attempt has valid
player/community cards. There is no frozen decision-response capture for that
turn, so its exact past network response cannot be independently recovered from
the current board. The historical match was not modified.

`projections.json` contains synthetic card inputs projected through the deployed
`delayed_originals_core(..., 'visible', ...)` on November 20. Its three phases
contain 4 player faces, respectively 2/2/4 community faces, and no Chucky faces.
Only timestamps are rebased in the browser. No real account cards or tokens are
used by the regression. Transport/auth/realtime are loopback fixtures; actual
DelayedTurn, OriginalsBoard, presentation, shell, CardSlot and PlayingCard run.

## Run

From the repository root, using installed dependencies and Edge:

```powershell
node dev/async-chucky-cards/browser.mjs
```

The test fails when the shared renderer loses its CSS dependency. It uses fresh
browser contexts at 390 x 844 and 1280 x 800. Cases cover fresh
Start/deal -> Fold/Stay, initial reads of running Fold/Stay and Choose turns,
and offline/reload recovery of every case. Assertions verify expected rank/suit
SVGs, readable dimensions, full viewport intersection, absence of occlusion,
four slots with the proper community backs, the persisted ticking deadline,
unchanged scores, and no Start command on recovery. It never visits Arcade.

For diagnosis only, load the existing stylesheet into the browser document:

```powershell
node dev/async-chucky-cards/browser.mjs --probe-stylesheet
```

This flag is not a product fix and must not replace the normal regression run.
Screenshots and measurements are written under the ignored
`qualification.local/async-chucky-cards/{regression,stylesheet-probe}` directory.
No database, external network access, credential setup, or package install is
needed to rerun either check.

## Approved correction and acceptance

`ChuckyRoundTable.tsx` imports the existing `chuckyShowdown.css` as its own
dependency. The Solo import remains for legacy Arcade rendering. The stylesheet
and competitive overrides retain their existing geometry and import precedence.

Applicable call sites: Arcade's `SoloChuckyShowdown`; multiplayer's
`OriginalsTable` -> `OriginalsBoard`; Async's `DelayedTurn` -> `OriginalsBoard`;
saved Async results' `ResultReview` -> `OriginalsBoard`.

Preserve SQL projections/privacy, versioned rules, dealing, legal actions,
timers/deadlines, scoring, financial settlement, identity/revision guards and
silent recovery. No database migration is needed. The normal regression passes
without diagnostic CSS injection, and the existing Arcade/competitive layout
fixture passes. Publication checkpoint: `async-chucky-cards-20261120`.
Owner acceptance remains pending: enter
Async directly in a fresh phone browser, see four player cards and two community
faces/two backs during Fold/Stay, choose Stay and see four community faces, then
reload during each decision and confirm cards and the existing countdown remain.
