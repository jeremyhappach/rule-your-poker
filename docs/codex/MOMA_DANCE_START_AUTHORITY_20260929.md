# Moma Dance waiting-table start authority — September 29, 2026

Status: locally qualified on `codex/waiting-start-authority`; migration and
publication not performed. No recovery command was sent to the affected session.

## Captured production identity and state

Project `xvhmbuppghwmwpwrkzao`; session `4cf676a4-bf46-4ec4-8c4c-f7d71650c493`,
database name `Sep 29 - Moma Dance`. The full capture was taken at
**2026-09-29 17:08:19 UTC**, before any reproduction or product edit. All live
inspection used read-only transactions. Neither production player client was
opened by Codex. The session is recorded as **fake money**, despite the requested
real-money engineering rigor; tests cover both modes.

The public production build manifest still reported base commit
`2e9a638a26a8fd852da7e11691fc225c4954b635` (published 16:02:58 UTC), matching
the source inspected for this diagnosis.

| Field | Captured value |
|---|---|
| Session | `waiting`; not paused; no pending/session end |
| Current dealer game / round / game type | All null; total hands 0 |
| Retained dealer position | 4; prior postgame selected Hap at this position |
| Current host | Hap, user `d7dc1928-3727-4351-b0ff-0e80c81c2953` |
| Hap player | `9feee9d1-358c-4bbf-9d5f-f1f94bcfbc8c`; seat 4; active; sitting_out=true; waiting=true |
| Peer player | `22e9f522-72e4-4642-bf2c-20f5f0a75a3a`; user `fb835d1f-db2f-4de4-84e2-ce0074512e46`; seat 5; active; sitting_out=false; waiting=true |
| Eligibility | Two seated, opted-in humans; server-selected starter is Hap only |
| Money | Pot 0; both balances 0; two $3-per-player ante records and two $6 final awards |
| History | Two completed Holm rounds/dealer games; four result and four transfer records; no unfinished round or pending transfer |
| Presence | Both active heartbeats; server heartbeat timestamps 17:08:47.500991 / 17:08:47.921282 UTC in supplemental capture |
| Progress identities | Timer generation 11; game authority revision 23; current_host version 0 |

The canonical heartbeat uses `voice_presence_heartbeats.updated_at`; the older
`profiles.last_seen_at` values are not that lease. All player intent/participation
versions, deadlines, watches, timer rows, transfer cursors, full round/dealer rows,
snapshots, results and diagnostic events are preserved in the local evidence.

## Proven failure boundary

`public.begin_session_dealer_selection` elects one eligible human, preferring
`games.current_host`, then join time and UUID. A seated player with `waiting=true`
is eligible even while `sitting_out=true`: explicit Rejoin queues participation,
and Start atomically activates it. The captured authenticated Hap caller passes
that election and the two-player check. No start RPC was executed on Moma Dance.

`useWaitingRoomActions` counted that same queued player toward readiness, but
`CanonicalShellWaitingSurface` rendered its queued-rejoin branch **before** the
host action branch. Hap therefore saw only queued-return/share controls. The
peer was not the host and also had no Start. The hook additionally elected the
earliest human without respecting `current_host` or start eligibility, which
could disagree with the backend after host transfer or sit-out.

Persisted client diagnostics establish receipt of the relevant state, excluding
a missed realtime snapshot as the cause:

- 17:02:45: authoritative Holm postgame selected seat 4 for setup.
- 17:02:47: Hap explicitly declined setup; the table became waiting.
- 17:04:08 / 17:04:23: the peer's seat was absent from the client roster.
- 17:04:25: the same peer UUID reappeared in seat 5, active, waiting=true.
- 17:04:26: Hap's client held sitting_out=true and waiting=true.

Thus the retained evidence adds two details to the reported sequence: the peer
reached automatic seat release before reseating, and Hap also explicitly queued
Rejoin. Both simple timeout/rejoin and release/reseat paths are covered.

At **17:17:47 UTC**, the read-only preservation check found the peer `left` again
while Hap remained queued. Production presence processing continued independently;
the original two-player bad state remains captured. The session row, both chip
balances, rounds, dealer games, results, snapshots, transfers and deployed start
definition matched the original capture. No repair or production migration ran.

## Correction and preserved behavior

- `src/lib/waitingRoomStartAuthority.ts` projects the existing server election,
  including persisted host preference, opt-in, seat/status exclusions and UUID ties.
- `src/hooks/useWaitingRoomActions.ts` separates host controls from start authority,
  checks server-owned blockers on existing snapshot changes, rejects stale reads,
  fails closed on read errors and provides explicit retry. It adds no polling.
- `src/components/canonicalShell/CanonicalShellWaitingSurface.tsx` allows the sole
  eligible queued starter through to Start and keeps bot controls with the host.
- `src/pages/Game.tsx` supplies the authoritative host and waiting boundary.
- `supabase/session-start-authority/authority.sql` adds
  `private.waiting_start_is_blocked` and authenticated read-only
  `public.get_waiting_start_blocked`; the locked start RPC uses the same predicate.

The old start RPC was also proven to accept a synthetic `waiting` row with pot 3.
The new guard rejects a current dealer-game pointer, nonzero/null pot, unfinished
round, pending transfer, paused/ending state or ended timestamp. This is a direct
proof of the requested financial safety boundary, not the cause of Moma Dance.
One independent read-only review identified that the client needed these same
blocker signals; the final implementation and tests address that finding.

No dealer/start election is broadened. Dealer draw, normal postgame/setup owners,
two-player seat projection, UUID identity, intent version guards, replay receipts,
antes, settlement, balance ownership and prior-game records are preserved.
All game families use the single Game.tsx canonical waiting call site. The legacy
WaitingForPlayersTable and WaitingRoomCTA have no live call sites and were not edited.

## Qualification and remaining acceptance

49 focused tests pass: 33 new authority/component cases plus 16 existing Holm
postgame, authoritative handoff and player-catch-up checks. Application TypeScript
and Vite production build pass; existing Browserslist/chunk warnings remain.

The reproducible SQL proof compiles candidate functions only in `pg_temp` and
uses newly generated synthetic identities inside BEGIN/ROLLBACK. Production
functions are not replaced. Eight full sequences cover fake/real money, each
disconnecting participant, and both queued-rejoin and seat-release/reseat.
Twelve blocked-boundary cases, role ACLs, outsider rejection, duplicate start,
postgame duplicate receipts and intent replay pass. Exact financial/history
fingerprints include ante rows and transfer history. Synthetic records roll back.

| Required regression | Evidence |
|---|---|
| Normal completion → next dealer | Actual Holm postgame RPC selects expected setup owner in all eight sequences |
| Explicit next-dealer Sit Out | Actual decline RPC enters waiting; fallback election tested separately |
| Heartbeat expiry | Actual private reconciler demotes only the expired fixture |
| Rejoin restores minimum | Actual intent/seat RPC restores two eligible players |
| Reported sequence | Captured shape rendered for both viewers; full SQL sequence |
| Either disconnect identity | Both roles × both money modes × both rejoin paths |
| Reload/reconnect | Fresh component mounts, reversed roster, mounted snapshot update; live browser acceptance pending |
| No duplicate start authority | One elected UUID; nonstarter/outsider rejected; duplicate start leaves row unchanged |
| Unfinished game/money blocks | Shared read/start guard; twelve SQL cases; client unavailable/error/stale-read tests |
| Finances/history unchanged | Exact fixture fingerprints plus preserved production records |

**Migration applied before client publication:** `20260929173535_waiting_start_authority`.
All three deployed function bodies exactly match the candidate payload. Function
ACLs, security-definer settings and empty search paths match the intended contract;
the start-election body is unchanged from the reviewed candidate.

Release qualification uses `prepare-proof.mjs --deployed` to exercise the installed
public Start and readiness entrypoints, not only temporary candidate copies.
Eight full sequences and twelve blockers pass, with exact finance/history equality
and all fixtures rolled back. A live-round-pointer case sets `current_round=1`
with its unfinished betting round; `current_round` is a round number, not a UUID.
The same unfinished-round guard blocks it even without `current_game_uuid`.

Live browser lifecycle qualification passed with the supplied account logins.
The accounts have the same UUIDs as the incident players, but were used in fresh
independent browser contexts and a separate fake-money session. No incident route
was opened. Requests explicitly referencing Moma Dance were blocked; the blocked
requests were read-only lobby history batches. No CLI or dependency was installed.

The local `.env` still targets the old backend. An initial Create Session attempt
there returned PGRST202 and created no game. The preview was restarted with isolated
process environment targeting `xvhmbuppghwmwpwrkzao`; the following qualification
used only that production backend. No product environment file was changed.

Live table: **Sep 29 - Main St.**, `8e33b0f8-f730-4a82-a6f9-6ab9c85d84b4`.
Both players began at zero. They completed one ordinary Holm round without a
fixture or forced outcome: one ante each, one final settlement, balances +3/-3,
pot zero. The next dealer (host) explicitly chose Sit Out. The other browser went
offline and production presence auto-sat-out its player after about 69 seconds;
no timestamps, watches or recovery functions were edited/called by the smoke.
The peer used Return to Play; the declining host also queued Return to Play to
restore the exact two-eligible queued shape seen in the captured incident.

Both browsers then showed two seated / Ready. The host was sitting_out=true and
waiting=true and alone displayed Start. The peer's direct Start request returned
not_authorized without changing the session. Reloading each browser and disconnecting/
reconnecting each browser preserved the same sole starter; both received fresh
authoritative frames. A read-only DOM observer saw no peer Start button or duplicate
Start. The longest sampled interval with both views Ready and no Start was 21 ms;
there was no persistent missing action. The observer also recorded brief fail-closed
readiness refreshes; full remount loading was not counted as an idle ready view.

One host click returned started; duplicate calls from both identities returned
already_started. Normal dealer setup created exactly one successor dealer game,
`668cb433-755c-4b16-ab01-909d91f3180d`. Both clients received it in authoritative
frames. During its ante/live-pointer boundary, both readiness RPCs returned blocked,
neither UI showed Ready/Start, and Start returned not_startable. Its ordinary ante
deadline later returned the table to waiting without moving money. Prior completed
round/dealer/result/transfer rows and +3/-3 balances remained exactly unchanged.

The broader account-history fingerprint was not globally static: the pre-existing
in-progress real-money session Sep 14 - Jason Heyward continued pussy-tax hands on
an approximately 92-second cadence before and throughout this test (hands 11988+).
No browser RPC from the smoke targeted that session or any other game UUID. This
independent activity is preserved in the evidence and was not repaired or expanded
into this release. Moma Dance's session fingerprint and incident finance/history
remain unchanged. Live testing was fake-money only; both money modes remain covered
by the already-passed deployed SQL rollback suite.

The prepublication live gate is PASS. Production checkpoint
`762bd94fd55bbfdaa881aa589f155ec75da8866f` reached Vercel READY; both independent
browsers loaded this exact SHA from `https://holm357.com/build-manifest.json`.
The deployed-client smoke passed idle/ready, sole queued-host Start, peer rejection,
both reloads, both actual network reconnects, a single successful Start and duplicate
already_started acknowledgments from both identities. Pot, balances and all prior
test-session history stayed equal before/after Start. Start itself enters dealer
selection; dealer-game creation belongs to the subsequent configuration step,
whose exactly-one-row behavior was covered in the full prepublication smoke.

The post-smoke setup deadline expired naturally while recording the checkpoint,
returning the fixture to waiting with no current game pointer and zero pot.
No repair or direct session update was used. The final incident recheck matched
original rounds, dealer games, results, snapshots, transfers and balances exactly.
Raw deployed-client evidence is `postdeploy-two-client.json`; screenshots and
the preservation comparison are alongside it. Final production qualification is
**YES** for desktop/mobile Chrome and the specified lifecycle. Physical iPhone /
WebKit and live real-money wagering were not exercised; real-money authority and
financial guards were proved in the deployed rollback suite.

At the release gate, Vercel still reports production deployment
`dpl_8A1LqS6wNPRt7UchWJ1RwpjtdXX9` READY at
`2e9a638a26a8fd852da7e11691fc225c4954b635`; the public build manifest agrees.
This was the prepublication deployment checkpoint; the verified production
checkpoint and successful deployed-client smoke above supersede it.

A read-only recheck at 17:50:41 UTC found Moma Dance `session_ended`, both players
`left`, and no host. Its recorded end is 17:18:52 UTC, before this migration.
No recovery/gameplay command was issued against Moma Dance. Its balances, rounds,
dealer games, game results, snapshots and transfers exactly match the original
capture; no pending transfer exists. The ended lifecycle differs from the preserved
bad state and is not evidence that the client correction has passed live smoke.

## Preserved local evidence

Raw evidence is retained under `.codex/evidence/moma-dance-20260929/`, outside the
release commit: `authoritative-state.json`, `capture.sql`, deployed entrypoints,
guards/heartbeats/indexes, eligibility/preservation query and output, and complete
rollback SQL/results. Do not overwrite it with a later recovered state.

- `authoritative-state.json` SHA-256:
  `138898B9AE7DC31DBFB5B5F6C4C574A6F9610D215CCBA1485EF6C2FF031EF400`
- `deployed-entrypoints.sql` SHA-256:
  `E88B1EB75CBA62F1BB7D282F2960D40429877C0ACD53D693D0404D777E4DAC19`

The committed `client-fixtures.json` contains only synthetic proof inputs.
