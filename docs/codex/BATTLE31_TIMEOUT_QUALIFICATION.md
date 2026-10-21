# Battle 31 timeout and control correction — local only, 2026-10-21

Jeremy authorized this correction locally through his coordinating chat. No push,
production mutation, deployment or admission activation is authorized here.

## Behavior and ownership

The prior multiplayer adapter passed every expired playing decision to the pure
reducer's PASS fallback. It now distinguishes the participant controller and
money mode before invoking any gameplay action:

- Real-money human timeout preserves cards, turn, losses and balances. It restores
  one full frozen decision window and calls canonical `public.set_game_paused`.
  Host resume uses the existing Player options menu and canonical pause version.
- Fake-money human timeout sets canonical `players.auto_fold=true` and
  `sit_out_next_hand=true`. The strategic service worker then uses
  `private.battle31_visible` and the existing bot policy. No hidden hand is given
  to that policy. A late worker still chooses a strategic move, never an accidental
  human timeout PASS.
- Auto-play uncheck calls existing `public.set_automatic_play`, which immediately
  clears autoplay, deferred sit-out and any stop marker for Battle 31. Off-turn
  reclaim preserves the opponent deadline; current-turn reclaim grants a full
  frozen window. Unchecking while paused does not resume the game.
- The canonical player-control trigger advances the Battle revision, including
  controls changed through the shared RPC. Queued bot commands must revalidate
  both revision and live controller under the same action locks. Immutable
  control receipts cannot re-enable autoplay when replayed after reclaim.
- The opponent robot appears beside the hand-value display for a bot or autoplay
  participant. The checkbox is authoritative, reconnect-safe and tappable through
  the existing fullscreen interaction layer, with a 44-pixel label target.

`commands.sql` owns the adapter decision and control bridge; `recovery.sql`
dispatches due human/controlled turns; `multiplayer.sql` projects live canonical
flags. `rules.sql`, `bots.sql`, scoring, exchange/closing rules, stakes and
settlement arithmetic are unchanged. All renewed deadlines read frozen turnMs.
No shared canonical function is replaced by this correction. Existing service
receipts retain the actual strategic move and card IDs alongside the immutable
request; replay does not recompute or apply that choice again.

Horses/SCC supplied the automatic-play and deferred-intent pattern, but their
reference timeout branch did not establish the real/fake distinction. The
explicit pause behavior follows the existing canonical pause contract.
Manual Auto-play remains a human opt-in, including in real-money games; a
real-money timeout itself never opts the human in.

## Match boundary

The two frozen participants remain through every internal life round. Deferred
sit-out is consumed after the entire Battle 31 match, by the existing postgame
owner. An unreclaimed participant sits out of the next canonical offer; a
reclaimed participant remains eligible. Neither status silently creates a new
match or bypasses fresh stake consent. Real-money absence can remain paused;
there is no new automatic financial winner or bounded unattended-completion claim.

## Qualification

`dev/battle31/timeout-lifecycle.mjs` checks both money modes, no-action pause,
reconnect projections, full-clock authorized resume, denied nonhost resume,
human-action rejection during autoplay, public service-action rejection, late
strategic execution, current/off-turn/paused reclaim, stale and fresh unauthorized
bot rejection, old control replay, subsequent human play, shared RPC revision
invalidation, independent-connection bot/reclaim races, internal round retention,
and reclaimed/unreclaimed postgame eligibility.

`timeout-browser.mjs` mounts the actual Game route with authenticated loopback
transport. It checks visible pause, reload, canonical host resume, automatic
checkbox state, opponent robot, reload persistence, click-to-reclaim and cleared
canonical flags. Portrait 390×844 and landscape 667×375 screenshots were inspected.
The first browser run found the checkbox inherited pointer-events:none; the
interaction target was corrected and the flow rerun successfully.

The release package installs closed and fingerprints the existing pause and
automatic-play dependencies. Disposable clones install exact repository versions
of missing canonical helpers through `canonical-lifecycle.mjs`; that helper is
qualification-only and is never shipped in release.sql.

Financial winner/draw/abort/admission proofs in both money modes, command races,
explicit real-money autoplay progression, human/bot completion, recovery lock
contention with 42 fixtures per mode and independent Box Drop recovery, 19 package
installation/drift cases, client model/catalog/terminal/financial-shell checks,
TypeScript, 74 focused client tests and production build pass locally. Final
source SHA256: `8d437acaef8a07af1095405eb328164bfd22c325c38fec7e899595b4f8c0a4fe`; package SHA256:
`c5a7b3eee6ec71a740de815946326d3268b0b0bfa5479eb4bdf1e1614cd07816`. Evidence is retained in
`dev/battle31/evidence/timeout-lifecycle.json`, `timeout-browser.json`,
`package-proof.json`, `recovery-contention.json` and `recovery-regressions.json`.

The timeout correction does not qualify hosted JWT/PostgREST/Realtime, actual
pg_cron dispatch, production authority parity, physical iPhone behavior or owner
smoke. Those release gates remain open work. No stable checkpoint is declared.
