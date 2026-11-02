# Async push cycles and active-user suppression — November 2, 2026

## Result and owners

The reported match `6177af46-d1a3-4fb5-ab76-3daba2457afd` emitted turn
events at 14:55:32 UTC for three children and 14:57:58 UTC for Words.
The deployed `private.push_sync` deliberately treated each fresh child/segment
as another event even when the recipient already had outstanding turns.

The existing locked `private.push_episodes(match_id,user_id)` row now stores
`turn_epoch`. A zero-to-positive availability transition emits one turn event;
later children keep that cycle open. Clearing all turns retires it. Eligibility
and payload expiry follow any remaining authoritative child in the same cycle,
even when the original child has cleared. A previous cycle cannot retry into a
successor. Separate matches and recipients remain independent.

The existing per-child/segment Last Call events and 24-hour deadlines are
unchanged. Quiet-hour coalescing, opt-ins, auth/session/device binding,
leases/retries, generic payloads and guarded deep links remain. In-app bell
projection and gameplay/financial authority are untouched. Existing outstanding
cycles are baselined without replay: deployment does not announce historical
waiting turns. Their Last Call reminders remain eligible.

## Existing presence reused

- `src/lib/runtimeInstrumentation/voicePresenceHeartbeat.ts`: existing four-second,
  single-flight/coalesced authenticated upsert, visibility/pagehide signals,
  route/game context and per-tab identity.
- `public.voice_presence_heartbeats`: same rows, owner RLS, database-stamped
  `updated_at`, existing `(user_id,tab_id)` index and retention cleanup.
- `src/lib/appActivity.ts`: existing trusted pointer/key, visible entry and focus
  handlers now also retain a local monotonic interaction time. Its age piggybacks
  on the normal heartbeat. Profile activity RPC cadence is unchanged.
- `PushLifecycle`: enrollment/binding reconciliation remains on route, auth,
  visibility and online events. Its redundant 30-second presence renewal stops.
- `private.push_presence` and its device RPC remain backward compatible for
  older clients, but the old 45-second match-viewing lease no longer suppresses
  delivery. `profiles.last_seen_at` is never a push suppression input.

Suppression requires an `active` row stamped less than **10 seconds** ago,
with a known interaction age still below **60 seconds**. The age continues
advancing between heartbeats. Hidden/leaving disqualifies the row immediately.
Missing/unknown/stale data fails open. Any active device for the same UUID
suppresses the account's push; another account does not.

Only eligible dispatch work checks presence: after deadline/preference/quiet-hour
gates during claim, and again immediately before send authorization. Suppression
persists `skipped` across that event's devices even if the worker loses its
receipt response. It cannot later catch up. Presence at event creation has no
effect; leaving before dispatch permits delivery. Quiet-deferred work checks
current presence when it becomes dispatchable.

## Cost and qualification

No new table, index, public RPC, cron, polling service or heartbeat loop.
Two nullable columns are added: one bigint per match/recipient episode and one
integer per existing user/tab heartbeat. No per-action presence check or write.
Identical availability now avoids redundant episode updates. No new history
stream is introduced; presence retention and existing notification history are
unchanged, and fewer turn-event rows are generated.

Local query plan uses `voice_presence_heartbeats_user_id_tab_id_key`, with two
shared-buffer hits, no reads/writes and about 0.015 ms for the direct lookup.
The complete helper averaged 0.21 ms in the hosted candidate rollback proof.
Across 1,200 actual child revisions, presence writes were zero. In the final
paired local run, revision processing averaged 0.220 ms before and 0.164 ms
after; unchanged availability performed zero episode writes instead of two per
revision. These are database microbenchmarks, not a physical-phone latency claim.

Passed:
- `node dev/web-push/database-proof.mjs --with-timezone --with-invitations --with-real-money --with-cycles`.
  Disposable clone removed afterward. Baseline regression tests run before the
  candidate; final cycle tests cover both money modes, later child arrival,
  remaining-child eligibility, clear/rearm, distinct matches, stale/replay,
  active/hidden/leaving/idle/unknown/stale presence, cross-device/account
  suppression, quiet ordering, opt-outs, parallel claims and duplicate receipts.
- Candidate and installed production rollback proofs, including **26 canonical
  financial groups** across all five async games: winners, ties, forfeits,
  exact canonical accounting/snapshots, replay/terminal and injected-failure rollback.
  No global claim/recovery sweep or push provider call runs on hosted fixtures.
- **3,571 application tests**, **241 harness tests**, **31 push worker/transport/
  service-worker tests**, TypeScript and production build. Focused client tests:
  39, including interaction throttling/account isolation and heartbeat cadence.
- Production rollback left zero synthetic profiles. The reported match hash
  `b393466de2a1cee258e04dfed67d8286` and child hash
  `51cde7e26581d310e64fc2d45972cdf7` were identical before/after installation.

Local raw logs/plans live under `qualification.local/web-push/` and
`qualification-push-*.log`. No dependencies were installed.

## Release and iPhone smoke

Isolated `codex/async-push-cycles` starts at verified main `0db4f1463`.
Published audio is preserved; no unfinished audio-control work was imported.
Migration **20261102154632** is installed; the CLI-created file was reconciled
to its single hosted migration receipt. Production publication is authorized.
The `release-async-push-cycles-20261102` checkpoint identifies the source;
its matching `-verified` tag records exact-SHA Vercel READY evidence.

1. Reopen the installed iPhone app to load the new client. Enable device/match
   notifications and turn quiet hours off for the test.
2. Start a genuinely new availability cycle while the recipient is backgrounded.
   Expect one Your Turn alert on the existing scheduler cadence. Leave it
   outstanding and make another child available minutes later: no second alert.
3. Clear every actionable child, background/close the app, and have the opponent
   immediately return a turn. Expect the next cycle's alert, with no activity
   cooldown. Tap it and verify the correct match and authoritative in-app bell.
4. Keep the recipient actively using P-Town when another cycle reaches dispatch:
   no OS alert. Leaving afterward must not produce catch-up. Repeat with the same
   account active on a laptop, then leave that foreground tab idle for over a
   minute and verify a subsequent cycle can alert.
5. Check a separate account/match, both money modes, a due Last Call and quiet-hour
   behavior. An abrupt termination without an exit signal may suppress only until
   the last foreground heartbeat is 10 seconds old.

Physical iPhone delivery remains owner acceptance; no real notification was sent
or production match/wager/balance altered for testing.
