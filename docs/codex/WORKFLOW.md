# Engineering workflow

## Normal issue flow

Jeremy normally reports an issue or improvement in plain English:

- what he observed;
- where he observed it;
- what he expected instead;
- any reproduction details he happens to know.

Codex uses this documentation, the repository, Git history, tests, instrumentation, and runtime/database evidence to determine what to inspect. Jeremy does not need to write an engineering specification, identify files, propose root causes, create formal acceptance criteria, or relay a large prompt from another conversation.

Ask a clarifying question only when missing information would materially change the diagnosis or make the work unsafe.

The standard sequence is:

1. Investigate read-only.
2. Report the root cause and smallest safe recommended fix.
3. Wait for Jeremy to challenge the diagnosis or reply `approve`.
4. After `approve`, implement, test, validate, review the final diff internally, create a local commit, and complete the Git integration and push needed to make `origin/main` publish-ready.
5. For routine work on local `main`, run `.codex\scripts\push-origin-main.cmd`; its sole Git operation is `C:\Program Files\Git\cmd\git.exe push origin main`.
6. For high-risk work, complete the necessary branch push, conflict-free fast-forward integration, and `main` push after validation.
7. Vercel automatically publishes the pushed `main` commit; Codex verifies the
   deployment, and Jeremy performs production smoke.

`approve` authorizes the Git actions, Vercel production publication, and schema
migrations explicitly included in the recommended solution. It does not
authorize unrelated production-data mutation or broader infrastructure work.
Never force-push. If a merge conflict, remote divergence, or other condition
requires a material judgment, stop and report it.

## Mandatory execution-budget policy

This policy governs how the existing workflow is executed. It does not create
routine approval gates or weaken the required database, ownership, or runtime
evidence.

### Agent orchestration

1. Do not spawn subagents by default.
2. Never use `fork_turns: "all"`.
3. Never allow multiple agents to edit the same worktree. The primary agent
   owns all implementation.
4. If independent review is genuinely warranted, use at most one read-only
   reviewer with all of the following:
   - `fork_turns: "none"`;
   - Terra Medium;
   - a compact task packet containing only relevant facts and exact paths;
   - no inherited conversation history.
5. The reviewer may inspect the final implementation once. It must not
   independently rediscover the architecture or begin editing.

### Proven-pattern migrations

When applying an architecture already accepted in another game:

1. Treat the accepted reference game as the architectural source of truth.
2. Compare only the target game's differences.
3. Do not repeat repository-wide architecture discovery, Git-history
   archaeology, or shared-infrastructure analysis unless contradictory evidence
   appears.
4. Read the reference implementation and target ownership paths once, then use
   bounded symbol and line-range reads. Do not repeatedly reread entire large
   files.
5. Use Sol High at normal speed for pattern application. Reserve Sol Ultra for
   genuinely unresolved architecture decisions, never mechanical application
   of an accepted pattern.

### Execution budget and circuit breaker

For a bounded single-game pattern application:

1. Target 25--35 minutes maximum.
2. Do not exceed one primary agent, one combined ownership search, one initial
   Git status, one final Git status/diff/check pass, or three database
   validation operations:
   - inspect schema and indexes;
   - run one complete rollback proof;
   - apply one migration and rerun the proof.
3. Include winner, tie, duplicate, replay, late-replay, authorization,
   continuation, and terminal-state cases in the initial rollback proof before
   applying any migration.
4. Do not apply the migration until the complete rollback proof passes.
5. If execution exceeds 35 minutes, 100 tool calls, or requires repeated reads
   of the same large file, stop before consuming more compute and report:
   - what is blocking completion;
   - why the reference pattern was insufficient;
   - the smallest decision needed from Jeremy.

This circuit breaker is a usage-safety exception, not a routine additional
approval gate.

### Scope control

1. Do not combine implementation with unrelated documentation cleanup, backlog
   grooming, webhook investigation, or deployment troubleshooting. Queue
   unrelated findings for later.
2. Complete database, client, and release work as bounded internal phases under
   the existing approval:
   - database proof and migration;
   - client implementation and focused tests;
   - one preview/build and one production verification.
3. Establish tool availability once, then continue with the supported path;
   do not repeatedly probe unavailable tools.
4. Do not poll deployments every few seconds. Wait once for an appropriate
   interval, then check once.

## Investigation phase

For every active runtime bug, begin read-only. Treat actual runtime behavior as authoritative evidence.

Investigate the relevant ownership chain, source, focused tests, Git history, instrumentation, deployed database definitions when applicable, and prior attempted fixes. Establish the exact authoritative identity, last successful mutation, first missing or incorrect transition, source/database/presentation owner, guards and dedupe keys, lifecycle resets, and behavior that must be preserved.

Do not trust a UI label to identify the authoritative actor. Do not patch a visible symptom until the owner-level failure boundary is proven.

Use this investigation order when applicable:

1. Read the current release state and task-relevant documentation.
2. Inspect the exact component, hook, service, RPC, migration, test, and relevant Git history.
3. Query authoritative state read-only.
4. Reconstruct the action or event sequence.
5. Prove or reject the leading hypotheses.
6. Identify the smallest safe owner-level correction and preserve list.
7. Define the exact runtime acceptance smoke.

The normal investigation response is compact:

**Root cause**

A plain-English explanation.

**Recommended fix**

The smallest safe correction.

**Risk or uncertainty**

Only material concerns.

**Approval**

Ask Jeremy to reply `approve` or provide pushback.

Do not dump raw source investigation, extensive ancestry maps, complete Git history, or a large formal audit unless the task is genuinely high-risk, evidence conflicts, Jeremy requests it, or the detail is required for a safe decision.

## Meaning of `approve`

For the recommended scope, one `approve` authorizes Codex to:

1. Implement the approved correction.
2. Modify every required local file within scope.
3. Add or update focused tests when they provide useful regression protection.
4. Run all relevant validation available in the environment.
5. Resolve validation failures caused by the change.
6. Inspect the final diff for accidental or unrelated edits.
7. Stage the intended files and create a concise local Git commit.
8. Apply and verify any approved schema migration before the dependent client
   reaches production.
9. Complete the required branch integration and push to `origin/main`.
10. Monitor the automatic Vercel deployment through `READY` and verify the
    production routes.

Do not ask for separate approval for editing, tests, typechecking, linting, building, showing the diff, staging, the local commit, branch integration, or pushing `main`.

If implementation shows that the recommended solution was materially wrong or that substantially broader work is required, stop and report the new evidence instead of silently expanding scope.

## Git delivery after approval

An approval authorizes the Git actions needed to make the approved work
available to Vercel from `origin/main`. For routine work on local `main`, Codex
runs the fixed project helper:

```text
.codex\scripts\push-origin-main.cmd
```

The helper's sole Git operation is:

```text
C:\Program Files\Git\cmd\git.exe push origin main
```

Codex performs that push itself and does not send Jeremy to Git Bash. Never pass arguments to or modify the helper or its rule as part of ordinary work. Never add push options, change the remote or ref, or force-push.

For high-risk work, Codex uses the required task branch, completes any necessary branch push and conflict-free fast-forward integration after validation, then pushes `main`. If a merge conflict, remote divergence, or other condition needs a material judgment, Codex stops and explains it rather than choosing a resolution silently.

## Queue and backlog memory

`docs/codex/BACKLOG.md` is the durable work queue.

When Jeremy reports a second bug, smoke-test observation, improvement, or follow-up while another issue is being investigated or implemented:

1. Keep the current issue active unless Jeremy explicitly says to switch.
2. Briefly acknowledge that the new item has been queued.
3. Search the existing backlog and merge with a matching item instead of duplicating it.
4. Automatically add or update the backlog entry with:
   - the plain-English observation or idea;
   - expected behavior;
   - device, game, screen, or runtime context;
   - reproduction details;
   - screenshots, traces, game IDs, or build details supplied;
   - whether it came from production smoke;
   - date reported;
   - status `Queued`.
5. Assign priority only when reasonably clear; do not exaggerate severity.
6. Do not investigate, diagnose, or patch the queued item until it becomes active.
7. Do not let backlog capture expand the current product-code scope.

Automatic backlog capture is pre-authorized documentation work and needs no separate approval. When practical, keep backlog-only changes in a separate local documentation commit from product changes, without creating another user approval gate. Never lose or silently discard a queued observation because the active issue, chat, or smoke session changed.

When Jeremy asks “what's next?”, “what's next in queue?”, “we're clean, what's next?”, or “pick up the next backlog item”:

1. Read the backlog and relevant current release state.
2. Ignore completed, superseded, duplicate, and blocked entries.
3. Select the highest-priority actionable item.
4. State the selection and why it is next in one or two sentences.
5. Begin the normal read-only investigation automatically.
6. Wait for `approve` before editing product code.

If genuinely equal-priority choices would materially affect product direction, present only the small number of meaningful options and ask Jeremy to choose.

## Specialized investigation rules

### Production repros

- Preserve frozen sessions.
- Do not refresh, repair, remove players, or force state until evidence is captured.
- Prefer a real parked state over a synthetic harness.
- After fixing, first test whether a corrected client recovers the preserved session without database repair.

### Database work

- Inspect deployed definitions, indexes, constraints, and RPC SQL.
- Prove PostgreSQL and PostgREST conflict behavior.
- Use `BEGIN`/`ROLLBACK` for safe SQL proofs.
- Remove PostgREST proof rows.
- Report actual SQLSTATE/errors when material.
- Never infer SQL atomicity from TypeScript.
- Never guess balances or fabricate snapshots.
- Preserve database-authoritative, idempotent, replay-safe, and disconnect-safe financial ownership.

### Scheduler and realtime work

When an action parks, verify the authoritative actor, whether clients observed authority, edge-driven and state-driven wake paths, in-flight guards, lost wakes, dedupe/CAS keys, and remount/reconnect recovery.

Do not repair missed edges with arbitrary timers or polling.

### Presentation work

Identify the live rendered owner, inspect actual hierarchy and computed layout, distinguish missing data from clipping, preserve canonical geometry and shell ownership, and prove touch behavior on the actual engine when relevant.

## Validation and internal review

Codex owns validation. Run the checks relevant to the approved change, which may include focused tests, typecheck, lint, build, `git diff --check`, and direct source, SQL, or PostgREST validation.

The default narrow check is:

```bash
bunx tsgo --noEmit
```

Use broader tests when the task warrants them or a reliable focused test exists. Do not install dependencies or tools without explicit permission. Published runtime smoke remains acceptance and outranks passing local checks.

Before committing, inspect the final diff internally and verify:

- only intended files changed;
- no unrelated cleanup was introduced;
- the implementation matches the approved correction;
- no secrets, generated junk, or accidental files were added.

Do not show a raw Git diff by default. Show exact hunks only when Jeremy asks, the change is high-risk, implementation differs materially from the approved plan, or a line-level decision requires his input.

In the completion report, say `Validation passed` when relevant checks pass. Mention only meaningful failures, unavailable tooling, or behavior still requiring production smoke; routine command transcripts are unnecessary unless Jeremy asks.

## Risk-based Git workflow

Use the simplest safe workflow. Before editing, inspect the current branch and worktree and preserve unrelated user changes. Never rewrite or amend existing history without explicit approval.

### Routine low-risk work

Examples include isolated UI/presentation fixes, focused component behavior, small test additions, documentation, narrow nonfinancial bugs, and small easily reverted improvements.

When local `main` is clean and synchronized:

1. Work directly on local `main` after approval.
2. Implement and validate.
3. Commit locally.
4. Run `.codex\scripts\push-origin-main.cmd`, which uses the installed Windows Git to execute exactly `C:\Program Files\Git\cmd\git.exe push origin main`.
5. After a successful push, state:

```text
No merge is required. Vercel published the `main` commit; test the reported
behavior in production.
```

Do not create a branch, pull request, merge commit, cleanup task, and repull cycle for every routine correction.

### High-risk work

Use a task-specific branch for:

- database migrations or RPC changes;
- chip movement or financial settlement;
- authentication or authorization;
- canonical state ownership;
- cross-game lifecycle behavior;
- broad shell or architecture changes;
- dependencies or build configuration;
- large refactors;
- changes that are difficult to roll back or could corrupt durable state.

For high-risk work:

1. Create an appropriately named local branch before editing.
2. Implement after approval.
3. Validate and commit locally.
4. Push the branch when required by the integration path. Never force-push.
5. Fetch `origin/main`, verify the branch can fast-forward from it, fast-forward local `main`, and push `main` with the approved helper.
6. Monitor the automatic Vercel deployment and report its production URL and
   state.

## Completion response

After implementation, validation, and the local commit, respond compactly:

**Complete**

- Explain what changed in one or two sentences.
- Give the branch and commit SHA.
- State `Validation passed`, or one concise note about unavailable or unproven validation.
- State the exact production behavior Jeremy still needs to smoke-test.
- Mention any newly reported items added to the queue during the task.

For routine work on local `main`, state that Vercel published the pushed commit
after the deployment reaches `READY`. Do not include Git Bash push
instructions. For high-risk branch work, state the branch, why it was required,
and the resulting integration, push, and deployment status.

Do not request screenshots or command output when the expected result is routine and Jeremy has not reported an error. Do not provide a long retrospective unless requested.

## Publishing and smoke

Codex owns local source changes, tests, validation, diff review, the local
commit, required approved schema migrations, Git integration/push, and Vercel
deployment verification. A push to `origin/main` automatically creates the
production deployment. Jeremy owns the real-user production smoke.

After Vercel reports the pushed commit as `READY`, the routine next instruction
is to test the reported behavior at <https://ptown-poker.vercel.app>.

Treat Jeremy's production smoke as authoritative. If the active fix fails smoke, begin a new read-only investigation from that observation; do not defend the source because tests passed.

If smoke reveals a different issue, capture it in the backlog automatically and continue the current smoke or active task unless Jeremy says to switch.

## Communication

- Lead with the practical conclusion.
- Use plain English and keep routine responses short.
- Define unfamiliar Git or engineering terms only when first needed.
- Apply repository doctrine without repeating it in every response.
- Do not make Jeremy a middleman between Codex and another assistant.
- Give one clear next action.
- Avoid excessive ceremony and oversized reports for small changes.
- Match the Git process to actual risk.
