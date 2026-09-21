# Farkle peer animation proof — root cause established

Product source: `bb7ba16b52972043b1ed5a487b336bf1fb21b8a7`.
Classification: **proof/harness defect**. No product presentation change.

The failed proof first waited for `row`, then inspected its phase log. `row` is
also the peer's pre-roll state. A separate database reader confirming an action
does not establish that the peer has received or rendered that action.

For authoritative round `f0a83ea6-4ada-4f04-a227-e1cf93ad1ff1`, roll sequence 1:

| Observation | UTC time | Peer receipt |
| --- | --- | --- |
| Database roll confirmed | 18:32:42.280 | Still 0 |
| Old assertion sampled only `row` | 18:32:42.299 | Still 0 |
| Rendered `cluster` | 18:32:42.838 | 1 |
| Rendered `rumble` | 18:32:43.004 | 1 |
| Rendered `reveal` | 18:32:43.437 | 1 |
| Rendered `row` | 18:32:43.688 | 1 |

Instrumentation was installed before page mount. It recorded synchronous DOM
attribute writes, MutationObserver delivery, animation-frame samples, node identity
and the existing component's receipt/animation props. Every phase occurred on the
same connected node, both in DOM writes and rendered-frame samples. The observer
was not late; the assertion terminated measurement before the target roll arrived.
This reproduction establishes no skipped/collapsed product phase.

## Proof-only correction

The observer is armed before the action. The proof now waits for the exact ordered
`cluster → rumble → reveal → row` sequence, then checks the deterministic row
against the authoritative roll. It no longer treats the pre-roll row as completion.
Missing phases, reordered phases or a missing terminal row still fail. Timestamps,
round identity and action sequence remain in evidence. No arbitrary delay is used
to make the corrected qualification pass.

The focused proof passed in 23.5 seconds. Its durable entry point is
`e2e/farkle/peerRoll.local.spec.ts` using `playwright.farkle-local.config.ts`.
The original failed proof remains preserved, and the resumed matrix uses the same
ordered-sequence check. Farkle, Horses and SCC product source, Wave 1 authority,
migrations, production settings and scoring defaults are untouched.

## Resumed qualification stopped at a different assertion

After the focused pass, the remaining matrix resumed and passed its remote phase
check. It then stopped at `runtime-farkle.local/wave2-remaining.spec.ts:86`: after
Roll N it expected held die `{index: 0, value: 5}` in the next `state.dice`, but the
lookup returned `undefined`. That separate assertion has not been diagnosed or
changed. No retry or further campaign ran; no new product defect is established.

The seven-game browser campaign was not started. Wave 2 remains unqualified and
unmerged. Local fixtures, users/profiles, transfer records and telemetry are clean;
the client and scheduler are stopped. All 384 local function definitions/metadata
match the recorded applied state. There were no production mutations.

Evidence: `supabase/farkle/wave2-qualification/20260921-peer-animation/` includes
timestamped diagnosis, the passing focused proof, exact harness sources, and the
subsequent failure. Raw credential-bearing browser traces remain ignored locally.
