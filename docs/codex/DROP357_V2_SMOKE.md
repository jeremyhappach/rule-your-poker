# 357 Drop initial smoke correction — November 7, 2026

Jeremy approved six corrections using the supplied iPhone screenshot: readable
lane results, three rounds, distinct completion sounds, standard centered tally,
bar-only time and the app-wide Abandon label. Horses Blitz's publication lane
was respected: isolated work began from its `6c75bafec` commit, and hosted release
work waited until that chat reported its publication complete and its production
marker/admission were verified. No Horses authority, worker or admission changed.

## Owners and timing

`supabase/drop357/v2.sql` registers disabled `357-drop/2`. Each board calls the
unchanged v1 dealing/action/scoring functions. Round evidence retains the cards,
lane results and exact bonus math for final validation. The database owns three
round UUID suffixes, independent shuffles, three passes, a 2,500 ms opening,
120,000 ms of play and a 5,000 ms result hold. Its bounded catch-up reducer crosses
all persisted boundaries without a browser. Round three alone atomically writes
the immutable shared Arcade result. V1 is dispatched to its retained original
function; active/history v1 runs and leaderboards are not reinterpreted.

`useDrop357` clears round transients, retains exact uncertain request UUIDs and
rejects changed equal revisions. An action cue requires the matching round and
an actual placement/pass change, so a deadline-crossing stale response stays
silent. `SoloDrop357` uses shared `TriScorePill`/`useTriRoundPresentation` solely
for the established bell, pill trajectory, count-up and recovery admission.
The standard count starts at 1,200 ms, finishes at 4,000 ms and returns home at
4,300 ms (plus the existing 70 ms CSS smoothing), before the next 5,000 ms boundary.
The next board receives its full opening before its gameplay clock begins.

`drop357/audio.ts` defines one soft triangle-wave dyad for ordinary filled lanes
and a separate ascending four-note board cadence. Both use shared mute, gesture,
interruption and durable event deduplication. The board cue replaces the ordinary
cue only for placement 15, including when a lane scores zero. It is independent
of the existing +200 all-three-scoring rule. The fresh completion cue ends before
the count-up window. No TriTowers tower or all-towers audio is called.

The result strip always occupies its own lane row. Names use the server's poker
vector, including wild substitutions: the screenshot fixture reads Pair of Queens,
NATURAL +20%, 160; Four Jacks, 2,360. Cards, labels and all three lanes stay in
place. Active time remains accessible through the meter's value/text. The shared
button's 13 consumers and Chucky's independent confirmation retain their handlers;
only Abandon wording changes. New-game bar-only policy is in ARCADE_PHASE_ONE.md.

## Qualification

- V1 and v2 local/hosted rollback proofs: frozen scoring, ownership, private deck,
  closed admission, three round resets, bonus totals, duplicate requests, stale
  round identity, final insertion failure rollback, one result, late replay after
  a successor, unranked abandon, zero-client three-round recovery, ties/version
  separation and zero writes to multiplayer/financial tables. Hosted rollback
  leaves no synthetic profiles. Legacy leaderboard checks permit existing live
  entries instead of assuming a globally empty table.
- Independent connections: simultaneous admission, duplicate and competing
  actions, terminal worker/action race, injected result rollback and late replay.
- Exact deployed recovery worker v21: actual claim, existing 357 dispatcher,
  three unattended rounds, one completion and rejected consumed token. The worker
  is unchanged and retains Horses Blitz dispatch.
- Real browser → Arcade API dispatcher → disposable PostgreSQL: screenshot hand
  names; six portrait/landscape layouts; three rounds with a middle-round timeout;
  lost replies/reconnect, preserved deadlines, three unique opening bells,
  dedicated all-filled cue with/without +200, three count-ups returning home,
  mute, bar-only time, one cumulative result, and abandon cancel/confirm. V1's
  full browser flow also passes with the corrected presentation.
- 57 focused catalog, switchboard, Golf abandon, authoritative-subscription and
  357 presentation checks pass. Existing TypeScript compiler and production Vite
  build pass without installing dependencies. Existing bundle/Browserslist notices
  remain. Physical iPhone speaker/gesture acceptance belongs to Jeremy's smoke.

Reproduce with `dev/drop357/proof-v2.mjs <drop357_v2_digits>`, `races.mjs`,
`worker.mjs`, and `browser-v2.mjs` against a disposable loopback clone. Exact worker
source is in ignored `qualification.local/drop357/worker-release.mjs`; browser
screenshots/audio receipts are in `qualification.local/drop357/browser-v2/`.

## Hosted release

Migration `20261107204844_drop357_three_rounds_v2` is installed. Qualified authority
MD5: `500b058f49b0c057c7b78703fa627dc8`. V2 admission remains closed until exact
production publication is verified. `activate-v2.sql` checks that publication,
authority digest and recovery heartbeat before switching only new 357 admissions.
Checkpoint: `357-drop-v2-smoke-2026-11-07`; its `-verified` tag records the exact
published commit and activation. Owner smoke remains pending.

On iPhone, finish three rounds and let one expire. Confirm all lanes remain
visible, readable result strips, no numeric clock, one opening bell each round,
distinct last-slot cue, pill count-up/home before the next opening, and a single
final leaderboard score containing all three rounds.
