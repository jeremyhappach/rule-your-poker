# First Codex session — repository ingestion and handoff

Copy the prompt below into the first Codex session from the final tagged repository root.

---

You are taking ownership of the P-Town Poker repository as the central engineering agent after its Lovable cutover.

Do not modify product code in this session.

## Load persistent instructions

Read:

```text
AGENTS.md
docs/codex/INDEX.md
docs/codex/PROJECT_CONTEXT.md
docs/codex/ARCHITECTURE.md
docs/codex/WORKFLOW.md
docs/codex/CURRENT_RELEASE.md
docs/codex/STABLE_CHECKPOINTS.md
docs/codex/BACKLOG.md
docs/codex/GAME_RULES.md
docs/codex/DECISION_LOG.md
docs/codex/REPO_MAP.md
```

Treat the current repository and deployed migrations as authoritative. The handoff docs preserve history and intent but may contain stale paths or incomplete rule detail.

## Confirm the baseline

Read-only:

1. Report current branch, commit SHA, tags, and worktree status.
2. Confirm the Lovable stable baseline tag exists or identify that it has not yet been created.
3. Inspect package scripts and determine the exact typecheck/build commands.
4. Do not install, upgrade, or change dependencies.

## Build the repository map

Inspect the repository and update only:

```text
docs/codex/REPO_MAP.md
```

Map:

- application entry and routes;
- Supabase client/config;
- session/lobby/game orchestration;
- canonical shell/felt/HUD/seat/announcement components;
- each game’s entry, state adapter, controller, bot logic, settlement owner, terminal path, and presentation slots;
- snapshot readers/writers;
- realtime subscriptions;
- migrations/RPCs;
- debug harness registry;
- focused tests, if any.

Use exact file paths and symbols.

## Complete the game-rule source map

Inspect all seven games:

```text
Holm
Cribbage
Gin Rummy
Yahtzee
3-5-7
Horses
Ship Captain Crew
```

Update only:

```text
docs/codex/GAME_RULES.md
```

For each game, document from source:

- setup/configuration;
- dealer/hand/round lifecycle;
- legal actions;
- turn eligibility/order;
- scoring;
- pot/balance changes;
- win/terminal conditions;
- session continuation/end;
- bot-specific behavior;
- settlement owner and identity;
- exact source paths/symbols.

Do not reconcile contradictions silently. List any disagreement between client rules, database functions, and documentation.

## Verify current release notes

Compare `docs/codex/CURRENT_RELEASE.md` against final source and migrations.

Update documentation only when code proves the statement. Do not mark runtime behavior accepted unless the document already records a passed production smoke.

## Return a readiness report

Return:

1. branch/SHA/tag/worktree;
2. architecture map summary;
3. exact game-rule owners;
4. documentation changes;
5. contradictions or stale assumptions;
6. highest-risk ownership seams;
7. recommended first Codex task from the existing backlog;
8. commands run and results.

Do not change product code, schema, migrations, dependencies, or configuration.

Run only safe read-only commands plus:

```bash
bunx tsgo --noEmit
```

when dependencies are already present. If dependencies are unavailable, report that rather than installing without approval.

Stop after the readiness report.
