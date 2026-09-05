# Codex context index

This directory is the durable project memory for P-Town Poker. New sessions should read this index, `CURRENT_RELEASE.md`, and only the files relevant to the task.

| File | Read when |
|---|---|
| `PROJECT_CONTEXT.md` | First session, product overview, stack, operating constraints |
| `ARCHITECTURE.md` | State ownership, canonical shell, lifecycle, sync, geometry, terminal flow |
| `GAME_RULES.md` | Any change touching legal actions, scoring, settlement, dealer/hand flow, bots |
| `CARD_FACE_CONTRACT.md` | Card rendering, private/masked projections, deal/reveal admission, and face caches in Holm, Gin, Cribbage or 3-5-7 |
| `FULL_SEAM_GAUNTLET_PLAN.md` | Planning or executing the exhaustive human-to-human rule, chaos, timeout/rejoin, and dealer-game transition campaign |
| `WORKFLOW.md` | Debugging, database investigation, validation, smoke, task format |
| `CURRENT_RELEASE.md` | Every session; current release candidate and active gate |
| `STABLE_CHECKPOINTS.md` | Before touching previously stable behavior |
| `BACKLOG.md` | Planning post-release work or choosing the next task |
| `DECISION_LOG.md` | Understanding durable architectural choices |
| `REPO_MAP.md` | Locating owners, migrations, RPCs, components, hooks |
| `TASK_TEMPLATE.md` | Writing a scoped Codex task or GitHub issue |

## Context-loading rule

Do not reread the full repository by default.

1. Read this file and `CURRENT_RELEASE.md`.
2. Read task-relevant docs.
3. Use `REPO_MAP.md` to inspect exact owners.
4. Search source for symbols named in the task.
5. Expand only when evidence shows the issue is cross-cutting.

The current source, deployed schema/RPCs, and runtime evidence remain authoritative. When docs and code disagree, report the mismatch and update documentation only after resolving it.
