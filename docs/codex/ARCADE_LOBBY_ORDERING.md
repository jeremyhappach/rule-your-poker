# Arcade sections and admin ordering — November 7, 2026

Jeremy approved the reviewed sections, ordering panel, helper text and migration
for production release on November 7, 2026. Review commits `973d5374c` and
`e9311e1e8` remain intact on `codex/arcade-ordering-review`. The release is
integrated on `codex/arcade-ordering-release` from current main
`74c2c5dc5a56da3b6ec0c5b0cd29fa40cddc2e86`, retaining the newer Horses Blitz v2
and 357 Drop final-results changes. Its worktree is
`C:/Users/jerem/.codex/worktrees/arcade-ordering-release/rule-your-poker`.

Migration `20261107220812_arcade_lobby_ordering.sql` is installed. This is the
reviewed SQL, renamed to the migration service's assigned version. Candidate and
installed hosted rollback proofs pass; the approved seed remains at revision 0.
Checkpoint: `arcade-lobby-ordering-2026-11-07`. The matching `-verified` tag
records exact production publication and browser verification. Owner phone
smoke remains acceptance truth.

## Initial layout and classification

| Section | Initial order |
| --- | --- |
| P-Town Originals | Horses Blitz, 357 Drop, Crib Lab, Chucky Showdown |
| Other Games | Run21, TriTowers, 11 Up, Boxdrop, Trip Flip, Take 2, Royal Flash, Mega Card Golf, Quintzee |

The four Originals are explicitly designated in the existing approved banners;
Horses Blitz and 357 Drop also have matching rules/qualification documentation.
Every section retains the old catalog's relative order. No ambiguous existing
designations were found. Mega Card Golf and Quintzee have no Original ribbon and
remain Other Games; a custom name alone was not treated as a designation.

## Ownership and behavior

- The existing Arcade catalog membership filter remains the visibility owner.
  Placement cannot reveal hidden, removed, unknown or multiplayer-only games.
- `GameDescriptor.arcadeSection` supplies a new game's default (Other Games when
  omitted). Unplaced games append to that section in stable game-key order.
- `public.arcade_lobby_layout` is a single shared row. Its two ordered arrays
  publish together in one update. An expected revision prevents stale Admin tabs
  from overwriting a newer save. A trigger validates unique game keys and owns
  revision/audit fields. Unknown/hidden saved placements survive later edits by
  older clients.
- Existing `is_admin`, `account_enabled`, active-profile and cutover-lock checks
  protect writes through RLS. Only the layout column is writable. Anonymous reads,
  insertion, deletion and client revision/audit-field updates are not granted.
- Main Lobby → profile/settings → Admin contains **Arcade ordering**. Native
  drag handles and section selectors stage edits; Move Up/Down buttons provide
  keyboard and touch alternatives. **Save Arcade order** is the only write.
  **Reload published order** discards the draft. A failed or stale save retains
  the draft and requires a reload before another attempt.
- Arcade reads on entry and window focus. A loading/error/retry state prevents
  showing an invented default layout before the published order is known.
  Empty player-facing sections are omitted. Admin keeps both sections as targets.
- Requested follow-up: a prominent gold helper above both sections reads
  “Click the info icon to view game rules”, with a decorative info icon.
- Tile artwork, two-column CSS, native Rules controls, leaderboard links,
  launch behavior, admission, game rules, finances and recovery are preserved.
  No popularity collection, automatic ranking or new dependency is included.

## Verification

Passed:

- TypeScript: `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`.
- Ten focused Vitest cases across layout, Admin editing, switchboard and original
  tile Rules/launch behavior.
- Focused ESLint: no errors; two existing-style ref-counter cleanup warnings.
- Production bundle: `node node_modules/vite/bin/vite.js build --outDir qualification.local/arcade-ordering/build`.
  Existing bundle-size/dynamic-import/Browserslist warnings remain.
- `node dev/arcade-ordering/verify.mjs`: disposable PostgreSQL 17.10 database,
  exact inspected deployed role-helper bodies, actual new table/grants/RLS/trigger,
  separate database connections, real supabase-js reads/updates, and separate
  headless Edge Admin/player browser contexts.

Database cases: migration rollback, correct seed, regular-player and anonymous
denial, forbidden columns/insert/delete, malformed/duplicate layout rollback,
inactive/disabled/locked Admin denial, competing-save serialization, stale-save
rejection, separate-player committed reads, and idempotent migration reapplication.
The database is dropped in the runner's cleanup.

Browser cases: initial section/order, section transfer, retained keyboard focus,
Enter-key Move Up, native drag reorder, unsaved draft isolation, explicit Save,
Admin reload and separate-player reload, forged regular-player save rejection,
hidden/unknown/multiplayer-only filtering, empty section omission, and two-column
layouts at 320/390/844/1280 pixels without horizontal overflow. Artwork and all
13 Rules controls remain. No browser page errors.

Evidence: `qualification.local/arcade-ordering/results.json`,
`lobby-{320,390,844,1280}.png`, and `admin-draft-390.png`.
These local artifacts are intentionally ignored; the reproducible harness is
included in the commit.

Local harness limit: the browser harness uses a narrow loopback HTTP-to-SQL bridge and fixture
identities, not hosted Supabase Auth/PostgREST. Notification/audio services are
stubbed only in that harness.
The full repository test suite was not run for this scoped metadata/UI change.

Additional release verification:

- The combined current-main candidate passed TypeScript, the ten focused tests,
  the complete local database/browser harness, and a production bundle.
- `dev/arcade-ordering/hosted-proof.sql` passed before and after installation on
  production using actual enabled admin and regular-player identities, their
  deployed role helpers, RLS, grants and trigger. It covers moves/reordering,
  stale/no-op saves, malformed rollback, audit identity, player denial and shared
  reads, disabled-admin denial, and anonymous denial. All changes are rolled back.
  No profiles, roles, account access, gameplay or financial data were changed.
- Real Supabase Auth/PostgREST with the two existing qualification accounts
  passes separate-session reads, an idempotent Admin Save, stale-write rejection
  and forbidden revision-column rejection. Both qualification accounts are
  admins; regular-player rejection is proven by the hosted SQL role test and
  the separate local regular-player browser, without changing anyone's roles.
- Security advisor output contains no findings for the new table or trigger.
- `node dev/arcade-ordering/hosted-smoke.mjs --production <full-commit-sha>`
  verifies the production manifest, full-app sections/helper/mobile geometry,
  native Rules and reloads in two authenticated sessions. Results and screenshots
  are under `qualification.local/arcade-ordering/production*`; the verified tag
  records the outcome. No physical iPhone smoke is claimed.

## Release sequence and owner smoke

The approved sequence is installed migration and proof → tagged current-main
integration → main push through the approved helper → Vercel READY/manifest and
authenticated production-browser verification. No worker update, game admission,
ranking or financial migration is needed. Explicit grants and RLS follow the
current [Supabase Data API guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Owner smoke: open Arcade on the phone, check the helper and both two-column
sections, open Rules, then use Admin ordering to move/reorder and Save. Reload
Arcade in another player session to see the saved layout.

Rollback: the previous client ignores this additive table. Keep saved placement
when rolling back the frontend; dropping the table is unnecessary.
