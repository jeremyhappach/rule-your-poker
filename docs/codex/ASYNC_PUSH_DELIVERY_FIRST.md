# Async push re-alert hotfix — November 7, 2026

## Physical smoke failure and temporary diagnostics

Jeremy completed Hap's TriTowers game and current Run21 turn. The database then
showed no Hap availability keys and `turn_epoch=NULL`; Run21 was with Happach
Gmail at segment 3. Hap's installed iPhone app was backgrounded. Gmail's normal
turn completion returned Run21 at segment 4 and opened epoch 4.

Fresh event **ee92e592-013d-4bff-a0ef-510562703c3a** was created
**2026-11-07 16:15:54.446420 UTC (10:15:54 AM Central)**. The enabled Apple
subscription recorded `sent`, attempt 1, with `retry_at=16:17:00.889322 UTC`, a
valid session and matching server binding. Jeremy reported **nothing appeared
after two minutes**. No service-worker receipt or display result was previously
observable remotely. A successful provider response does not establish display.
The failed event, delivery row, subscription and match are preserved.

The original hotfix request explicitly authorized scoped diagnostics after a
missing fresh alert. Checkpoint `async-push-phone-trace-2026-11-07` adds:

- Local worker trace, capped at 48 records, only for this match and the SHA-256
  fingerprint of Hap's enrolled binding. Stages are received, binding checked/
  rejected, show attempted/resolved/rejected, receipt saved and worker error.
  Diagnostic failures are swallowed independently of the delivery path.
- A read-only snapshot in Hap's installed app before optional device maintenance:
  permission, app visibility/standalone state, active/waiting worker state/version,
  current match notification IDs, historical receipt membership for the failed
  event and 8:00 AM event, binding and subscription fingerprints, and the trace.
  It can inspect existing cached receipts even if an old worker is still active.
- An authenticated POST branch on the existing `/api/web-push` endpoint. Supabase
  verifies the bearer token; only Hap's UUID may submit. Same-origin, 16 KB input
  bounds and a strict logging allowlist exclude raw tokens, subscription endpoints,
  encryption keys and binding values. The server records `ptown-push-diagnostic`
  lines for investigation; GET scheduler behavior is unchanged. Duplicate
  snapshots are coalesced within the app process, with no polling loop or new UI.

Collection and upload expire **2026-11-09 00:00 UTC**. No database schema changes,
reenrollment, historical receipt resets, gameplay mutation or provider send is
part of this diagnostic publication. Remove the expired instrumentation after
acceptance. Console records are trace evidence, not physical display acceptance.
Forty-four push tests, ten mounted onboarding tests and application/API typecheck
pass, including missing cache, old-worker receipts, binding rejection, display
failure, diagnostic-write failure, account/origin/expiry/size gates and redaction.

Server comparison fingerprints for subscription `17bc3129-f596-4444-83e1-ad4c14682ac8`:

| Field | SHA-256 |
| --- | --- |
| Binding | `ce088752b9efb265bf36c0cb633c195a2d829c9aaf55d0476eaa6ed8c4c78111` |
| Endpoint | `7e8c2089a55d93c2216cf62665c621bf30780e8a3daf5d17c112ebf83614491e` |
| p256dh | `5ad7083d0030243ac2981068f0fcbbe9c98546e662061985fdc9ce26806ea573` |
| auth | `c23a28b51e74fae95e523a59777a2c1c3f90f209889f68dc802bde90323def2b` |

## Scope and evidence

Jeremy authorized recreating scratch commit `0d1cb74` if unavailable, publishing
through the Windows helper, and verifying actual display on Hap's installed
iPhone app. The scratch object was unavailable. The isolated task branch starts
at current main `169734bfb3d8caf9765d1af1e113aa95f2547ab1`; the unrelated Golf
checkout and its uncommitted work are preserved.

`public/ptown-push-sw.js` now sets `renotify` for fresh, unexpired `invite`,
`turn`, and `last_call` events. Same-event retries and expired events remain
silent with `renotify=false`. Existing match tags, receipt serialization/cache,
account binding, guarded tap destinations, titles/bodies and table/registration
alert behavior are preserved. This repairs the known same-match replacement
behavior; it does not establish the cause of the November 7, 8:00 AM Central miss.

`node --test dev/web-push/*.test.mjs`: **37 passed**, zero failed. Regression
coverage includes a fresh event replacing an earlier same-match alert, a retry
of that new event, a distinct expired event, all three async kinds, and unchanged
table/registration replacement behavior. These are service-worker harness tests,
not evidence of physical iPhone delivery.

## Production SQL discrepancy — corrected November 7

Read-only production inspection of project `xvhmbuppghwmwpwrkzao` confirmed
migration `20261107024144_async_push_delivery_first` in the migration ledger.
Its exact stored SQL is now tracked in source. **It was not reapplied.**

The later installed migration `20261107034130_async_turn_notification_opponents`
replaced both `public.async_push_claim()` and
`public.async_push_authorize(uuid,uuid,uuid)` with definitions containing:

```sql
e.kind IN('table_open','turn','last_call') AND private.push_user_active(e.user_id)
```

Both live function definitions contained that predicate when inspected. Active-account
turn and Last Call dispatch was therefore suppressed despite the earlier migration
receipt. Quiet Hours and opt-out/binding eligibility checks were still present.
The installed `private.push_sync(uuid)` retains zero-to-positive availability,
`turn_epoch`, and one turn event per match/recipient availability cycle.

Jeremy approved the prepared forward repair. Migration **20261107160240**, named
`async_push_delivery_first_restore`, replaces only that presence predicate with
`e.kind='table_open' AND private.push_user_active(e.user_id)` in both functions.
The opponent-name payload and every other guard remain intact. The historical
migration and ledger were not replayed or rewritten. The Supabase CLI was not
available; the supported migration tool assigned the recorded version, which
was then used for the source filename.

`supabase/web-push/delivery-first-proof.sql` passed before and after installation.
It copies the inspected owner definitions into transaction-local test functions,
substitutes only the approved predicate for the candidate, and scopes the claim
scan to one synthetic subscription. Actual eligibility, Quiet Hours, cycle and
receipt owners operate on synthetic rows. No global claim or provider call runs.
The proof rolls back all fixtures and confirms zero remaining fixture profiles.
Setup was corrected to obey current account-access and frozen-deadline guards;
no triggers or constraints were disabled.

Cases: both money modes; active turn, Last Call and invitation; background turn;
Quiet Hours at claim and authorize; match and invitation opt-outs; disabled
device, changed binding, expired auth session and foreign lease; one turn event
per cycle, later-child dedupe, clear/rearm, old-cycle rejection; retry identity,
duplicate receipts; expired invitation, terminal match and service-only dispatch.

Installed function MD5s match exact pre-install definitions with only the approved
predicate replaced: claim `3589192223fb42e23191516992821761`, authorize
`b0602f6bb8eba4e62e7a04401fb6fb7a`. Fingerprints for `push_sync`, `push_eligible`,
`push_quiet_at` and `async_push_receipt` are unchanged. Table-open suppression and
registration behavior remain unchanged by the exact two-predicate diff.

## Publication and physical acceptance

Worker checkpoint tag: `async-push-realert-2026-11-07`. Commit
`f7038cf74f4870c88ae57bfcfbf04c5e97e5a88c` reached Vercel READY and the production
build manifest on November 7. The public worker SHA-256 matched source exactly:
`25d91f10eede8d52e92c8d3ba9fefda0a673c039eccb28ba8d17500c85a9b25d`.
Forward-repair checkpoint: `async-push-delivery-restored-2026-11-07`.

Jeremy confirmed Hap's iPhone is available for observation. No connected physical
iPhone tool is available. Actual display remains pending Jeremy/Hap's observations;
provider acceptance alone is not display evidence. Hap's authoritative account is
`d7dc1928-3727-4351-b0ff-0e80c81c2953`; its one enabled Apple subscription is
`17bc3129-f596-4444-83e1-ad4c14682ac8`, with a valid session. Quiet Hours were off
at inspection. The opted-in play-money match with Happach Gmail is
`d78bc9e8-2ede-4bbd-9032-80cfdef01aa6`; Hap had two outstanding turns, Run21 and
TriTowers. A normal clear/rearm is needed for a fresh cycle; existing production
matches, episode rows and sent receipts were not edited to manufacture a test.
Reopen the installed app after publication and ensure the updated worker has
activated (an already-open app can retain the old active worker during update).

1. Use an opted-in match/device outside Quiet Hours. Produce a genuine new turn
   availability cycle with Hap backgrounded and record the event UUID and time.
   Observe the iPhone alert and leave it in Notification Center.
2. Clear all actionable turns, then create another availability cycle in that
   same match. Keep the first notification present. Observe the second alert.
3. Include a fresh cycle while the installed app is open. Observe the actual OS notification.
4. Retry an identical event under a scoped test; expect no new audible/banner
   alert. Do not fabricate a new event UUID and call it a retry.
5. If a fresh alert is absent, correlate its server receipt and Apple subscription
   with worker receipt, local binding decision and `showNotification` resolution.
   Current worker code has no durable diagnostic receipt for those phone stages;
   add scoped diagnostics if the device cannot expose them directly. Do not claim
   the November 7 miss explained, or the end-to-end issue fixed, without evidence.
