# Compact async bell and pending invitation deletion — November 7, 2026

Approved scope: one compact turn action per match; match-scoped results suppression;
sender-only hard deletion of unaccepted invitations and legacy cleanup.

## Ownership and preservation

The notification-center RPC derives playable child counts and the earliest
effective deadline from current private state, excluding terminal, expired,
gameplay-expired, removed and held matches. Its per-match results filter runs
before the badge count and item limit; child completion counts stay attached to
their match and no review receipt is acknowledged. The current schema has one
results row per viewer/match, rather than a cross-match summary row.

The bell displays YOUR TURN, authoritative opponent identity and compact hours
or minutes. Its existing fresh-home navigation opens one playable child directly
or the match lobby for several. A monotonic presentation clock uses server time;
a one-shot deadline invalidation and existing events refresh authority without
polling. Both identical opponent names remain separate by match UUID.

Cancellation stays inside delayed_respond's existing authenticated actor,
request/fingerprint advisory lock and parent row lock. The new private deletion
helper permits only pristine, never-accepted invitations. It deletes the parent,
unstarted children, both players' notices and push queue in one transaction.
Accepted, initialized, incident-bearing, result-bearing and settled matches are
rejected. The existing final push authorization rejects a deleted event/lease.

Immutable request/removal receipts and two owner-only UUID/revision invalidation
rows survive without their parent foreign keys. They contain retry/invalidation
metadata, not an invitation or game. This prevents request replay from recreating
an invite and lets filtered Realtime UPDATE notify both lobbies and the bell.
All outcome/settlement restrictions, receipt immutability, RLS and permissions are
retained. A known canceled deep link returns the viewer to the async list.
Filtered DELETE events cannot provide this same invalidation contract; see the
[Supabase Realtime restrictions](https://supabase.com/docs/guides/realtime/postgres-changes#delete-events-are-not-filterable).

## Qualification

- Hosted candidate rollback proof and the same proof after installation passed
  with actual roles, constraints and immutable guards in both money modes.
- Sender/recipient/outsider authorization, duplicate/conflicting request replay,
  create replay, cancel-first and accept-first, initialized/completed exclusions,
  physical row deletion, both lobby projections, queued/leased unsent push,
  earliest playable deadline, same opponent across two matches, mixed results,
  result reappearance, badge count and unchanged review/settlement writes passed.
- Cleanup found exactly two prior sender-canceled never-accepted invitations.
  Both were physically removed; all previously accepted matches were preserved.
  No matching old invitations or synthetic hosted proof profiles remain.
- Six independent-connection cases in the isolated local PostgreSQL clone proved
  actual lock contention: cancel-first, accept-first and duplicate cancellation
  in each money mode. Hosted rollback proof is authority for installed schema;
  the clone uses repository push fixtures and the exact changed RPC definitions.
- Actual production App bundle through local HTTP/RPC bridge to PostgreSQL passed
  at 375, 390 and 430 pixels: two same-opponent rows, hours/minutes, filtered badge,
  one-turn direct entry, multi-turn lobby, results reappearance, and canceled
  invite absence for both players after refresh plus canceled deep links.
  This checks routing; actual gameplay execution was outside this scoped fixture.
- 285 focused async tests, application TypeScript and Vite production build passed.
  tsgo is unavailable; the installed tsc was used. No dependencies were installed.
- Security advisor output is identical before/after. Existing build warnings
  (Browserslist, chunk sizes and mixed imports) are unchanged.
- React review checked hook ordering/cleanup, account-generation guards,
  native button keyboard access, match keys and scoped styling.

Installed migration: 20261107172637_async_bell_pending_invitation_delete.
The Supabase CLI is unavailable; the connector-generated migration version is
tracked exactly. Candidate and rollback proof: supabase/async-bell-cancel/.
Runners: dev/async-bell-cancel/. Local evidence:
qualification.local/async-bell-cancel/{races,browser}.json and bell-{375,390,430}.png.
No production push delivery was deliberately triggered.

## Publication and smoke

Checkpoint: async-bell-cancel-2026-11-07. Publication uses the unchanged approved
main push helper and automatic Vercel deployment for ptown-poker-prod.
Deployment SHA/READY and the production build manifest are verified in the
delivery report. Physical iPhone owner acceptance remains pending.

On iPhone: open the bell with one-turn and multi-turn matches, including two
against one opponent; tap each YOUR TURN. Check hours/minutes and mixed results.
Finish or hand off all turns in one match and confirm its still-unseen results
return. Cancel a pending invite, refresh both accounts and confirm it stays gone.
Accepted and completed matches should remain available.

