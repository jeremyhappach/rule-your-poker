# Arcade presentation and artwork — October 16, 2026

Approved presentation scope builds on shared-rules commit `1c8657cb5`.
Solo introductions omit turn labels; Rules and explicit abandonment remain.
The existing authoritative intro, clocks, scoring presentation and automatic
three-round progression are unchanged. The switchboard uses compact card links
with separate accessible info controls. Coming Soon games remain unavailable.
Leaderboards retain the existing calculations, version separation and own-rank
row outside the top ten while moving details into the info dialog.

## Artwork boundary

Migration `20261016220546_arcade_artwork` adds a private Storage bucket,
three-row `public.arcade_game_artwork` mapping, RLS and validation trigger.
The bucket accepts JPEG/PNG/WebP up to 2 MiB. Active profiles may read;
active users with the existing authoritative admin role may upload and change
only the image path. Unknown games, malformed paths and missing objects are
rejected. Existing chat Storage policies and cutover guards are preserved.

Replacement uploads a new UUID path and compares the previous path before
publishing. Failed/conflicting writes retain the old image; ambiguous outcomes
retain both objects. Old files are removed through Storage only after a confirmed
replacement. RLS prevents deleting a currently referenced image. Reads use
authenticated downloads and disposable browser object URLs, not public URLs.
Metadata refreshes on switchboard entry, focus and info opening.

The read-only `arcade_rules_help` RPC returns the selected frozen Run21 registry
configuration after verifying the caller's active profile. Its intentional
SECURITY DEFINER boundary permits this limited read of the private registry;
it exposes neither run data nor mutation authority. In-game help receives the
actual projected frozen configuration, including legacy games. All multiplayer
call sites retain turn labels and existing shell defaults.

## Validation

- Production build: TypeScript, 2,280 application tests and 241 harness tests.
- `node dev/arcade/artwork.proof.mjs`: disposable database authorization,
  replacement/CAS, path checks, referenced-object deletion denial and rollback.
- `dev/arcade/artwork.proof.sql`: also passed against installed production
  definitions inside BEGIN/ROLLBACK; zero artwork objects or assignments remain.
- `node dev/arcade/proof.mjs --scoring --shared-rules`: legacy compatibility,
  shared rules, exact deadlines, replay, three-round zero-client recovery and
  no writes across 97 non-Arcade tables with canonical triggers enabled.
- Browser evidence: `dev/arcade/presentation-browser.evidence.json`.
  Browser Storage uses a loopback byte transport over real authenticated SQL
  policies; production Storage enforces the installed bucket's MIME/size limits.

Jeremy will smoke scoring and polish together after publication. Check phone
and desktop switchboard/info, admin artwork replacement, normal-user visibility,
Play/Resume, completion/rank feedback and one full Solo run.
