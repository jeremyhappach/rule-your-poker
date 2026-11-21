# Midnight Blue UI review — November 21, 2026

Review branch: `codex/midnight-blue-review`, based on `origin/main` at
`40cadbcd6f9e321d1ee35a97fbad109cdb090394`. Prepared for review only. Do not push
or integrate into `main` until Jeremy authorizes publication.

## Current reference fidelity pass

Mockups 02–04 were opened before edits. The picker uses the approved illuminated
curtain/logo crop across its top and one texture across the whole card. Tabs,
tile frames and footer share brass details. Cards and Dice retain the reference
ratios (1.4 and 1.12); Other stays compact and translucent. Existing catalog
eligibility, game names and all controls remain authoritative.

The ZIP contains flattened references and Chucky's portrait, not independent
background/lamp layers or per-game art sources. This was flagged before editing.
`extract-approved-art.ps1` records every exact source rectangle; run it from the
review worktree, followed by `node dev/midnight-blue/encode-approved-art.mjs`.
The latter encodes source pixels as WebP at .58, maximum width 384, to stay within
the existing bundle budget. It does not generate or repaint imagery. Nine
regions with overprinted selector labels/frame edges use source-coordinate SVG
clips, which exclude only those empty edges. Full mockup UI, device frames, status bars and
example controls are not used as assets. The unused prior Holm scene export was
removed; its horizontal card region is now WebP. Other modes retain their
existing motif selection, apart from that equivalent Holm encoding.

The shared setup background now wins the earlier identity background selector,
so table texture and lighting actually render. Approved 04 motifs are larger;
single-setting games can use more available art space. Holm alone keeps the
cocktail. Compact spacing retains 44px controls, Back and Start without setup
scrolling at 390×844, 320×568, 455×488 and 844×390. Short, wide picker containers
use a compact crown/header so the catalog remains reachable.

Validation: 84 focused tests, typecheck, production bundle/size gate and 36 setup
checks. Visual comparisons cover Cards, Dice, Other, Holm, 3-5-7 (also the short
phone) and Horses against 02–04 at phone size. Saved in
`qualification.local/midnight-blue/reference-fidelity/`. Local sample transport
only; no production publication.

## Previous continuous picker backdrop correction

The current preview places one Peoria bridge image on the picker page. Tiles
contain only a translucent surface, title and game artwork. Cards/Dice retain
their short proportions; Other remains compact and faint. The existing cocktail
crop is specific to Holm's setup panel. Other setups reuse only the table texture
and warm glow, alongside their own art. Title/art share the compact brass frame;
clock/Pause sit outside it in a slim utility row. Transparent stepper buttons
retain their existing touch targets, values and handlers.

No assets were generated, modified or substituted in this pass. All required
assets were already present. The 84 focused setup tests and typecheck pass, as do
36 setup/expanded-editor checks at 390×844, 320×568, 455×488 and 844×390. Browser
checks also verify no per-tile photographs, Holm-only cocktail imagery, separate
utility controls, title readability and the existing pending-invite states.
The complete build passes with 4,366 source tests, 241 harness tests, 46
release-tooling tests and the production bundle/size gate.
Screenshots are in `qualification.local/midnight-blue/shared-backdrop/`.
Local sample transport only; no production publication.

## Previous shared atmosphere follow-up

The latest correction applies Holm's scene treatment to the shared Multiplayer
setup header and all three picker categories. Title, clock/Pause and recognizable
art are composed inside one framed scene. Cards/Dice share shorter 1.6 tiles
(subject to the existing minimum height); Other keeps its short translucent
treatment. The existing Peoria bridge is a subtle picker backdrop.

There is no standalone empty tabletop asset in the ZIP; this was flagged before
using direct, unobstructed pixel regions of approved mockup 03. New JPEG crops
(quality 90) are `approved-scene-light.jpg` at (30,244), 210×220;
`approved-scene-table.jpg` at (115,411), 125×53; and
`approved-scene-glow.jpg` at (800,244), 95×165. CSS feathers the photo edges into
the table. No replacement imagery or image generation was used.

The existing motif atlas retains its nine game objects. A border-connected
navy-background flood fill makes only the backdrop transparent (1,074,817 pixels),
then the browser WebP encoder saves at quality .92, 1254×1254, 153,250 bytes.
Multiplayer-only SVG view boxes trim empty margins so the objects fill their
scene. Holm still uses the approved horizontal four-card crop; Horses still
shows one/six and Yahtzee five sixes. Other modes retain their motif framing.

Settings, defaults and handlers are unchanged. Removing an inner input border
saves row height while preserving 44px steppers. Short, wide containers use two
columns; narrow preview panes put each setting label above its direct controls
to retain readable numeric values. Expanded optional amounts still fit in place.
Both pending-invite states keep one-line `Pending acceptance`, with green for
incoming acceptance. No Async product code changes were needed this pass.

Validation: 128 focused tests, 80 browser regression layouts, 36 targeted setup
and expanded-editor checks at 390×844, 320×568, 455×488 and 844×390, typecheck and
production bundle/size gate. Targeted checks assert title bounds, art presence,
numeric input widths, no vertical overflow, no footer overlap and both invitation
states. Screenshots wait for fonts/images and completed paints. Visual comparisons
against mockups 02–04 cover Cards, Dice, Other, Holm and 3-5-7, saved under
`qualification.local/midnight-blue/atmosphere/`. Local sample transport only;
production remains held.

## Previous targeted smoke pass

The approved references and latest smoke corrections determine the layout.
Cards use the reference's 1.4 tile ratio; Dice use 1.12. Titles occupy a separate
row above the artwork so wrapped names cannot be covered. Cribbage/Golf art is
smaller and fainter; Other is unchanged. Holm's four cards are side by side.

The ZIP has no standalone Holm scene asset. `holm-approved-scene.jpg` is an
art-only crop of mockup 03 at (30,244), size 964×220; `holm-approved-cards.jpg`
uses (250,267), size 540×181. Both retain the supplied pixels, encoded as JPEG
quality 90. The scene keeps the table, cocktail, warm lighting and four cards,
without the mockup's rule caption. No new artwork or image generation was used.
The other existing motifs are retained.

Shared setup spacing is reduced, with 44px amount/Pause/Back/Start targets.
Optional amount accordions display their existing switch and stepper beside
the label when expanded, without adding vertical height. Short, wide containers
use two settings columns and place the clock beside the compact identity panel.
The settings body does not shrink under the footer or hide clipped controls.
Pending invite cards say `Pending acceptance` in both directions; incoming
acceptance retains the green card treatment and original action/deep link.

Validation: 128 focused tests (84 setup tests repeated after the final markup
change), typecheck, production build/size gate, 80 regression browser layouts,
and 27 targeted setup/expanded-editor fit checks. The latter cover eight games
at 390×844, 320×568 and 844×390, plus both invitation directions, title/art
separation and footer overlap. Run `node dev/midnight-blue/targeted-smoke.mjs`.
The fixture uses local sample data; no live invites or transactions are sent.

Visually reviewed phone-size side-by-side evidence under
`qualification.local/midnight-blue/final/`:

- `comparison-picker.png`: approved picker beside the refreshed picker,
  including Holm, Cribbage and Six-Card Golf.
- `comparison-holm.png`: approved Holm scene beside the combined setup panel.
- `comparison-fit-and-invites.png`: approved 3-5-7, short-phone default/expanded
  setup, and both pending invitation states.

The reference example omits existing 3-5-7 settings; all real settings/defaults
remain available. No gameplay, configuration, eligibility, timer, payout,
validation, invite, notification or backend owner changed. Publication is held.

## Rolling smoke follow-up — pass 2

The latest five requested changes restore a subtle brass-bordered Multiplayer
name/art panel, shorten the Cards/Dice tiles and blend their unchanged artwork
into the surface, simplify Async lobby cards, add minus/plus to every lineup
group and replace the permanent stake hint with an error for invalid input.
Other's shorter faint-art treatment and the inline setup controls remain intact.

The latest instruction supersedes the initial brief's 2× minimum for minus and
its individual-game disclosure: minus removes the last entry too, plus appends
an identical independent entry, and the disclosure is removed. Grouping still
compares game, stake and exact settings; remaining entry order and payloads are
preserved. An intentionally empty Run It Back draft now reloads safely without
restoring removed games. Sending remains blocked until a valid game is added;
submitted/locked drafts retain their existing protection.

Validation: 128 focused tests, typecheck, production bundle/size gate and 80
browser layouts pass. Browser checks cover the shorter blended tiles, bordered
configuration panel, simplified Async cards, last-entry removal and invalid
stake feedback. The follow-up runback test covers empty-draft reload/rebuild
with the same opponent and request identity. No artwork or backend changes.

## Rolling smoke follow-up — pass 1

The five November 21 corrections are applied: one combined Multiplayer
name/art header; compact Async heading; normal-flow configuration artwork that
stays beside its title above Stake; inline simple amounts, dropdowns and
switches; and a Match information modal containing the unchanged first-player,
timeout, settlement and expiration terms. Maximum loss remains next to Send
Invite. The opponent requirement and existing send/runback handlers are intact.
All artwork is unchanged. Expanded editors remain for multi-control options
such as enabled amounts and Mega course configuration.

Follow-up validation: 110 focused setup/invite/grouping tests, typecheck,
production bundling and the size gate pass. The updated browser suite passes
76 layouts, including Words artwork containment, inline Cribbage mode/custom
settings, modal access and required opponent selection before submission.
The four viewport sizes remain unchanged; this is local sample-data evidence.

## Scope and preserved behavior

The supplied `P-Town-Poker-Midnight-Blue.zip` / `CODEX-BRIEF.md` takes precedence
over its six mockups. The actual bridge, shared mode tabs and account controls
now frame all three lobbies. Multiplayer active cards are compact; standings
remain available in their existing results/history surfaces. Cards/Dice use
illustrated tiles; Other and Arcade use compact tiles. Quintzee's catalog
category is Other, including Defaults. Disabled human-only games retain their
eligibility guard without the badge.

Setup uses navy rows, one expanded editor, amount controls, identifying art and
a pinned footer. Catalog availability, configuration state, validation and
submission handlers remain the owners. Cribbage retains its existing Half
(61 points) option as well as Full, Quick, Sprint and Custom; the brief cannot
remove a supported mode while preserving existing rules.

Async selects games before an opponent. Grouping compares game ID, exact stake
and canonical configuration; it never merges the underlying entries. Copy
appends an independent entry, group minus removes one including the last copy,
and tapping a group opens its existing game editor. Different settings/stakes remain
separate groups. Reopening Games retains the opponent. Runback persistence,
locked ambiguous-send retries, request IDs and the existing ordered payload
remain intact.

The Async badge counts distinct actionable match UUIDs from the existing
notification feed, including invitations, turns and results. The bell is
removed from the main header. Ellipsis → Notifications retains all underlying
actions, including account approvals, and Notification settings opens the
existing profile preferences. Realtime, push delivery and action destinations
are unchanged. Completed Async lobby cards read game types through the existing
participant-checked `delayed_history_detail` endpoint, once per displayed card;
the archive's existing page limit and financial/history surfaces are unchanged.

No migrations, backend definitions, gameplay rules, settlement, balances,
admission rules, deadlines, historical records or production data were changed.

## Local review

From this worktree, using the already installed dependencies:

```powershell
node dev/midnight-blue/server.mjs
```

Open <http://127.0.0.1:5197>. Review all three tabs, then use **Review Multiplayer
picker & setup** for the selector and setup screens. **Async → New Match** opens
the complete invitation flow. The server binds only to loopback. This fixture
mounts the real presentation components with local sample transport/account
data; it does not log in or create live matches. Profile and account actions in
the sample header are placeholders, while production keeps the original Index
account controls. The fixture is outside the production import graph.

```powershell
node dev/midnight-blue/browser.mjs
npm run build
```

Browser evidence is written to `qualification.local/midnight-blue/` (ignored).
Validation completed: typecheck, 4,365 application tests (591 files), 241 harness
tests (12 files), 46 release-tooling tests, production bundling and the unchanged
90 MB build-size gate pass. All 68 browser layouts pass without page errors.
The browser suite blocks external requests and exercises 390×844, 320×568,
844×390 and 1280×800 layouts. It checks horizontal and illustration containment,
pinned Start, reachable controls, one open editor, catalog categories,
notification inbox access, duplicate-match counting, Async grouping, retained
opponent and the exact individual-game submission payload.

Review on a phone before publication: bridge crop and typography; all eligible
catalog titles/art; small-screen scrolling and expanded rows; Pause/Sit Out/
End Session; defaults and conditional settings; distinct Async counts; waiting
and completed game mixes; copy/minus/edit/reorder with differing configurations;
opponent retention; ordinary and Run It Back invitations; account approvals,
notification settings and existing deep links. Production smoke remains Jeremy's
acceptance step after any separately authorized publication.

## Artwork

`public/game-branding/midnight-motifs.webp` is a 1254×1254 generated decorative
atlas, 110,192 bytes. Nine clipped cells are reused across picker/setup/lobbies.
Generation brief: Midnight Blue / brass / ivory tabletop motifs on a dark navy
background, no UI or captions; Holm A/K and two ornate backs; 3/5/7 cards;
cribbage board; four Gin queens, one per suit; Canasta sevens; Golf K/K/2;
Horses dice showing one and six; Ship/Captain/Crew anchor with 6/5/4; Yahtzee five
six-faced dice. The final WebP conversion changes encoding only. Source PNG was
generated with the imagegen tool in this session. No full mockup UI was exported.

The supplied Chucky portrait is the existing
`public/arcade/approved-v1/chucky-portrait.webp`; Run21 and the existing applicable
motifs remain in `public/game-branding/async-v1/`. Existing newer admin artwork
continues to take precedence in Arcade. Remaining simple motifs are decorative
SVGs in `GameArtwork.tsx`, including translucent 11 Up pool balls.
