# Sweep and multiplayer Golf smoke corrections — 2026-10-24

Status: local candidate; production database migration requires Jeremy's approval.
No main integration, production migration, publication, admission change, historical
session edit or financial repair has occurred in this workstream.

Base: `761fbf3329c25598e133ba5d292104756e427c70`; isolated branch
`codex/golf-sweep-smoke`. The older source checkout and other task worktrees are
preserved. The existing 357 incident remains contained and paused.

## Findings and corrections

| Report | Confirmed owner / boundary | Candidate correction |
| --- | --- | --- |
| Sweep sequencing | `MobileGameTable` started its normal overlay in the leg-flight completion handler. The legacy flight component used a timer, and an unresolved seat could fall back to felt center. The instant controller had an overlay but no leg-flight child. | Start one overlay with direct seat-to-winner flights. Both actual animation completions are required; preserve the exact zero-flight credit cursor gate before pot admission. Missing endpoints reconcile without inventing a center/pot destination. Stable terminal identities, event dedupe and identity retirement remain. |
| Sequential opening | Deployed `golf_action` required current actor and exact shared revision; `golf_reduce` exposed each actor's two cards and advanced the turn. The client cleared partial choices on any peer revision. | Persist private choices per player UUID under the existing locks. Admit independent opening submissions from the same revision, dedupe receipts, reject changed commits, and reveal only when all required players commit. Restore the established dealer-relative first actor. Preserve local partial choice across peer commits. |
| Hidden opponent stock draw | Deployed `golf_visible` masked pending cards for everyone except their actor; `golfSnapshot` rejected opponent pending cards. | Newly dealt holes explicitly project their public pending draw. Client validates the admitted actor/card, renders the public draw transport and pending slot, and retains disabled/dim discard while resolving. Remaining stock and concealed tableau cards remain private. |
| Piles linger after final action | Piles were inside the non-scoring view, while scoring waited for final-card transport and its hold. | Authoritative hole phase hides and disables pile chrome immediately. Invisible source/destination geometry remains until the existing final-card transport retires. |
| Total precedes writing | Scorecard rendered the authoritative cumulative total at the start of its CSS pencil animation. The existing result deadline could release next-hole presentation without a writing receipt. | Each row keeps its previous total until its pencil-completion event, then updates/highlights it once. HUD/Info totals use the same row receipts. Live next-hole and terminal presentation wait for all rows. Recovery seeks current authority; reduced motion completes without waiting for nonexistent CSS events. |

The source proves the delayed-overlay boundary. The original reported visual
destination has no captured runtime trace in this task; removal of the unsafe
center fallback is source-backed prevention, not a claim that a missing anchor
was observed in Jeremy's session.

## Database package and preservation

Reviewable package: `supabase/six-card-golf/smoke-corrections.candidate.sql`.
It adds private `golf_open_commit` and replaces only `golf_deal`, `golf_reduce`,
`golf_visible`, `golf_snapshot`, `golf_action`, and `golf_schedule_bot`.
The existing request primary key `(dealer_game_id, request_id)` and match primary
key were verified against production. Lock order, authentication, membership,
pause/timeout policy and financial settlement remain authoritative and unchanged.
Bots can commit while humans choose; a peer commit does not renew the shared
opening allowance. Expiry still uses the existing pause/autoplay policy.

The `openingCommits` marker is created only when a new hole is dealt. Existing
hole states, archived frames, frozen /1 and /2 scoring rules, balances and
settlement records are not rewritten. New public draw/parallel-opening fields
appear with that new authoritative revision, avoiding an installation-time
equal-revision projection change. Complete any old hole under its original
contract; the corrected behavior begins at the next deal.

Client code accepts both contracts. Release coordination must ensure the matching
client is published and clients refresh before using a corrected new hole; the
old client deliberately rejects public opponent draws. Production migration and
installed rollback qualification are still pending approval. This candidate does
not reopen real-money 357 admission or alter its financial correction.

Captured deployed definitions used only for local reconstruction are in
`dev/six-card-golf/smoke-installed.sql`; this file is NOT the deployment package.
The candidate adds no tables, indexes or financial functions. Private helper
execution is revoked from public/client/service roles; public RPC signatures and
their existing grants remain unchanged.

## Qualification

- Direct local database proof: independent connections for 2/3/4 seats, same
  starting revision, all-player barrier, redacted intermediate snapshots,
  established first actor, exact replay, different-payload rejection, duplicate
  commit under a new request, public opponent/observer draw, stale gameplay
  rejection and outsider rejection.
- Six complete nine-hole matches: 2/3/4 seats in both money modes, nine linked
  rounds, duplicate/late receipts, one result, canonical balances, balanced
  transfer journals, final snapshots and private-authority privilege checks.
- Financial rollback proof: every winner/tie count for 2–4 seats in both money
  modes; canonical remainder allocation; injected after-chip failure rollback.
- Recovery rollback proof: bot opening and play, pause/resume, shared opening
  expiry, real-money pause, all-human inactivity, retained liabilities and
  corrupt-state containment. Synthetic data exists only in isolated local
  databases; financial/recovery fixtures roll back.
- Actual two-browser Golf flow: 390×844 phone and 1440×900 desktop; independent
  opening taps, opponent draw before placement and after reload, dim discard,
  immediate pile retirement during final transport, CSS pencil-before-total,
  horizontal layout bounds; zero page errors.
- Actual animation fixture at widths 390/1440, normal/reduced motion: concurrent
  overlay and flights, real completion callbacks, dismissal after both, and
  25 + 7 → 32 / 10 − 2 → 8 score rows; all four cases pass. This fixture is
  presentation-only; it is not evidence of production financial settlement.
- Component coverage includes both Sweep completion orders, duplicate events,
  Strict Mode, missing endpoints, per-row writing, successor hold and the actual
  Game route's terminal retention. Shared Mega pencil strokes are unchanged.
- TypeScript and production build pass; existing chunk/Browserslist warnings.
  Harness suite: 241 pass (12 files). Full source suite: 2,876 pass (414 files).
  An overlapping focused run timed out at Session Ended; the isolated route
  rerun and full source suite both passed the complete terminal handoff.

## Changed paths

- Sweep: `src/components/LegsToPlayerAnimation.tsx`,
  `SweepTheLegsAnimation.tsx`, `MobileGameTable.tsx`, and
  `ThreeFiveSevenTerminalController.tsx`, with completion and wiring tests.
- Golf: `src/components/golf/GolfTable.tsx`, `GolfScorecard.tsx`, `golf.css`,
  `useGolfCardPresentation.ts`, `useGolfScoringPresentation.ts`,
  `src/lib/golf/model.ts`, their focused tests, and
  `src/pages/Game.golfScoringIntegration.test.tsx`.
- Database: `supabase/six-card-golf/smoke-corrections.candidate.sql`.
- Qualification: `dev/six-card-golf/smoke-*` scripts/fixtures and optional
  context selection in `dev/six-card-golf/serve.mjs`.
- Release notes: this document and `docs/codex/CURRENT_RELEASE.md`.

Reproduction commands (installed dependencies only):

```text
node dev/six-card-golf/smoke-corrections-proof.mjs
node dev/six-card-golf/smoke-corrections-serve.mjs
node dev/six-card-golf/smoke-corrections-browser.mjs
node dev/six-card-golf/smoke-animation-browser.mjs
node node_modules/vitest/vitest.mjs run src --maxWorkers=2
npm run test:harness:unit
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
node node_modules/vite/bin/vite.js build
```

Detailed local evidence: `qualification.local/golf-sweep-smoke/`. The first Golf
browser attempt was invalidated by a development-server page reload during
scoring. The uninterrupted rerun passed. Two old tests expected timer completion;
they now emit real CSS events explicitly in jsdom. Test expectations were changed
for the approved behavior, without weakening authority or monetary assertions.

## Required production acceptance after approved publication

1. Fresh fake-money 357 normal and instant wins: one overlay starts with direct
   leg-to-winner movement; pot starts only after legs and overlay complete.
   Reconnect/runback must not replay a settled sweep or disturb balances.
2. Fresh Golf hole with 2–4 humans: all can select immediately; an early finisher
   waits; no partial choices/cards leak; gameplay begins only after everyone
   commits and uses the established first actor.
3. Observe and reload during an opponent's stock draw: drawn face stays public,
   remaining stock/grid stay concealed, and discard remains unavailable.
4. Last legal action for six-exposed, stock-threshold and retained /1 prolonged
   endings: no visible actionable stock/discard during completion.
5. Every score row: previous total through pencil writing, then one update;
   delayed/multiple rows finish before next-hole presentation. Repeat with
   reduced motion and reconnect. Physical iPhone smoke remains acceptance truth.
