# AGENTS.md — P-Town Poker engineering instructions

## Mission

Maintain and extend the P-Town Poker multiplayer platform without regressing canonical state ownership, synchronization, presentation continuity, or game rules.

This repository is the central engineering workspace after the Lovable cutover. Treat the checked-out source, deployed Supabase schema/RPCs, and published runtime evidence as authoritative. Historical chat summaries are context, not runtime truth.

## Required context

Before any task:

1. Read `docs/codex/INDEX.md`.
2. Read `docs/codex/CURRENT_RELEASE.md`.
3. Read only the additional documents relevant to the task.
4. Inspect the actual source and migrations before proposing changes.
5. Do not reread the entire repository unless the task genuinely requires a broad audit.

For a new session, use `CODEX_KICKOFF_PROMPT.md` only when repository context has not yet been indexed or the index is stale.

## Operating model

- For large or cross-cutting work, investigate and produce a plan before editing.
- For narrow defects, trace the exact owner and failure boundary before patching.
- Keep tasks scoped to one coherent defect or migration.
- Runtime smoke by Jeremy is acceptance truth.
- Source inspection, database evidence, and production repros outrank plausible theories.
- Do not claim a behavior is fixed merely because typecheck passes.
- Preserve frozen production repros until the exact failure is identified.
- Never mutate historical sessions during investigation unless explicitly authorized.

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
- Presentation state may animate, latch, or preserve continuity but may not advance gameplay.
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

Before editing, establish:

1. Exact authoritative identity.
2. Exact owner of the behavior.
3. Exact failure boundary.
4. Existing guards, dedupe keys, and lifecycle resets.
5. Minimal correction.
6. Explicit preserve list.
7. Runtime acceptance steps.

Do not patch from correlation alone.

For shared/canonical components, enumerate all applicable game call sites before changing behavior.

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
- broad speculative refactors during a release fix;
- console-only proof as acceptance;
- permanent production debug badges or instrumentation;
- hardcoded game-specific patches when a canonical owner exists;
- success toasts for ordinary visible table actions unless explicitly requested.

Bot/player/action identity must use UUIDs and authoritative keys, never display aliases.

## Validation

Default validation for narrow work:

```bash
bunx tsgo --noEmit
```

Do not run broad suites, create harnesses, or add tests unless the task specifically warrants them or Jeremy asks.

When database behavior changes, add the smallest direct SQL/PostgREST proof required and roll back/delete synthetic data.

Always state files changed, migrations changed, commands run, unresolved uncertainty, and exact runtime smoke required.

## Git and release discipline

- Start from a clean worktree.
- Inspect `git status` and the current branch before editing.
- Do not rewrite or amend existing history without explicit approval.
- Keep commits small and named for the single behavior changed.
- Do not mix documentation/audit cleanup with release-blocking fixes.
- Before a release checkpoint, record the commit SHA and tag it.
- The Lovable cutover tag is documented in `CUTOVER_CHECKLIST.md`.

## Documentation maintenance

After a material architectural decision or verified fix:

- update `docs/codex/CURRENT_RELEASE.md`;
- update `docs/codex/STABLE_CHECKPOINTS.md` when a smoke passes;
- update `docs/codex/BACKLOG.md` for deferred work;
- update `docs/codex/DECISION_LOG.md` for durable architectural decisions;
- update `docs/codex/REPO_MAP.md` when ownership or key paths change.

Keep `AGENTS.md` stable and concise. Put detailed knowledge in `docs/codex/`.

## Communication style

Be direct and evidence-based. For implementation work, return:

1. finding;
2. exact cause;
3. exact correction;
4. preserved behavior;
5. validation;
6. runtime smoke.

Do not overstate certainty. Do not report “ready for smoke” until required source, typecheck, and database proofs are complete.
