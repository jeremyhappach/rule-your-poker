# Engineering workflow

## Start with evidence

Capture exact game/session/dealer-game/hand/round identity, authoritative actor/state, last successful mutation, first missing/incorrect transition, source owner, database owner, presentation owner, and preserve list.

Do not trust a UI label to identify the authoritative actor.

## Investigation order

1. Read current release notes.
2. Inspect the exact component/hook/RPC.
3. Query authoritative state read-only.
4. Reconstruct the action/event tape.
5. Prove or reject hypotheses.
6. Identify the smallest owner-level correction.
7. Patch only after the failure boundary is proven.

## Production repros

- Preserve frozen sessions.
- Do not refresh, repair, remove players, or force state until evidence is captured.
- Prefer a real parked state over a synthetic harness.
- After fixing, first test whether a corrected client recovers the preserved session without DB repair.

## Database work

- inspect deployed definitions, indexes, constraints, and RPC SQL;
- prove Postgres and PostgREST conflict behavior;
- use `BEGIN`/`ROLLBACK` for safe SQL proofs;
- remove PostgREST proof rows;
- report actual SQLSTATE/errors;
- never infer SQL atomicity from TypeScript;
- never guess balances or fabricate snapshots.

## Scheduler/realtime work

When an action parks, verify the authoritative actor, whether clients observed authority, edge-driven and state-driven wake paths, in-flight guards, lost wakes, dedupe/CAS keys, and remount/reconnect recovery.

Do not repair missed edges with arbitrary timers or polling.

## Presentation work

Identify the live rendered owner, inspect actual hierarchy/computed layout, distinguish missing data from clipping, preserve canonical geometry, and prove touch behavior on the actual engine when relevant.

## Validation

Default:

```bash
bunx tsgo --noEmit
```

Broader tests only when requested, when a reliable focused test exists, or when the task specifically requires direct DB proof.

Published runtime smoke remains acceptance.

## Task shape

Use issue-shaped tasks with context/repro, exact scope, required investigation, acceptance contract, preserve list, prohibited approaches, validation, and return format.

Large work begins in planning/read-only mode. Implementation follows after the owner and plan are proven.
