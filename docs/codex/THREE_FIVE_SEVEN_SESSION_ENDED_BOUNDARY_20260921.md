# 3-5-7 connected-host Session Ended diagnosis

Classification: actual 3-5-7 presentation defect. The browser is checking the
correct panel, and authoritative settlement/session lifecycle is healthy in the
focused reproduction. No product or authority change has been made.

Source examined and reproduced: `d1bd879085c82458df0a8403e416b76998540a2f`.
Only the existing 3-5-7 terminal browser case ran. Temporary local Playwright
response instrumentation copied named render inputs into a bounded browser trace;
it did not change conditions, callbacks, actions, timing, or checked-in product
source. The host was refreshed while still in the waiting room, before gameplay.
The original 120-second Session Ended assertion remained intact and failed again.

## Observed authority and rendering

Exact session `2077fd5a-5aaa-45f1-8b72-e2c7d43d2615`, dealer game
`82298c3d-1470-465c-a53c-d2dfc0622287`, round
`98fe488e-b1b2-4971-8745-5faf3554b17b`, hand 1.

The terminal settlement committed at `2026-09-21T21:49:50.636263Z`.
The read-only capture at `21:50:34.982Z` shows:

- `games.status=session_ended`, `pending_session_end=false`, terminal timestamp
  present, round `completed`, and transfer cursor 4.
- Exactly one `three_five_seven_terminal` result with the correct winner.
- Player balances +3/-3 and two matching terminal snapshots; pot zero.
- Immutable transfer batches: ante cursor 1, leg charge cursor 2, sweep-credit
  cursor 3, final pot transfer cursor 4. The sweep has the expected zero flights
  and +2 reserve return. Actual browser responses include all four batches.
- Host remains on the exact game route; the panel is absent and stale cards and
  pre-payout chip presentation remain visible. The fresh peer reaches the lobby.
- Host route: `sessionEndedTableAdmitted=false`, `liveTerminalPresentationPending=true`,
  `terminalPresentationActive=false`, no completion tokens. Farkle/Yahtzee holds
  are both false; the terminal identity matches the authoritative round.
- Host table: phase `sweep-credit`, `overlayComplete=true`, `creditSettled=false`,
  no transfer cursor/credit source released to its pending gate. No completion
  callback reached the route.

## Concrete source boundary

`buildThreeFiveSevenSnapshot` in `src/pages/Game.tsx:932` rejects every status
other than `in_progress` or `game_over` at line 939. An atomic Last Hand result
goes directly to `session_ended`, so the builder returns null before constructing
the completed round/cursor snapshot. The sync feed at line 9866 publishes only
a non-null snapshot, retaining the earlier presentation frame.

This leaves the 3-5-7 financial admission path without a completed, revealed
terminal frame for its leg charge (`financialPresentation.ts:61`). The canonical
chip ledger correctly prevents a later batch overtaking a queued predecessor on
the same player endpoint. The table therefore waits at sweep-credit and cannot
publish the terminal completion token required by the shared Session Ended owner.
The queue dependency is a source-level causal trace; the stalled sweep gate and
missing completion token are directly captured browser state.

As a focused deterministic check, the unmodified builder was extracted and
executed against the captured terminal frame: it returns null. The builder is
byte-for-byte identical to qualified Wave 1 `e80200300ee81597f8ac11447a2aa15069107644`.
`MobileGameTable`, the financial/sweep helpers, completion hook, and chip ledger
also have no diff from that commit. The rejecting condition predates Farkle;
this diagnosis does not demonstrate a newly introduced shared lifecycle or
settlement regression.

## Smallest proposed correction — not implemented

Allow the exact current 3-5-7 terminal `session_ended` round through
`buildThreeFiveSevenSnapshot`, using the existing accepted dealer-game/round/hand
identity and monotonic sync path. This supplies completed round status and the
terminal transfer cursor to the existing presentation gates.

Preserve the leg-reveal requirement, cursor ordering, sweep-plus-overlay gate,
completion receipt identity, fresh-ended-mount lobby redirect, and all settlement
and database authority. Do not force Session Ended admission, bypass chip credit,
add a timeout escape, or change the shared panel. No migration is proposed.

After explicit approval, add focused coverage for atomic `in_progress` to
`session_ended`, stale/wrong terminal identities, and the existing ordinary
`game_over` path; rerun this browser case and the full seven-game campaign because
product code would change. Run the complete deterministic suite once at the final
candidate SHA. The five previously unrun terminal cases were not resumed here.

## Execution and cleanup

The first diagnostic startup timed out at login; its focused retry reached the
reproduced terminal failure. An optional second capture of detailed queue inputs
failed during startup and its one retry during a waiting-room reload; neither
reached terminal play or contributed acceptance evidence. No startup debugging or
broader framework work was undertaken. Raw traces remain local because they
contain authentication traffic.

The completed game was cleaned by the canonical fixture cleanup. The additional
waiting-room fixture was verified as fake-money, owned by the exact local test
accounts, and removed by exact identity. Two completed local scheduler telemetry
rows were removed by exact IDs/timestamps. Final cleanup confirms zero synthetic
users/profiles/game fixtures, only expected control/default rows, and all 384 local
function fingerprints/owners/security settings/grants unchanged. Local frontend
and scheduler are stopped.

Production was queried read-only: creation false, admin-only true, production
defaults approval false, zero Farkle defaults. No full application/harness suites,
full campaign, migrations, main integration, or product changes occurred.

Sanitized evidence is in
`supabase/farkle/wave2-qualification/20260921-357-terminal-boundary/`.
Wave 2 remains unqualified and unmerged, pending the product correction decision.
