# Dealer setup reset — RCA, September 8, 2026

## Approved correction and validation

Jeremy subsequently approved implementation. `useSessionDealerDrawReceipt`
now owns admission from accepted same-session state for both transports. Live
waiting-to-setup catch-up is eligible; setup is gated during the first render.
The raw Realtime presentation side effect is removed. `Game.tsx` retains the
existing draw-wave renderer, visible acknowledgement, dwell and reset logic.
Cold later mounts, completed receipts and rejected older rows cannot reopen it.

Validation: application typecheck, all 1,485 application tests, all 66 harness
tests, production build and three local browser controls pass. Six new hook
tests include first-mount effects, both arrival orders, exact completion,
late duplicates, cold mounts and session changes. Existing tie-wave tests pass.
One independent read-only review found no blockers.

`e2e/dealerSetupReceipt.spec.ts` uses the actual hook and `DealerGameSetup` with
all non-local HTTP/WebSocket requests intercepted. Both arrival orders and cold
mount preserve the Dice Games tab instance, edited ante and single configuration
submission. Screenshot inspected at `test-results/dealer-setup-admission-static/`.
This is a focused client/form control, not a full `Game` route, server mutation,
or live parallel gameplay proof; source guards cover both real setup mounts.

Local Vite development serving stalled before the fixture module loaded. The
control passed against a static fixture build using
`e2e/fixtures/dealerSetupReceipt.vite.config.ts`; production configuration is
unchanged. Build that fixture to a separate output directory, preview it on
localhost, then run the spec with `PTOWN_E2E_BASE_URL` set to that preview.
The preferred `tsgo` and browser CLI were unavailable; installed `tsc` and
Playwright provided validation without installing anything.

No schema, financial, game-rule, hardware or billing changes. No new production
test session or production data mutation. Real-user setup smoke and renewed
paired qualification remain pending; the original RCA below records the
pre-correction evidence and recommendation.

## Conclusion

Confirmed shared-client presentation-admission race. A live peer caught up
directly from `waiting` to `game_selection` with a complete dealer-draw receipt.
The snapshot path ignored the receipt because the client had not observed
`dealer_selection`. Setup became interactive. A delayed Realtime transition
then adopted the identical receipt using the event's historical `old.status`,
unmounted setup for the draw, and reset mount-local selection when setup returned.

This is a diagnosis, not a correction. No product code, schema, production data,
infrastructure or billing changed during this RCA. No new live test ran.

## Identity and retained evidence

- Build: `d47417cf715f6b33f7a1511bcba01c1fa318a8b0`.
- Synthetic session: `320e2269-3c87-40a0-9a6e-b98b2617ffb5`; peer was dealer.
  No dealer-game or round identity existed; no game type had been configured.
- Evidence directory:
  `C:/Users/jerem/Desktop/poker/safety-check-2026-09-08/repeat-paired/browser/safety-0908-repeat-paired-yahtzee-scorecard/branchSmoke-allGames.branc-88733-ke-matrix-yahtzee-scorecard/`.
- `trace.zip` contains peer `1-trace.network` / `1-trace.trace` and corresponding
  host streams. Observer JSON and before-cleanup screenshots corroborate the UI.
- The test deliberately impaired peer HTTP/WebSocket delivery and briefly
  disconnected it at entry. This exposed ordering; concurrent load is not
  established as the cause. Cleanup was verified before the RCA.

## Confirmed causal chain

1. Peer previously observed `waiting`, revision 1. Its first post-start full
   frame returned `game_selection`, revision 4, with the completed two-card
   dealer draw and live configuration deadline. The captured request ran
   23:58:39.490–23:58:40.255 UTC (766 ms, not isolated database execution time).
2. The layout-effect receipt helper rejected that complete receipt because
   previous status was `waiting`, not `dealer_selection`. Setup appeared at
   23:58:40.587 UTC without a draw hold.
3. Delayed Realtime revisions 2/3 contained `dealer_selection`. The authoritative
   merge correctly rejects those older rows against revision 4; the client
   cannot return to that intermediate phase.
4. Dice Games click `call@1082` succeeded, completing at trace monotonic time
   23,441.335 ms. Its after-snapshot confirms Dice selected in `radix-:r8:`.
5. At 23,459.981 and 23,461.806 ms, delayed Realtime messages delivered revision
   3-to-4 with `old.status=dealer_selection`, `new.status=game_selection` and the
   exact same draw as HTTP. The Realtime handler adopts presentation before
   game-row merge, using historical old status. This starts the previously
   absent hold; the held receipt key dedupes duplicate delivery.
6. At 23:58:41.366 UTC, setup disappeared and two draw cards appeared. Draw
   presentation cleared at 23:58:43.549; setup returned at 23:58:43.649. The new
   tabs instance (`radix-:rb:`) defaulted to Card Games.
7. The harness waited 15 seconds for the now-hidden Yahtzee option. No Yahtzee
   defaults or `configure_dealer_game` request was sent. The secondary response
   waiter also timed out. These are not slow configuration-RPC measurements.

The host observed the revision-3 intermediate full frame before revision 4,
unlike the peer. A successful click followed by a confirmed remount rules out
a missed click or incorrect tab locator as the cause.

## Owners and existing safeguards

- `src/lib/sessionDealerDrawPresentation.ts:125`: receipt admission; line 136
  requires previous status `dealer_selection`.
- `src/pages/Game.tsx:1566`: snapshot/layout-effect admission.
- `src/pages/Game.tsx:4012`: Realtime admission using historical old status,
  before authoritative merge at line 4041.
- `src/pages/Game.tsx:13917` and `:14248`: both shared setup mount paths honor
  the draw hold, but it is created too late. This is before any game-family rules.
- `src/components/DealerGameSetup.tsx:1112` / `:1148`: uncontrolled tab defaults
  to cards for a new session. Remounting discards the local selection.

Authoritative revision/identity guards prevent state regression but do not
govern the earlier presentation side effect. Receipt-key deduplication,
DOM-visible frame acknowledgement, tie waves and game-ID resets must remain.
Persisting the tab alone would conceal premature setup admission.

Narrow blame dates the previous-status guard to August 24 commit `5f4b39aa46`,
before the latest cost optimization. This does not establish when the combined
race first became observable or explain Jeremy's original start-game report.

## Offline proof and test gap

The external diagnostic `C:/Users/jerem/Desktop/poker/safety-check-2026-09-08/rca-setup-receipts.ts`
replayed actual retained records through unchanged production helpers. Passed:
HTTP/Realtime draw objects are deeply identical; `waiting` rejects the receipt;
historical `dealer_selection` accepts it; actual delayed revisions 2/3 cannot
regress revision 4; cold later mounts and completed exact keys remain rejected.

Existing receipt tests cover the normal intermediate transition, duplicates
and cold later mounts, but not live catch-up skipping the intermediate phase
or snapshot-first/Realtime-later ordering. Isolated passes missed this ordering.
This replay proves the defect, not a future correction's end-to-end behavior.

## Recommended correction — awaiting approval

Admit/drain an unseen complete dealer draw for an eligible live same-session
transition, including waiting directly to game selection, before interactive
setup. Make snapshot and Realtime admission use consistent client lifecycle
and accepted identity rules, so historical old status cannot independently
interrupt already-admitted setup.

Preserve cold-mount/reconnect behavior for already-completed later phases,
exact receipt deduplication, tie-wave ordering, visible-frame acknowledgements
and existing dwell, session resets, dealer authorization and the original
configuration deadline. Leave configuration, ante, settlement, balances and
game rules unchanged. No database migration is indicated. Do not add arbitrary
waits, polling, retry-clicks or wider timeouts.

Regression coverage: captured snapshot-first ordering, reversed arrival order,
duplicates/older/completed receipts, cold later mount, session change and tied
draw. Browser acceptance: draw before interactive setup, then stable Dice Games
and parameter selection through configuration. Cover both setup mounts; rerun
blocked qualification only in an authorized no-play window.

Simultaneous gameplay remains unqualified. This RCA neither establishes a
settlement defect nor excludes other lag/freeze risks, and does not prove the
cause of the original reported "could not start game" error.
