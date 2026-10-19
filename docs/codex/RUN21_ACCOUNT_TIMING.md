# Run21 account timing — October 19, 2026

Jeremy authorized automatic one-week capture for **Hap**, in Arcade and multiplayer.
The authenticated account UUID is resolved from the selected Auth account; names
and email are not authorization keys. Activation is a private grant, with an exact
seven-day capture window and seven additional days for retrieval. No gameplay,
financial, record, scoring, audio or deadline authority changes are included.

## Owners and bounds

- `useRun21Diagnostics.ts` mounts once per account/game identity in `SoloRun` and
  `Run21GameTable`. One asynchronous eligibility RPC does not gate gameplay.
- `diagnostics.ts` holds at most 2,400 samples and 64 revision correlations. The
  window persists across all three rounds. No whole-board serialization occurs.
- `timingCapture.ts` owns one Long Tasks observer (where supported), one lightweight
  animation-frame gap observer, four browser event listeners, a 30-second batch
  timer, an expiry timer, and at most one eight-second upload. No React state is
  updated by capture. No additional request or storage write occurs per move.
- Serialization/upload begins in an idle callback, with a two-second fallback.
  Failed batches retry at the next regular interval; there is no growing queue.
  Game teardown removes observers/listeners/timers immediately and permits one
  bounded final idle upload. A subsequent teardown replaces a pending final upload.
  Logout/account changes cannot upload a prior account's evidence.
- The server retains at most eight captures per account, each at most 2,400 samples
  and 512 KiB of JSON (4 MiB total plus database overhead). Writes replace a capture
  under an account row lock. Older delayed uploads cannot replace newer evidence. The ninth capture evicts the oldest updated capture.
- Capture checks both a server-offset wall clock and monotonic expiry. The database
  independently rejects writes after expiry. Production ignores legacy URL/storage
  flags, so a reload cannot bypass expiry. No URL parameter or toggle is needed.
- The hourly `purge-run21-timing-hourly` job deletes grants and cascades evidence
  after `retain_until`; physical deletion occurs within the following hour. No
  browser needs to remain open for retention cleanup.

## Evidence and retrieval

Each capture has its mode and opaque capture UUID. Its compact sample tuples are:
`[monotonicMs, serverOffsetWallMs, stage, correlationHash, round, elapsedMs, spans]`.
Stages cover pointer/click event age, intent, session lookup, fetch dispatch,
response headers/parse, accepted state, tentative/confirmed DOM and paint opportunity,
round changes, long tasks/frame gaps, browser connectivity/visibility/focus, and
Arcade subscription or multiplayer stream open/renew/loss. Server spans contain
numeric request/auth/database/admission durations only. No cards, deck, scores,
names, email, tokens, request bodies, raw errors or raw headers are persisted.

Client input-to-fetch, fetch-to-response and response-to-paint intervals can be
compared within a request correlation. Server request duration separates backend
work from the remaining round-trip/browser delay. Database RPC spans include the
server-to-database network. Browser event timestamps and RAF opportunities do not
measure physical touch onset or physical display output. Safari frame gaps provide
evidence when Long Tasks is unavailable.

Jeremy should report approximate local time, Arcade/multiplayer, round, device/browser,
and what felt delayed. Retrieve through the authorized database connector:

```sql
select g.armed_at,g.expires_at,g.retain_until,c.capture_id,c.mode,c.updated_at,c.samples
from private.run21_timing_grants g
join private.run21_timing_captures c using(user_id)
where g.user_id = :verified_hap_auth_uuid
order by c.updated_at desc;
```

No developer tools or manual activation are required. Saved evidence survives reload
and browser closure. A forced close/offline shutdown can lose the newest unsaved
30-second tail; final uploads are best effort. Report promptly, before eight newer
captures replace the incident. No public diagnostic read endpoint or gameplay UI
is added.

## Validation

The local and deployed rollback proof covers authenticated ownership, anonymous and
other-account denial, idempotent replacement and late-replay ordering, malformed/oversized payload rejection,
eight-capture retention, both modes, expired grant rejection and cascading purge.
Security advisories for default-deny private tables and authenticated SECURITY
DEFINER RPCs are intentional: tables have no client grants, functions have empty
search paths and authorize exclusively with `auth.uid()`. No unrelated advisories
were changed.

Focused tests cover three-round retention, no per-move writes/requests, bounded
offline capture, upload cancellation, realtime-first paint correlation, observer
cleanup, exact expiry even before timers resume, automatic activation in both
modes, stable renders and logout isolation. The continuous browser harness uses
the actual Arcade service, hooks, board, audio and an isolated PostgreSQL clone;
its automatic mode uses no URL flags and proves durable retrieval of rounds 1–3.
The passing run saved 848 samples in two uploads (54,494 / 72,047 bytes), with one
channel throughout, 220 / 218 / 221 listeners and p95 frame intervals 16.9 / 17 / 17 ms.
P95 intent-to-paint was 238 / 226 / 258 ms; p95 local server time was 203 / 202 / 225 ms.
No progressive degradation was reproduced. A full-capacity desktop microbenchmark
measured 0.62 microseconds per record and 1.1 ms to serialize 2,400 samples (150 kB).
These are local Edge measurements, not physical iPhone or production WAN evidence.
See `dev/run21/account-timing.evidence.json` for aggregate evidence.

317 regression tests plus focused hook/expiry/cleanup checks pass; typecheck and
Vite production build pass. The database proof was repeated against deployed
migrations `20261019192529` and `20261019193157`.

Smoke: play either Run21 mode normally as Hap; check unchanged input, audio, scoring
and completion. Near round 3, report any lag with time/mode/round/device. A capture
should exist without manual activation. Expiry and retention are verified by the
server grant, not by changing a browser clock or gameplay state.
