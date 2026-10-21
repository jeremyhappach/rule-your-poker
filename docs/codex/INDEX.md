# Codex context index

This directory is the durable project memory for P-Town Poker. New sessions should read this index, `CURRENT_RELEASE.md`, and only the files relevant to the task.

| File | Read when |
|---|---|
| `PROJECT_CONTEXT.md` | First session, product overview, stack, operating constraints |
| `ARCHITECTURE.md` | State ownership, canonical shell, lifecycle, sync, geometry, terminal flow |
| `GAME_RULES.md` | Any change touching legal actions, scoring, settlement, dealer/hand flow, bots |
| `CARD_FACE_CONTRACT.md` | Card rendering, private/masked projections, deal/reveal admission, and face caches in Holm, Gin, Cribbage or 3-5-7 |
| `CANASTA_CONTRACT.md` | Approved Classic two-player rules, fixed stake, timeout policy and legality correction |
| `CANASTA_RECONCILIATION.md` | Current-main catalog/lifecycle reconciliation, combined local evidence and remaining hosted gates |
| `CANASTA_AUTHORITY_CHECKPOINT.md` | Local reducer/server/SQL checkpoint, qualification evidence and unfinished integration |
| `CANASTA_MAXIMUM_HAND.md` | 71-card legal witness, count upper bound and proof boundaries |
| `CANASTA_MOBILE_CHECKPOINT.md` | Isolated mobile checkpoint, shared-owner inventory, evidence and remaining review gates |
| `FULL_SEAM_GAUNTLET_PLAN.md` | Planning or executing the exhaustive human-to-human rule, chaos, timeout/rejoin, and dealer-game transition campaign |
| `WORKFLOW.md` | Every new game: mandatory atomic financial release gate; debugging, database investigation, validation, smoke, task format |
| `CURRENT_RELEASE.md` | Every session; current release candidate and active gate |
| `RACE_POKER_RULES.md` | Approved multiplayer-only rules and bot information contract |
| `RACE_POKER_QUALIFICATION.md` | Local authority/financial/browser evidence and coordinated release hold |
| `RACE_POKER_RELEASE_PLAN.md` | Exact coordinated integration, migration, qualification, publication and activation sequence |
| `TRIP_FLIP_RULES.md` | Frozen Trip Flip rules, timing boundaries and approved P-Town adaptations |
| `TRIP_FLIP_QUALIFICATION.md` | Trip Flip authority, financial/concurrency proofs, browser/audio/layout evidence and owner smoke |
| `RUN21_PRODUCTION_QUALIFICATION.md` | Run21 financial authority, recovery, inactivity policy, release evidence and owner smoke |
| `RUN21_FAIRNESS_CORRECTION.md` | Run21 shared-deck containment, independent player decks, historical compatibility and qualification |
| `PERFORMANCE_COST_REDUCTION_PLAN.md` | September 8 cost-reduction work, benchmark gates, idle recovery optimization, and lower-tier eligibility |
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
