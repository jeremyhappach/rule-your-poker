# AGENTS.md — P-Town Poker engineering instructions

## Mission

Maintain and extend the P-Town Poker multiplayer platform without regressing canonical state ownership, synchronization, presentation continuity, or game rules.

This repository is the central engineering workspace after the Lovable cutover. Treat the checked-out source, deployed Supabase schema/RPCs, and published runtime evidence as authoritative. Historical chat summaries are context, not runtime truth.

## Required context

Before any task:

1. Read `docs/codex/INDEX.md`.
2. Read `docs/codex/CURRENT_RELEASE.md`.
3. Read only the additional documents relevant to the task.
4. Inspect the actual source, tests, migrations, and Git history needed to establish the relevant owner and failure boundary.
5. Do not reread the entire repository unless the task genuinely requires a broad audit.

For a new session, use `CODEX_KICKOFF_PROMPT.md` only when repository context has not yet been indexed or the index is stale.

## Core working contract

The normal workflow is:

1. Jeremy reports a bug or improvement in plain English.
2. Codex investigates read-only.
3. Codex reports the root cause and recommended fix in plain English.
4. Jeremy may challenge the diagnosis or reply `approve`.
5. `approve` authorizes the full local workflow within the approved scope: implementation, required local file changes, focused tests when useful, validation, correction of change-caused validation failures, final diff review, staging, and one clear local commit.
6. Codex stops before pushing and gives Jeremy the shortest exact Git Bash instructions needed to push and, when applicable, merge into `main`.
7. Jeremy publishes through Lovable and performs production smoke testing.

One `approve` is enough. Do not add approval gates between implementation, validation, staging, and the local commit. If implementation proves the recommended solution materially wrong or reveals substantially broader work, stop and explain the new finding instead of expanding scope silently.

Never push, merge, deploy, publish, apply migrations, or modify production data unless Jeremy explicitly instructs Codex to do so.

Jeremy normally needs to provide only what he observed, where he observed it, what he expected, and any reproduction details he happens to know. Do not require an engineering specification, source paths, hypotheses, formal acceptance criteria, or prompts relayed from another assistant. Ask a clarifying question only when missing information would materially affect the diagnosis or make the work unsafe.

See `docs/codex/WORKFLOW.md` for investigation, approval, validation, queue, Git, and completion procedures.

## Operating model

- For every active runtime bug, start read-only and trace the exact owner and failure boundary before proposing a patch.
- For large or cross-cutting work, investigate and produce a plan before editing.
- Keep work scoped to one coherent defect or migration.
- Runtime smoke by Jeremy is acceptance truth.
- Source inspection, database evidence, Git history, instrumentation, tests, and production repros outrank plausible theories.
- Do not claim a behavior is fixed merely because local validation passes.
- Preserve frozen production repros until the exact failure is identified.
- Never mutate historical sessions during investigation unless explicitly authorized.
- Do not edit product code before Jeremy approves the recommended correction.

## Queue and durable memory

`docs/codex/BACKLOG.md` is the durable work queue.

If Jeremy reports another bug, smoke observation, improvement, or follow-up while a different issue is active, do not interrupt the active task unless he explicitly asks to switch. Briefly acknowledge the item, search the backlog for duplicates, and automatically add or update a `Queued` entry with the useful observation, expectation, runtime context, reproduction evidence, provenance, and report date. Assign priority only when reasonably clear.

Backlog capture is pre-authorized documentation work. It does not permit investigation or product-code changes for the queued item, must not expand the active code scope, and should be kept in a separate local documentation commit when practical. Never lose a queued observation because the task, chat, or smoke session changes.

When Jeremy asks what is next, read the backlog and current release state, ignore completed/superseded/duplicate/blocked entries, select the highest-priority actionable item, explain the choice briefly, and begin its normal read-only investigation. Ask Jeremy to choose only when genuinely equal options would materially affect product direction.

## Source-of-truth hierarchy

1. Authoritative PostgreSQL/Supabase state and deployed RPC behavior.
2. Current repository source and migrations.
3. Published runtime behavior and screenshots.
4. Existing project documentation.
5. Historical summaries and assumptions.

When these disagree, stop and report the discrepancy.

## Architecture invariants

### State pipeline

`Authoritative database → permitted optimistic action → presentation-only rendering`

- The database owns gameplay truth, settlement, balances, snapshots, terminal disposition, and persistent lifecycle state.
- Optimistic state may improve responsiveness but may not become hidden authoritative truth.
- Presentation state may animate, latch, or preserve continuity but may not advance gameplay or become financial authority.
- Reject regressive snapshots.
- Accept equal-progress snapshots only when semantically identical.
- Hard-reset hand/round transients when `dealer_game_id`, `hand_number`, or `round_id` changes.
- Never allow stale state to cross dealer-game, hand, or round identity boundaries.

### Canonical shell

The platform doctrine is:

`ONE TABLE · ONE FELT · ONE SEAT RING · ONE SPOTLIGHT · ONE PHASE MACHINE`

The shell owns route/lifecycle continuity, table/felt geometry, seat anchors, participant identity, HUD/tab rail, announcements, shared timers/interstitials, transport destinations, shared celebration, terminal hold, Session Ended admission, observer chrome, and shared overlays.

Games own rules, legal actions, game-specific artifacts inside canonical slots, and authoritative outcomes emitted to shared lifecycle owners.

Do not add a second table, felt, seat ring, HUD, lifecycle surface, terminal owner, announcement owner, or transport owner.

### Geometry

- Use canonical felt-relative/container-relative geometry.
- Do not use viewport-specific magic pixels, `vh`/`dvh`, device-specific media-query patches, or window measurements unless the existing canonical geometry system explicitly requires them.
- Interactive felt controls belong in `[data-canonical-felt-interaction-layer]`.
- Preserve the active player at bottom/center and the established seat projection model.

### Terminal flow

- Server/database settlement must be replay-safe and disconnect-safe.
- Connected clients retain the table/HUD through terminal presentation.
- After presentation, connected live-flow clients enter the transient local Session Ended table phase.
- Fresh mount/reconnect of an already-ended session goes directly to the lobby.
- Session Ended is a table phase, not a modal.
- Results remain on the felt; standard HUD/tab rail remains functional.
- Back to Lobby is local-only.
- No gameplay artifacts may survive into Session Ended.

## Change protocol

Before proposing a correction, establish:

1. Exact authoritative identity.
2. Exact owner of the behavior.
3. Exact failure boundary.
4. Existing guards, dedupe keys, and lifecycle resets.
5. Minimal correction.
6. Explicit preserve list.
7. Runtime acceptance steps.

Do not patch from correlation alone. For shared/canonical components, enumerate all applicable game call sites before changing behavior.

For database work:

- inspect deployed definitions;
- use transaction-safe, idempotent mutations;
- prove conflict targets against actual indexes/constraints;
- do not trust typecheck to validate SQL/PostgREST behavior;
- use rollback-safe database proofs when needed;
- never fabricate historical state.

## Prohibited patterns

Do not introduce:

- arbitrary timers to repair missed state transitions;
- polling as a substitute for correct realtime/state ownership;
- duplicate action or settlement owners;
- client-side authoritative counters;
- alias/display-name identity;
- local-only placeholder participants;
- hidden progression surfaces;
- broad speculative refactors during a scoped fix;
- console-only proof as acceptance;
- permanent production debug badges or instrumentation;
- hardcoded game-specific patches when a canonical owner exists;
- success toasts for ordinary visible table actions unless explicitly requested.

Bot/player/action identity must use UUIDs and authoritative keys, never display aliases.

## Validation and review

Codex owns relevant local validation after approval. Use focused tests and checks proportionate to risk; the default narrow typecheck is:

```bash
bunx tsgo --noEmit
```

Do not install dependencies or tools without explicit permission. When database behavior changes, add the smallest direct SQL/PostgREST proof required and roll back or delete synthetic data.

Before committing, inspect the diff internally for scope, correctness, unrelated cleanup, secrets, generated junk, and accidental files. Do not show a raw diff by default. Show hunks only when Jeremy asks, risk warrants it, implementation materially differs from the approved plan, or a line-level decision needs his input.

## Git and release discipline

- Inspect `git status` and the current branch before editing; preserve unrelated user changes.
- Do not rewrite or amend existing history without explicit approval.
- Keep commits small and named for one coherent behavior.
- Do not mix documentation/audit cleanup with release-blocking fixes.
- Use direct local `main` for routine low-risk work when it is clean and synchronized.
- Use a task-specific branch for migrations/RPCs, financial settlement or chip movement, auth, canonical state ownership, cross-game lifecycle, broad architecture, dependencies/build configuration, large refactors, or changes difficult to roll back.
- Stop after the local commit unless Jeremy explicitly authorizes pushing or further release actions.
- Before a release checkpoint, record the commit SHA and tag it.
- The Lovable cutover tag is documented in `CUTOVER_CHECKLIST.md`.

## Documentation maintenance

After a material architectural decision or verified fix:

- update `docs/codex/CURRENT_RELEASE.md`;
- update `docs/codex/STABLE_CHECKPOINTS.md` when a smoke passes;
- update `docs/codex/BACKLOG.md` for deferred or newly queued work;
- update `docs/codex/DECISION_LOG.md` for durable architectural decisions;
- update `docs/codex/REPO_MAP.md` when ownership or key paths change.

Keep `AGENTS.md` stable and concise. Put detailed operating procedures and project knowledge in `docs/codex/`.

## Communication style

Lead with the practical conclusion, use plain English, keep routine responses short, and give one clear next action. Do not make Jeremy act as a middleman between Codex and another assistant. Do not turn a simple correction into an enterprise release process unless its actual risk warrants it.
