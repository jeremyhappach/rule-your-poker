# Lovable → Codex cutover checklist

## Gate A — final runtime smoke

- [ ] Published iOS Session Ended long-list scroll works.
- [ ] Results title remains pinned.
- [ ] Hap + 10 bots are all reachable.
- [ ] Short results remain compact.
- [ ] Bot-heavy Holm hand completes without a parked turn.
- [ ] Add Bot immediately shows yellow waiting seat.
- [ ] Monotonic aliases continue after removals.
- [ ] Four-color active hand is legible.
- [ ] Standard deck remains correct.
- [ ] Current/departed participants appear once with correct balances.
- [ ] No Holm cards/transport/pot/spotlights bleed into Session Ended.
- [ ] HUD, chat, history, and Back to Lobby work.
- [ ] `bunx tsgo --noEmit` is clean.
- [ ] Required Supabase migrations are deployed.

## Gate B — freeze the Lovable baseline

From the final published source:

```bash
git status
git rev-parse HEAD
git log -1 --oneline
```

Ensure the worktree is clean.

Recommended tag:

```bash
git tag -a lovable-final-stable-2026-08-01 -m "Final stable Lovable baseline before Codex cutover"
git push origin lovable-final-stable-2026-08-01
```

Record:

```text
Commit SHA:
Tag:
Published URL:
Supabase project ref:
Migration status:
Smoke date/device:
```

## Gate C — install durable context

Place at repository root:

```text
AGENTS.md
CODEX_KICKOFF_PROMPT.md
CUTOVER_CHECKLIST.md
docs/codex/
```

Commit separately:

```bash
git add AGENTS.md CODEX_KICKOFF_PROMPT.md CUTOVER_CHECKLIST.md docs/codex
git commit -m "docs: add Codex project context and handoff"
```

## Gate D — first Codex session

Run Codex from repository root in planning/Ask mode and paste `CODEX_KICKOFF_PROMPT.md`.

The first session is read-only except for handoff documentation.

## Gate E — start engineering work

- Create a clean branch from the stable tag.
- Choose one backlog item.
- Use `docs/codex/TASK_TEMPLATE.md`.
- Investigate/plan before editing.
- Do not run a broad refactor as the first Codex change.
