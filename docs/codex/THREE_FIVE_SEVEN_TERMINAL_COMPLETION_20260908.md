# 3-5-7 terminal completion — September 8, 2026

Status: Approved correction implemented and locally verified. Jeremy's
production acceptance is still required. Release checkpoint tag:
`357-terminal-completion-20260908`.

## Incident and root cause

Real-money session `6c6306db-4d5c-4ae1-b1bf-ece4106a0548` ("Sep 8 - Tommy La
Stella"), dealer game `bb2d7fea-44c0-4dc8-b6b6-d3eeb47f29f6`, H4/R1 round
`86ea9739-d89f-429e-b7d7-d1e9db5fd04a`. Both players started with two legs.
Hap's trace identifies build `ee56412c893c5eaf5a09adaefa8b83ffe0c2f9c7`.

The journal records Hap Stay at 01:16:05.138378Z and mcru81 Fold at
01:16:06.415410Z on September 9 UTC. The recorded deadline was 01:16:32.556Z.
This establishes a recorded Fold before the normal deadline, not a physical
click. Manual versus client auto-fold remains unproven.

Settlement was correct and unique: Hap's $2 final-leg charge was followed by
$10 collected legs and the $22 pot. Result
`91845e02-0878-47ef-b2b7-a296fc35727d` records the $32 award. The immutable
balance sequence is -$33 -> -$35 -> -$25 -> -$3; pot closes at $0.
Do not repair or replay this historical settlement.

Terminal resolution committed 01:16:06.424152Z. Its server-time reveal ends
01:16:11.724151Z, and recovery is due 01:16:36.424151Z. Both clients called
the postgame owner almost immediately; setup committed 01:16:06.880552Z,
only 456 ms after resolution. mcru81's request won the durable claim and
Hap's request deduped. This was not server recovery.

`Game.tsx` correctly defers terminal animation admission through decision
reveal, but its old post-animation progress poll treated an inactive animation
as completed. Its immediate check entered `handleGameOverComplete`, whose
guard made the same mistake. Setup cleared the unstarted presentation.
The reveal gate introduced in `aff31d0a7` exposed this incompatible older owner.
The nine existing focused tests passed despite the incident; their source
fragment checks did not exercise the combined event ordering.

## Approved correction and ownership

- Remove the legacy 3-5-7 browser progression poll and forced fallback timers.
  PostgreSQL's existing recovery deadline remains unchanged.
- `useThreeFiveSevenTerminalCompletion` is presentation permission, not game
  authority. It admits only a completed, exact game/dealer-game/round/hand/
  terminal-generation receipt against the latest committed terminal frame.
  Reveal-in-progress, no receipt, duplicate completion, stale identity,
  setup, another game type and unmounted callbacks cannot authorize handoff.
- `MobileGameTable` captures its canonical pot-entry identity at pot arrival
  and carries it through the existing 300 ms presentation tail. The legacy
  sweep release waits for the matching immutable descriptor before consuming
  its awaiter, so that path also carries a complete receipt.
- `Game.tsx` accepts the receipt before clearing presentation state; its
  generic postgame owner requires the same receipt. It never fetches a newer
  game's identity and attaches an old completion to it. The existing RPC
  validates and deduplicates the unchanged exact settlement identity.
- Preserve terminal choreography, reveal secrecy, Session Ended admission,
  cold reconnect, current-round-null terminal frames, canonical geometry,
  dealer rotation and all financial ownership. No migration, production-data
  repair, game-rule, billing or hardware change.

## Verification and acceptance

- Final typecheck, 1,499 application tests (226 files), 66 harness tests,
  185 focused 3-5-7 checks and production build pass. Build warnings concern
  existing large bundles and mixed static/dynamic imports, not build failure.
- Mounted-hook regressions replay the incident permission ordering and two
  client completion, plus stale/duplicate/early/unmounted completion, legacy
  sweep identity, instant sweep and session-ended/null-round conditions.
- Read-only production check: one terminal settlement, $32 award, one
  postgame receipt; server recovery still checks its authoritative deadline.
- Independent read-only review identified the legacy sweep's incomplete
  identity; corrected with a matching-descriptor gate and regression coverage.
- These local tests do not constitute a live two-browser terminal smoke.
  Jeremy's acceptance: both players have two legs, Stay/Fold completes DROP
  and hold, final leg, Sweep the Legs, pot-to-player, then next-game setup,
  each exactly once. Also verify an instant sweep still completes normally.
- Separate P1 early signed chip-helper text remains queued, not fixed here.
