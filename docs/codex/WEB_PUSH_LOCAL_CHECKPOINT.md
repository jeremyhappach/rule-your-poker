# Web Push — locally qualified, production setup held — 2026-10-31

**Local qualification complete. Production setup and publication remain held.**
The owner resumed scoped work at 14:14:37 UTC. No hosted migration, production
credential, device enrollment or live notification has occurred. This candidate
is ready for local commit/integration review, with the explicit production and
physical-device gates below. Continue in the existing checkout; no second writer.

- Worktree: `C:/Users/jerem/.codex/worktrees/fe00/rule-your-poker`
- Branch: `codex/async-web-push-local`
- Base: `2cbca79af6896e8e08e7db22c66de0b27183d562`
- Coordinator-reported production/main: `b64a2d75be9cd2997dfe25a2feef38ea14f8231f`,
  accepted receipt `41151251116-2`. This checkout has not integrated that commit.
- Sole release owner: transition task `01a18430-0c6a-72cd-91cf-053e7998f001`.
- No pending approval is shown in this task's last observed tool results. The
  observed unit/typecheck/build/database/browser processes have exited. No
  persistent preview server was started. No task runner submits approval requests.

## Implemented candidate

`src/components/delayed/PushPreferences.tsx` supplies the exact per-viewer checkbox
“Enable push notifications for this match” and a separate Player Settings default.
`src/lib/webPush/` separates preferences from device/browser permission, requires
an explicit gesture, describes denied/revoked/unsupported/Home Screen states,
and binds enrollment to the current authenticated account. `PushLifecycle.tsx`
waits for resolved auth rather than treating initial loading as logout.
The in-app notification bell is unchanged.

`supabase/web-push/candidate.sql` is a local candidate, not a registered migration.
New matches snapshot each participant's default at creation. Existing matches
start opted out; changing the global default never rewrites match overrides.
There is no separate global master mute in V1; that remains an owner decision.
No invitation/completion push is generated.

Deferred triggers inspect the final match state, aggregate all newly available
child/segment identities into one match event per recipient/committed transition,
and avoid new events for ordinary revisions or removal of available turns. A new
turn is recognized even while another child in the match still waits. A single
24-hour reminder belongs to that event and requires one of its original turn
identities to remain pending. Eligibility rechecks participant, preference,
session/expiry, subscription binding, active fake-money match, hold/removal,
turn identity and deadlines. None of the existing gameplay or financial functions
is replaced. The final trigger candidate passes the local rollback/race proof.

One logical event fans out once to each device enabled at the transition. New
devices/preferences do not retrospectively flood old events. Per-device delivery
leases and CAS receipts support retries and competing workers. HTTP push services
cannot provide transactional exactly-once acceptance with the database: a worker
crash after provider acceptance but before its receipt may retransmit. Stable
provider Topic and browser match tag collapse retries; `renotify:false` is used.
Persisted event receipts mark retransmissions `silent:true`. Safari still requires
visible handling; after dismissal, a retransmission may recreate a quiet card.
An expired payload produces only a silent neutral invitation to check the app,
never a claim that a turn is still actionable. Browser support for silent delivery
and alert behavior require physical testing; exactly-once OS alerts are not claimed.
Delivery under DND/offline/denial is not guaranteed.

Foreground suppression is per device: while a visible page is on the relevant
match or its child route, a 45-second server lease renews every 30 seconds. The
sender skips that device's event at claim/authorization. Other devices can receive
it. A lost background signal can suppress for at most the remaining lease. There
is no client-driven event generation or gameplay polling. Received valid retries
still show/replace the notification because Safari requires user-visible pushes.
Stale account bindings are discarded for privacy. Payloads contain only event,
match, binding, kind and expiry identifiers; no racks, results or opponent scores.
Clicks enter the authenticated match landing projection and revalidate membership.

`server/webPush/{worker,transport,scheduled}.mjs` and `api/web-push.ts` implement a
bounded scheduled sender, standard AES128GCM payload encryption and ES256 VAPID.
The endpoint defaults closed. No cron entry was added. The local HTTP proof uses
the same handler/SQL worker and temporary in-memory keys with an injected mock
transport; it never contacts an external push service.

## Final local evidence

1. The old exec session `52647` was observed exiting 0 on resumption. A separate
   read-only check confirmed `web_push_fe00_1793402041595` absent and no matching
   database runner. Its original proof JSON was preserved.
2. `node --test dev/web-push/{unit,controller,service-worker,scheduled}.test.mjs`: 26 tests
   passed. Permission gesture/denial, partial enrollment, account switch during
   registration, logout/revocation, subscription loss, worker retries/privacy,
   click binding, expiry, encryption/decryption and VAPID signature checks are
   included. Tests also cover overlapping new-account enrollment, shared browser
   locks, delayed old-tab cleanup, failed remote revoke recovery, scheduler auth
   and the configured batch-duration bound.
3. `node dev/web-push/typecheck.mjs`: full application plus new API TypeScript
   passed with existing dependencies accessed read-only, without a junction or
   installation. The final source, including lifecycle/cleanup changes, passes.
4. `qualification.local/web-push/database-proof-resumed.json`: PASS and
   `cleanupVerified:true` for SQL SHA-256
   `61b9aa19918942a634aa371cb757d4a0da224b037d178a666219381f16ee2778`.
   Includes rollback assertions, independent DB claims/receipt races, late new
   turns, crash lease fencing, independently committed preference changes,
   account rebinding/session removal, local scheduled HTTP turn/Last Call sends,
   no duplicate receipt delivery, deleted-match suppression and owned DB removal.
   Final-source additions also pass exact-host/lookalike rejection, expired active
   gameplay, session expiry, incident hold and terminal-match suppression. The
   coordinator independently confirmed deployed auth.sessions id/user_id/not_after
   column shapes, but this is still local scaffolding, not hosted Auth proof.
5. `dev/web-push/evidence/` preserves the final SQL proof, browser results,
   phone screenshots and exact source hashes. Earlier f39b6f proof coverage is
   superseded by the final 61b9aa proof, not silently reused.
6. Actual App/route/theme bundle and separately labeled mock settings bundle built
   using read-only existing packages. This is an esbuild-based local App proof,
   not the repository's production Vite release build. Corrected automatic JSX
   and server-confirmed checkbox assertions pass. The final browser matrix passes
   at 390/1280 widths: real Settings/default, match persistence, authorized/denied/
   deleted links, unchanged bell, logout and unauthenticated route rejection.
   Five labeled permission/device mocks also pass, including Home Screen guidance,
   new-match seeding, existing overrides, per-viewer isolation and reload.
   Phone screenshots were visually inspected. No real OS permission was granted.
7. One read-only independent reviewer inspected the final implementation. Its
   cross-tab cleanup race was corrected under the shared browser lock and covered
   by a regression test. Duplicate/expired push handling was tightened as described
   above. Final source review and diff hygiene precede the local commit.

## Remaining release qualification

- Integrate with the release owner's current main, preserving recovery and f199
  CurrentNet edits. Run the repository's actual Vite release build and relevant
  combined-source checks in its supported dependency environment. This checkout
  used read-only packages without retrying the denied dependency junction.
- Separately approve and perform hosted schema/Auth lifecycle, scheduler and
  named-device qualification. The local proofs cannot establish APNs/FCM receipt,
  physical suspension, OS permission UX or hosted token-revocation timing.
- Reauthentication rejects an unauthenticated match route; this candidate does
  not alter the application's existing post-login destination behavior. Clicks
  from a valid signed-in account land on the exact authorized match.
- Confirm per-device foreground suppression and quiet retransmission behavior on
  physical iPhone/Android. A transport acceptance/receipt crash can still produce
  a repeated quiet card; external delivery is not transactional exactly-once.

## Concrete production setup packet — separate approvals required

No action in this section is approved or performed. Coordinator identity evidence:
Vercel project `ptown-poker`, ID `prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds`, team
`team_nQciG8fmHnUCogRJ7jaWawHq`, Vite. Supabase project
`xvhmbuppghwmwpwrkzao`, `https://xvhmbuppghwmwpwrkzao.supabase.co`.

- Runtime/endpoint: Node.js Vercel Function `GET /api/web-push`. Candidate config
  sets `maxDuration:60`. A batch starts jobs only within 10 seconds, maximum 20
  jobs. A final in-flight job can add claim RPC 10s + authorization RPC 10s + push
  transport 15s + receipt RPC 10s, giving about 55s plus small processing overhead.
  The bound is locally tested; no unbounded loop or in-memory retry queue is used.
- Existing plan is **Hobby**, confirmed read-only by the coordinator. Vercel's
  daily-only cron is insufficient. No upgrade, purchase or Vercel cron is proposed.
  The separately approved alternative would use existing Supabase pg_cron 1.6.4,
  pg_net 0.20.4 and Vault 0.3.1: job `ptown-async-push-delivery`, `* * * * *`, GET
  `https://ptown-poker.vercel.app/api/web-push`, timeout 60000ms. An inert proposal
  is in `supabase/web-push/scheduler-proposal.sql`; it has not been executed.
- Authentication: production environment + `WEB_PUSH_DELIVERY_ENABLED=true` +
  constant-time `Authorization: Bearer <CRON_SECRET>` validation. Secret minimum
  32 characters. Disabled endpoint returns 503, unauthorized enabled endpoint 401.
- Reuse existing production `RUN21_SUPABASE_URL` and
  `RUN21_SUPABASE_SERVICE_ROLE_KEY`. No new service-role key is requested. Worker
  calls only `async_push_claim`, `async_push_authorize`, `async_push_receipt`.
- New server configuration: `WEB_PUSH_VAPID_PRIVATE_KEY` (secret),
  `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_SUBJECT`, `CRON_SECRET` (secret),
  `WEB_PUSH_DELIVERY_ENABLED=false` initially. Public client variables:
  `VITE_WEB_PUSH_PUBLIC_KEY` and `VITE_ASYNC_PUSH_ENABLED=false` initially.
- Proposed Vault secret `ptown_async_push_cron_secret` must match Vercel
  `CRON_SECRET`; its creation and scheduled privileged requests require separate
  approval. pg_net temporarily stores bearer headers in its privileged request
  queue; Vault does not eliminate that database-level access to the token.
- Proposed owner-reviewable VAPID contact: `https://holm357.com`; an owner-approved
  `mailto:` or different HTTPS contact is also possible. No contact is approved
  yet. Generate/persist no production key or secret before specific approval.
- External push destinations are exactly `https://fcm.googleapis.com`,
  `https://updates.push.services.mozilla.com`, `https://web.push.apple.com`.
  Redirects are rejected. Private signing material is server-only.
- SQL access surface: seven private RLS tables (`push_defaults`,
  `push_match_preferences`, `push_subscriptions`, `push_presence`, `push_episodes`,
  `push_events`, `push_deliveries`), direct access revoked for public/client/service
  roles. Authenticated EXECUTE: `async_push_preference(uuid,boolean)`,
  `async_push_subscribe(text,text,text)`, `async_push_device(uuid,uuid,boolean,uuid)`.
  Service-role EXECUTE: `async_push_claim()`,
  `async_push_authorize(uuid,uuid,uuid)`,
  `async_push_receipt(uuid,uuid,uuid,text)`. Private helper execute is revoked;
  SECURITY DEFINER search paths are empty. Final digest, deployed definition drift,
  real Auth session behavior and hosted rollback qualification must be reviewed
  before approving installation. All seven tables/six public RPCs were reported
  absent by the coordinator's production read-only catalog query.
- Physical qualification requires named synthetic accounts/devices and explicitly
  authorized real test delivery: iPhone/iPad Home Screen app, supported Android,
  direct OS permission gesture, background/closed app, DND/offline, revoked
  permission, multiple devices, logout/account switch, deep link/re-auth, Last Call.
  No app-store account, SMS or customer enrollment is required or authorized.

Release ordering remains recovery, then qualified Web Push, with Tri-Towers polish
independently qualified rather than held for credential setup. Integrate only via
the designated release owner. In `Delayed.tsx`, this task owns two Push imports and
the checkbox insertion after match policy; f199 owns CurrentNet imports/rendering.
No CurrentNet or Tri-Towers lifecycle/artifact changes were made here.

References: [WebKit iOS Home Screen requirements](https://webkit.org/blog/13878/),
[WebKit user-visible Web Push](https://webkit.org/blog/16535/),
[Vercel cron management/authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
