# Codex task template

## Title

One behavior, defect, or migration.

## Context

- Game/session:
- Dealer game:
- Hand/round:
- Published build/commit:
- User-visible symptom:
- Last stable checkpoint:

## Authoritative evidence

- Current database state:
- Last successful mutation:
- First missing/incorrect mutation:
- Event/action tape:
- Screenshot/log references:

## Scope

Investigate and fix only:

```text
...
```

## Required investigation

1. Exact source owner.
2. Exact database owner.
3. Exact presentation owner.
4. Identity/dedupe/reset gates.
5. Root-cause proof.

## Required contract

```text
authoritative event
→ expected state transition
→ expected presentation
```

## Preserve

```text
...
```

## Prohibited approaches

```text
timers
polling
duplicate owner
alias identity
speculative refactor
...
```

## Validation

```bash
bunx tsgo --noEmit
```

Add focused SQL/runtime proof only when required.

## Return

1. Exact cause.
2. Exact correction.
3. Idempotency/ownership proof.
4. Files/migrations changed.
5. Validation.
6. Runtime smoke.
7. Remaining uncertainty.
