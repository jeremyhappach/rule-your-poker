# Notifications package — local qualification, activation held — 2026-10-31

This expanded package supersedes Push-only commit `866d0a25e254ee7cfc5b3093282a4b48af54c2bd`.
**Do not publish the old Push package by itself.** Personal Notifications, quiet
hours and new real-money table alerts belong in the same reviewed integration.
Implementation and local behavior qualification are complete. Current timezone
data compatibility, hosted Auth and physical-device delivery remain release gates.

- Checkout: `C:/Users/jerem/.codex/worktrees/fe00/rule-your-poker`
- Branch: `codex/async-web-push-local`; original base `2cbca79af6896e8e08e7db22c66de0b27183d562`.
- Coordinator-reported production: `042695ead71bcfc7321f87dc8bb8911e083344b7`.
  No integration into that base was attempted here.
- Sole integrator/publisher: audit chat `01a18430-0c6a-72cd-91cf-053e7998f001`.
- No push, hosted mutation, secret creation, subscription, OS permission grant,
  live notification, customer session mutation, wager or production deployment.

## Behavior and ownership

Lobby Settings contains a personal **Notifications** section, rendered by
`src/components/delayed/PushPreferences.tsx`. Device permission, explicit enable,
denied/revoked/unsupported/iOS Home Screen states remain separate from preferences.
The async default seeds only newly admitted matches; existing per-viewer overrides
persist. Match controls retain “Enable push notifications for this match”.

Quiet hours are one personal enabled/start/end/IANA-zone setting, applied at
delivery to **all** opted-in async matches, including existing matches. Times have
minute precision; start is included and end excluded. Overnight windows work;
equal times explicitly mean silence all day. Travel does not silently change the
saved zone. UTC instants are converted with PostgreSQL IANA rules, so both folded
hours and skipped local times are handled without a fixed-offset approximation.
The next boundary is found among actual UTC minutes. Match helper text shows the
saved window and zone, and explains that deadlines/Last Call timing never change.
In-app indicators and gameplay timing are untouched.

While quiet, async work is deferred to the next nonquiet boundary. At window end,
only the newest still-actionable due reminder per match/device can be claimed;
other due reminders are coalesced away. This also covers worker downtime through
the entire window and multiple simultaneous actionable child transitions. Last
Call retains its existing authoritative 24-hour requirement and original child/
segment identities. A stale/expired child cannot create a morning backlog.
Preference changes wake deferred work; opting out cancels pending/claimed work.

**New real-money table alerts are a separate default-OFF opt-in.** A deferred
notification-only trigger observes the session's first waiting/joining boundary.
`private.push_table_openings` records the session UUID once; creation retry,
reconnect, hand/dealer changes, fake-to-real edits and later opt-ins cannot replay
that opening. Historical sessions are seeded as already observed at installation.
The original/current host is excluded. A real, active human host is required.

Recipients must be active authenticated humans with the opt-in and an enabled,
session-bound device. Fanout and send authorization explicitly honor current
Run21 actor visibility and 3-5-7 concealment, maintenance, room capacity and
terminal/pending-end state. No session names, host identities, cards, scores or
other restricted details enter the payload. Table alerts expire after five minutes
and are dropped if quiet hours overlap their pending interval: no morning backlog.

Clicks use `/notifications/table/:sessionId`, a read-only landing route. It checks
fresh availability, presents the existing real-money warning and checks again on
acknowledgement before opening the ordinary table as an observer. It never calls
seat/admission/financial mutations. Signed-out clicks follow existing auth routing;
post-login destination preservation is not changed by this package.

The existing delivery lease, receipt CAS, private outbox, per-device fanout,
foreground match suppression and account/browser-lock binding fences remain.
Claim and authorization check current preferences/window. Payload expiry and
provider TTL are capped by the next quiet start and actual turn/table expiry;
the worker/transport check expiry again immediately before network send.
Settings changed after provider acceptance cannot retract an already accepted
external push. Exactly-once OS alerts are not claimed: receipt-loss retries use
stable tags/Topic, no renotify, and silent duplicate handling. Expired received
pushes show only a silent generic invitation to check the app. Physical behavior
under suspension, DND and offline delivery is not established locally.

## Exact security delta from the prior grant packet

Existing authenticated RPC grants are unchanged:
`async_push_preference(uuid,boolean)`, `async_push_subscribe(text,text,text)`,
`async_push_device(uuid,uuid,boolean,uuid)`.
Existing service-only grants remain exactly `async_push_claim()`,
`async_push_authorize(uuid,uuid,uuid)`, `async_push_receipt(uuid,uuid,uuid,text)`.

New authenticated EXECUTE grants:

- `notification_preferences(jsonb)`: read/patch only `auth.uid()`'s async default,
  table opt-in and quiet settings. No target user argument; strict key/type/time/
  IANA-zone validation. It cannot change another viewer's match override.
- `notification_table(uuid)`: returns only `{sessionId, realMoney:true}` for a
  currently eligible visible/open/nonfull real-money table, otherwise NULL or an
  authorization rejection. No seating, admission or financial mutation.

New private RLS table: `push_table_openings`; expanded private `push_defaults`
columns and `push_events` table-kind/target constraints. There are **eight** private
notification tables. All direct table privileges remain revoked for PUBLIC,
anon, authenticated and service_role. New private helpers are `push_quiet_at`,
`push_quiet_transition`, `push_table_allowed` and `push_table_changed`; their direct
EXECUTE is revoked for those roles. The new deferred trigger on `public.games`
writes notification tables only. SECURITY DEFINER functions use empty search paths.
No existing games policy, gameplay function, session creation function, canonical
seat function, ledger, settlement or customer balance owner is changed.

The recipient expansion is intentional: eligible opted-in users may receive a
new-table alert before becoming participants. That is the owner-discussed design;
the prior async-only audience was limited to existing match participants. The
publisher must review this exact delta before applying the final schema. No broad
service-role/table grant or recipient expansion beyond these checks is proposed.

## Local qualification and exact artifacts

- 29 Node tests pass: old device/account/crypto/scheduler cases plus guarded table
  clicks, generic table content, stale table pushes and send-time expiry guards.
- Full application/API TypeScript passes using existing packages read-only.
  No dependency installation, relocation or denied junction retry.
- Expanded final SQL proof passes rollback, claims/receipt races, seed/override
  isolation, quiet boundaries, overnight/equal times, spring gap, both fall folds,
  half-hour DST and quarter-hour zones, competing morning reminders, Last Call/
  deadline expiry, independently committed settings races, actual canonical
  `create_session` retry, new-table opt-outs, host exclusion, full/closed/maintenance/
  inactive/concealed eligibility and account rebinding. Owned disposable database
  removal is verified. Real-money fixtures have zero chips and no wagers.
- The older local DB fixture lacks Auth sessions and current create_session. The
  runner explicitly supplies the known Auth shape and unchanged repository
  session-creation/randomness definitions confirmed against production. It does
  not substitute a notification-only creation stub. The concealment-negative case
  forces the existing visibility helper false in a rollback-contained test; actual
  hosted concealed-round and Auth lifecycle checks remain required.
- Actual App and separately labeled permission mock bundles build with real
  routes/theme through esbuild/Tailwind. This is **not** the production Vite build.
- Browser proof passes at 390/1280 widths: settings saves, match overrides/helper,
  separate default-off table opt-in, fresh warning-confirmation check, no seat RPC,
  authorized/denied/deleted/unauthenticated links, logout and unchanged bell.
  Five labeled device mocks pass. No real permission prompt or push enrollment.
- Final UI race guards prevent regressive preference loads and stale account/
  route navigation. Phone screenshots were inspected.

Evidence: `dev/web-push/evidence/{database,browser,timezone-compatibility,source-hashes}.json`
and four phone PNGs. The hash inventory includes the final SQL, service worker,
sender, settings, guarded landing route and test inputs. Old 26-test evidence and
the old `61b9aa...` SQL hash do not qualify this version.

Final candidate SQL SHA-256:
`bd1c3a1fae8980d34d670a33aa29b09ddc75076fb770c067f1fa99e9dc26d811`.
Scheduler proposal SHA-256 (unchanged):
`9bc5a1f99f9b7474aa62c73795c86ccb9cbf5486ca81f085b9b3999de28a56ea`.
Activation preflight SHA-256:
`a94aaa4598a68662368302be82b606466e6d432cd63416efcaa4a081cfebf4fb`.

## Timezone compatibility blocks activation

`dev/web-push/timezone-golden.json` pins expected conversions to IANA **2026f**,
including 2026 changes in Vancouver, Edmonton, Casablanca, Winnipeg and Havana.
Local PostgreSQL passes Vancouver but fails the latter four golden cases. The
coordinator's hosted observations also show stale data. An available IANA name or
passing ordinary DST tests does not establish current-rule compatibility.

`supabase/web-push/activation-preflight.sql` is a read-only fail-closed release
check for these goldens and the reviewed restrictive games visibility policies.
**Do not enable either delivery/client flag until timezone data is reconciled and
the hosted preflight passes.** This file is a release gate, not an automatic DB
upgrade or a runtime replacement for timezone data. No zones are silently mapped
to offsets or excluded; no upgrade or new data dependency was installed here.

References: [Supabase stale timezone data](https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca),
[IANA 2026c](https://www.iana.org/time-zones/releases/2026c),
[IANA 2026e](https://www.iana.org/time-zones/releases/2026e),
[IANA 2026f](https://www.iana.org/time-zones/releases/2026f).

## Approved dormant setup and remaining publisher work

The owner approved dormant setup; this implementation chat did not perform it.
Vercel `ptown-poker` (`prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds`, team
`team_nQciG8fmHnUCogRJ7jaWawHq`), Supabase `xvhmbuppghwmwpwrkzao`.

- Generate one VAPID P256 pair and 32-byte scheduler token. Private material only
  in Vercel Production `WEB_PUSH_VAPID_PRIVATE_KEY` / `CRON_SECRET` and the matching
  Vault token `ptown_async_push_cron_secret`. Never logs, chat or Git.
- Public key: `WEB_PUSH_VAPID_PUBLIC_KEY` / `VITE_WEB_PUSH_PUBLIC_KEY`.
  Approved contact `WEB_PUSH_VAPID_SUBJECT=https://holm357.com`.
  `WEB_PUSH_DELIVERY_ENABLED=false` and `VITE_ASYNC_PUSH_ENABLED=false` initially.
- Reuse existing `RUN21_SUPABASE_URL` / `RUN21_SUPABASE_SERVICE_ROLE_KEY`.
  No new account, plan or service-role key. No new service grants.
- Review/apply final private schema and exact delta above, then dormant Node
  `GET /api/web-push`. No registered migration was installed from this checkout.
- Existing Supabase Cron facility: proposed job `ptown-async-push-delivery`,
  `* * * * *`, pg_net GET `https://ptown-poker.vercel.app/api/web-push`, timeout
  60000, Vault Bearer token. The coordinator reports job/secret absent. The inert
  `scheduler-proposal.sql` is unchanged. pg_net temporarily holds request headers
  in its privileged queue; Vault does not hide them from all DB administrators.
- Provider origins remain exactly Apple, Google and Mozilla's existing allowlist;
  redirects rejected, encrypted generic identifiers only. Endpoint authentication,
  60-second budget and dormant flags remain unchanged.

Publisher must integrate both commits from this branch with current main,
preserving recovery/finale/CurrentNet work, run actual Vite and combined-source
validation, inspect installed drift, qualify hosted restricted grants/Auth and
resolve timezone compatibility. Device enrollment, real test sends, public opt-in
activation and flags ON remain **separately unapproved**. Named iPhone Home Screen
and Android tests, DND/offline/suspension, revocation, multiple devices, account
switch, quiet hours, Last Call and links remain required. Owner smoke is acceptance.

Effective access: ordinary workspace edits, Node tests and read-only dependency
builds work; local DB sockets and Edge required scoped approvals. Git worktree
metadata is outside the writable root and requires a scoped local-commit approval.
No broader “Full Access” assumption or pending-request duplication was used.
