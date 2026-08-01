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
4. After `approve`, implement, test, validate, review the final diff internally, and create a local commit.
5. Stop before pushing and give exact Git Bash push/merge instructions.
6. Jeremy publishes through Lovable and performs production smoke.

Never push, merge, deploy, publish, apply migrations, or modify production data without Jeremy's explicit instruction.

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
8. Stop before pushing.

Do not ask for separate approval for editing, tests, typechecking, linting, building, showing the diff, staging, or the local commit.

If implementation shows that the recommended solution was materially wrong or that substantially broader work is required, stop and report the new evidence instead of silently expanding scope.

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
4. Tell Jeremy to run:

```bash
git push origin main
```

Then state:

```text
No merge is required. Publish through Lovable, then test the reported behavior in production.
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
4. Give Jeremy the exact command with the actual branch name:

```bash
git push -u origin <actual-branch-name>
```

5. Give compact GitHub instructions:

```text
Open the pull-request link printed by Git Bash.
Confirm base: main and compare: <actual-branch-name>.
Create and merge the pull request.
```

6. Give the post-merge synchronization command:

```bash
git switch main && git pull --ff-only origin main
```

Explain in one sentence why the task required the high-risk branch workflow. Fill every placeholder with the real branch name in the actual completion response.

## Completion response

After implementation, validation, and the local commit, respond compactly:

**Complete**

- Explain what changed in one or two sentences.
- Give the branch and commit SHA.
- State `Validation passed`, or one concise note about unavailable or unproven validation.
- State the exact production behavior Jeremy still needs to smoke-test.
- Mention any newly reported items added to the queue during the task.

**Git Bash**

Give one copy/paste command block containing the fewest exact next commands. Assume Git Bash on Windows: do not include `$` prompts or unfilled placeholders. Mention right-click or `Shift+Insert` paste only when it would be newly useful, not routinely.

**Merge**

State either that no merge is required because the commit is already on local `main`, or give the short exact pull-request and merge steps for the actual branch.

Do not request screenshots or command output when the expected result is routine and Jeremy has not reported an error. Do not provide a long retrospective unless requested.

## Publishing and smoke

Codex owns local source changes, tests, validation, diff review, and the local commit. Jeremy owns pushing through Git Bash, merging when required, Lovable Publish/Update, and production smoke.

After a successful push or merge, the routine next instruction is:

```text
Publish through Lovable, then test the reported behavior in production.
```

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
