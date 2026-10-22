# Canasta reconciliation — October 21, 2026

Local candidate reconciled from `6e439fd40db267084c61a159ccc30ed04fb9c1af`
with released main `6b15f4eb060df319df13d576948c343920a23b21`. The same remote
main was rechecked at 22:05 UTC. Main itself is not merged into, pushed or changed
by this work. Golf retains the next production slot. No production writes,
grants, deployments or admission activation were performed.

## What changed

- Current-main catalog/setup, Race Poker, 11 Up and Battle31 behavior is retained.
  Canasta is an additive Cards entry with frozen versioned help, no Arcade mode,
  two participant seats and a fake-money-only eligibility guard. A stale positive
  capability cannot enable real-money Run Back. Server admission remains the owner.
- The catalog's existing Defaults owner receives only a suggested Canasta stake
  of 5, matching the existing setup fallback. An existing administrator choice is
  preserved. No existing defaults or game timers change; 120 seconds stays frozen
  in the approved Canasta rules. Exact Run Back stake still requires new consent.
- Shared route terminal retention contains all three Canasta/Race/Battle branches.
  Existing chip, seat, announcement and terminal owners remain in place. Gameplay
  rules, scoring, bot policy and the recovery worker bundle are unchanged.
- Read-only production evidence identifies the current dispatcher fingerprint as
  `7b6ca8feaa35c1fcce8b00491783e9d4`. The guarded SQL insertion now requires that
  exact baseline, which includes Battle31. Removing only Canasta's insertion
  recreates the baseline byte-for-byte after CRLF normalization.

## Evidence

- 300 focused tests across 38 files passed: Canasta rules/authority, autonomous
  matches, physical cards/Jokers, canonical presentation, setup/Run Back/catalog,
  current-main Race/Battle/11 Up clients, Game handoff/realtime contracts and chip
  transport. Existing expected negative-case diagnostics remain.
- App, server and fixture TypeScript passed. Production build passed; existing
  Browserslist, mixed-import and large-chunk advisories remain. The condensed React
  review found no new conditional hook, duplicate owner or unstable physical key.
- Exact candidate and installed SQL proof bodies pass locally. Closed installation
  verifies execution/admission false and cron inactive. Fake-only admission,
  consent, signed financial results, balanced ledger, terminal RLS and controls pass.
- The combined local proof installs the released Race v2, 11 Up bots/Ready and
  Battle31 baseline into a disposable copy. It compares 305 existing functions,
  permits only the additive dispatcher change, preserves existing Defaults, and
  passes Canasta plus Race financial/rollback/replay/control and 11 Up Ready/reclaim/
  all-human proofs. The source snapshot is not mutated; the copy is dropped.
  Its old schema omits the actual deferred ledger trigger: the exact deployed
  trigger is restored only in the harness. Scheduler metadata is a fixture there.
- The separate network-disabled Docker clone exercises actual pg_cron registration,
  independent settlement/deadline/reclaim races, injected post-transfer rollback,
  and worker-process crashes/restarts. HTTP delivery remains explicitly stubbed.
- Rendered two-viewer browser checks pass for private projections, stock draw with
  unchanged deadline, selection across sorting, cancellation without a commit,
  discard/reconnect, eligible Auto-play, all-human pause without drawing, and reclaim
  separate from resume. Twelve layout cases cover 15/30/60/71 cards at 320×568,
  430×932 and 812×375. Every physical card was reached through pagination, targets
  exceeded 44px, one shell remained, and no browser page errors were reported.

Browser evidence: [report](evidence/canasta-mobile/reconciliation-browser.json),
[portrait](evidence/canasta-mobile/reconciled-authority-portrait.png),
[71-card landscape](evidence/canasta-mobile/reconciled-maximum-landscape.png).
SQL evidence: [combined proof](../../supabase/canasta/release/reconciliation-evidence.json).

The browser uses the existing loopback reducer fixture, with a test-only fresh-match
reset added for reproducible deadlines. It does not authenticate real accounts,
write finances or exercise hosted Realtime. Viewport emulation is not native-device
acceptance. Full authenticated Game-route lifecycle remains a hosted gate.

## Remaining release gates

The exact closed SQL, worker, preflight, rollback scripts and source/artifact hashes
are in [the release package](../../supabase/canasta/release/README.md). Migration
registration, hosted candidate/installed rollback proof, actual cron/pg_net/Edge
and Realtime delivery, approved two-human/human-bot tester sessions, terminal/
Run Back journeys and native iPhone acceptance remain. No tester allowlist is
implied by the global gate. Broad fake-money activation requires later approval;
real-money admission remains prohibited. Revalidate any baseline changes after
Golf or another release before installation.
