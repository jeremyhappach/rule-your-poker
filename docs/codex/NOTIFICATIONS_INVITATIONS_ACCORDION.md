# Invitations and compact match Notifications - local candidate - 2026-10-31

Production base is `ea6bba1e5912479445dec4f1c40101086837984b`.
Enrollment and delivery were activated with explicit approval; Vercel deployment
`dpl_FTsp1Xwato4xdR1BPdT46WSi85Q2` is READY, both aliases verified, cron job 120
is active, and a Vault-authenticated request returned 200. The owner confirmed
the new-turn alert arrived on the iPhone. This supersedes the earlier dormant
status. Invitation alerts were omitted from that release: the reported match
was still `invited`, with no actionable turn/event/delivery. No customer match
was accepted, replayed, or changed by this investigation.

## Local correction

- Per-match Notifications starts collapsed on entry. The personal match checkbox
  remains visible; it and the separate keyboard-accessible chevron have independent
  actions. Expanding never saves preferences or requests permission. Quiet hours,
  device permission and delivery details remain inside. Load/save errors remain
  visible when collapsed. This is not a global master switch.
- Global Match invitations defaults off and is independent of Your turn (the
  existing new-match default and per-match override). New real-money tables and
  quiet hours remain separate. No preference or device is automatically enabled.
- A deferred INSERT trigger creates one invitation event for the invitee only,
  using the existing private outbox, per-device binding and lease/receipt CAS.
  There is no historical backfill or replay on later opt-in or match updates.
- Claim/authorization recheck pending status, current invitee, expiry, membership,
  active account/session, removal/hold and personal invitation opt-in. Acceptance,
  decline, cancellation or expiry suppresses unsent invitations. Quiet hours defer
  only a still-pending invitation; acceptance during the quiet interval discards it.
- The existing `/delayed/:id` landing fetches current authorized state and shows
  Accept/Decline only for a pending invitation. No automatic acceptance. Generic
  push text exposes no private cards, scores, stakes or opponent details. Invitation
  and later turn use the same notification tag; retries retain event identity.

## Migration and access

Candidate: `supabase/web-push/invitations.sql`, applied after the existing
notification and pinned-timezone migrations. It adds default-false
`private.push_defaults.invitations_enabled`, extends the private event kind check,
replaces existing own-preference/eligibility/authorization definitions, and adds
one private trigger helper. No new public RPC, grants, roles, service keys or direct
table access. All existing grants are retained; direct helper execution is revoked
from PUBLIC, anon, authenticated and service_role. No gameplay/financial schema,
deadline, admission or customer-state change.

## Qualification and publication boundary

Evidence lives under `qualification.local/notifications/` and
`qualification.local/web-push/`. Direct SQL proof uses a disposable localhost
database with explicit auth.sessions fixture scaffolding; races use two independent
DB callers. Existing turn, Last Call, table-opening, timezone/quiet rules run against
the final invitation schema. Cleanup is verified. It is not hosted Auth or physical
invitation-delivery proof.

Passed: 3,380 source tests (including six new preference/accordion regressions),
241 harness tests, 30 notification Node tests, application/API TypeScript and
production Vite build. The local SQL proof records 36 check groups with cleanup
verified. Phone 390px and desktop 1280px compiled-App scenarios pass, plus five
separate mocked permission states. The final browser screenshots were inspected.

Actual compiled-App phone/desktop tests use loopback mocked accounts/RPCs; they
cover collapsed entry, independent save/expand, keyboard, reload, invitation landing
and stale/unauthorized routes without permission prompts or acceptance. Separate
permission scenarios are explicitly mocked. The existing real iPhone new-turn
smoke belongs to the production base, not the new invitation candidate.

No production migration or publication of this correction is authorized yet.
Release requires the additive migration plus qualified frontend/service-worker
publication. Then reopen the Home Screen app so its updated push worker is active,
explicitly enable Match invitations, and use a new owner-authorized invitation for
physical acceptance. The existing invitation will not be replayed. Provider
acceptance and actual phone receipt must be recorded separately; acceptance after
provider handoff cannot retract an already accepted external notification.
