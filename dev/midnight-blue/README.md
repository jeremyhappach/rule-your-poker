# Midnight Blue UI review — November 21, 2026

Review branch: `codex/midnight-blue-review`, based on `origin/main` at
`40cadbcd6f9e321d1ee35a97fbad109cdb090394`. Prepared for review only. Do not push
or integrate into `main` until Jeremy authorizes publication.

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
appends an independent entry, group minus removes one, and individual edit,
remove and ordering controls remain available. Different settings/stakes remain
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
