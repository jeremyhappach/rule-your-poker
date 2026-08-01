# Project context

## Product

P-Town Poker is a persistent multiplayer card/dice platform supporting humans and bots across seven games:

1. Holm
2. Cribbage
3. Gin Rummy
4. Yahtzee
5. 3-5-7
6. Horses
7. Ship Captain Crew (SCC)

The app supports dealer rotation, persistent sessions, connected/reconnecting clients, bots, waiting/sitting-out participants, observers, terminal settlement, and a shared table experience.

## Stack

- React 18
- TypeScript
- Vite
- Supabase PostgreSQL
- Supabase Realtime
- PostgreSQL RPC/functions and migrations
- Edge Functions where present
- DB-authoritative round/game state, including JSONB in game-specific paths

Desktop-specific table implementations are deprecated. The mobile/canonical shell is the product surface.

## Product owner and acceptance

Jeremy is the product owner and primary runtime tester. His published production smoke is acceptance truth. Source explanations, typecheck, detached browser replicas, and synthetic tests do not override a failing runtime.

Jeremy prefers:

- one coherent task at a time;
- investigation before patching;
- narrow changes with explicit preserve lists;
- no speculative timer/polling fixes;
- no success toasts when the visible table-state change is confirmation;
- concise, exact reporting;
- minimal waste of paid agent cycles.

## Lovable-to-Codex transition

Lovable built and published the product through the current release candidate. Lovable credits are nearly exhausted and should not be purchased again for routine work.

Codex becomes the central workspace after the final stable Lovable publish is smoke-tested, pulled/recloned, recorded by SHA, and tagged.

After cutover:

- Codex owns day-to-day investigation and implementation.
- Broad read-only audits may also suit Claude Code, but no second agent should edit the same defect/branch concurrently.
- Git is the durable engineering source of truth.
- Remaining Lovable credits are reserved only for an unavoidable pre-cutover release blocker.

## Product-quality stance

The target is a stable product with known technical debt, not a fictional zero-backlog state.

Release blockers include gameplay freezes, incorrect settlement/balances, missing participants/results, unrecoverable lifecycle state, broken canonical surfaces, or regressions in legal actions and terminal presentation.

Nonblocking architecture debt should be documented and moved to the Codex backlog rather than delaying cutover.
