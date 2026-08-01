# P-Town Poker Codex handoff package

## Install

Extract this package into the root of the final cloned repository so that:

```text
<repo>/AGENTS.md
<repo>/CODEX_KICKOFF_PROMPT.md
<repo>/CUTOVER_CHECKLIST.md
<repo>/docs/codex/INDEX.md
...
```

Do not overwrite a newer repository-owned `AGENTS.md` without reviewing and merging it.

## First use

1. Finish the final Lovable smoke.
2. Pull/reclone exact published source.
3. Tag the stable Lovable baseline.
4. Copy this package into the repo.
5. Commit documentation separately.
6. Start Codex from the repo root.
7. Paste `CODEX_KICKOFF_PROMPT.md`.

## New sessions after bootstrap

Codex should read root `AGENTS.md`. It directs sessions to `docs/codex/INDEX.md`, `CURRENT_RELEASE.md`, task-relevant docs, and `REPO_MAP.md` instead of rereading the whole repository.

Keep documentation current after accepted changes.
