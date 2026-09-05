# Repository map

## Session lifecycle commands (WP9c)

- `20260905015956_session_lifecycle_command_boundary.sql` owns shared end requests,
  maintenance mode and browser session write restrictions. Existing fake-money
  blast remains the admin deletion owner.
- `src/lib/sessionLifecycleAuthority.ts` submits exact session/dealer-game/timer
  identity. Game and lobby handlers consume the disposition.
- The unused `NotEnoughPlayersCountdown` and browser timeout teardown are removed.
  `gameLogic.ts` has no generic decision or all-decisions-in writer.

## Participation intent and setup decline (WP9b)

- `20260905014334_session_participation_intent_and_setup_handoff.sql` owns
  versioned participant options, host transfer and atomic setup decline.
- `src/lib/sessionPlayerIntent.ts` supplies the command clients; concurrent local
  gestures are serialized and stale server receipts surface as errors.
- `playerStateEvaluation.ts` retains only the rejoin command adapter. The old
  participation evaluator, `normalizeTwoPlayerSeats.ts`, and `dealerGameBoundary.ts`
  browser writers are removed. Existing server game engines consume queued intent.

## Rule configuration and dealer draws (WP9a)

- `20260905013041_rule_configuration_and_dealer_draw_authority.sql` protects
  game rule fields and draw receipts and revokes dealer-game browser mutation.
- `DealerGameSetup` and its existing RPC client remain the live setup path.
  The unused `DealerConfig` component and unused `Game.tsx` legacy setup handlers
  are removed. `useHighCardDealerSelection` only presents server receipts.

## Gin and shared completion boundary (WP8b)

- `20260905012231_gin_atomic_postgame_participation.sql` owns queued participation
  and pending end inside Gin's existing settlement-bound postgame command.
- `src/lib/ginRummyRoundLogic.ts:advanceGinPostgame` delivers settled identity.
  `src/pages/Game.tsx:handleGameOverComplete` has only per-game server handoffs;
  the generic browser postgame mutation chain has been retired.

## Cribbage postgame authority (WP8a)

- `20260905011535_cribbage_atomic_postgame_participation.sql` extends the existing
  Cribbage postgame command and claim to own participation and all dispositions.
- `src/lib/cribbageAuthority.ts:advanceCribbagePostgame` sends exact settled identity;
  `src/pages/Game.tsx:handleGameOverComplete` dispatches before legacy cleanup.

## Account ledger authority (WP7)

- `supabase/migrations/20260905005940_immutable_account_ledger_and_exact_balances.sql`
  owns append-only account guards, idempotent admin entry/reversal commands,
  exact statement/balance reads, retained source identity and real-session archival.
- `src/hooks/usePlayerBalance.ts` consumes server balances and statement pages;
  `src/lib/accountMoney.ts` formats decimal text without floating-point conversion.
- `src/lib/accountEntryDraft.ts` retains unresolved manual request payloads across
  refresh. `AddTransactionDialog` submits them; `TransactionHistoryDialog` exposes
  linked corrections and read recovery. Direct financial writes are forbidden.

Status: source-indexed during the first Codex ingestion on 2026-08-01.

Baseline inspected: branch `main`, commit
`c094f6aef15578a2bbb92887c148e4893c2abc26`. The worktree was clean before
this documentation pass. The tag `lovable-final-stable-2026-08-01` does not
exist; the only local tag is `lovable-final-cutover-2026-08-01`, whose annotated
tag object peels to commit `400eecc2625eaa2ffaa0c614c2b825985e4c7fbf`.

This map names verified paths and symbols. It is an ownership index, not a
claim that every owner is already database-authoritative.

## Application entry and routes

| Area | Source owner |
|---|---|
| Browser bootstrap | `src/main.tsx` installs startup/runtime instrumentation, presence heartbeat handling, page resume handling, and mounts `<App />`. `src/lib/runtimeInstrumentation/voicePresenceHeartbeat.ts` writes the four-second tab heartbeat, refreshes game context on route entry/exit, and accepts the one immediate Waiting-table pulse; the database-stamped `updated_at` is the safe-boundary presence lease. |
| Application providers and routes | `src/App.tsx` owns the React Query, auth/voice/chat, router, error-boundary, and global UI provider tree. `src/components/ReleaseVersionGate.tsx` wraps that route tree: its lobby gate owns the stale-build refresh dialog, and its keyed `/game/:gameId` entry boundary owns the no-cache manifest admission read before `Game` can mount. |
| Lobby route | `/` -> `src/pages/Index.tsx` -> `src/components/GameLobby.tsx`. |
| Authentication | `/auth` -> `src/pages/Auth.tsx`. |
| Live table | `/game/:gameId` -> `src/pages/Game.tsx` inside `RouteErrorBoundary`. |
| Diagnostic routes | `/test-hands` -> `HandEvalTest`; `/debug-hands` -> `HandEvalDebug`; `/dice-preview` -> `DicePreview`; `/debug-deadlines` -> `DeadlineDebug`; `/diagnostics` -> `Diagnostics`; `/runtime-diagnostics` -> `RuntimeDiagnostics`. |
| Catch-all | `src/pages/NotFound.tsx`. |
| Web build/runtime config | `vite.config.ts`, `index.html`, `tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js`. Vite serves on port 8080 by default. |
| Native wrapper | `capacitor.config.ts` plus `@capacitor/android` and `@capacitor/ios` dependencies. |

Package scripts in `package.json` include `dev: vite`, the focused
`test:liveness-contract` / legacy `test:liveness-gauntlet`, the real-browser
`test:liveness-browser`, its credential-free runner smoke and list commands,
`build: vite build`,
`build:dev: vite build --mode development`, `lint: eslint .`, and
`preview: vite preview`. There is no package `typecheck` script. Repository
policy specifies `bunx tsgo --noEmit`; a production build is `bun run build`.

## Browser liveness verification

| Area | Source owner |
|---|---|
| Playwright runtime | `playwright.config.ts` owns the local/deployed base URL, one-worker execution, Chrome contexts, failure artifacts, local Vite startup, and namespace-isolated output/report directories. `playwright-fixture.ts` exposes the standard Playwright fixture without an external config package. |
| Two-client lifecycle matrix | `e2e/liveness/allGames.twoClient.spec.ts` runs Holm, 3-5-7, Cribbage, Gin Rummy, Horses, Ship Captain Crew, and Yahtzee as independent two-human fake-money scenarios. `support/twoClientSession.ts` owns login, table creation/join, dealer selection, ambiguous ante commit, and mandatory guarded Blast cleanup. |
| Cross-country transport | `e2e/liveness/support/crossCountryNetwork.ts` applies delay and deterministic jitter to one browser's actual Supabase HTTP/WebSocket traffic, supports bounded offline bursts, and can discard one exact RPC response only after server processing. It does not modify application transport or global harness state. |
| Browser liveness contract | `e2e/liveness/support/livenessAssertions.ts` requires one canonical shell/felt, converged session and dealer-game identities, live authoritative status, no bootstrap limbo, and at least one visible legal-action surface. Stable semantic attributes are published by `Game.tsx`, `DealerGameSetup.tsx`, `AnteUpDialog.tsx`, and `PlayerOptionsMenu.tsx`. |
| Safe execution boundary | `e2e/liveness/support/env.ts` reads the ignored `.env.e2e.local`, requires two distinct existing identities, explicit fake-money-write acknowledgement, and explicit confirmation that player 1 has Blast authority. For parallel workers, `runIsolation.ts` requires a named identity slot and run namespace, leases the hashed account pair fail-closed, and `twoClientSession.ts` records each generated game UUID and cleanup receipt. `e2e/liveness/runner.smoke.spec.ts` verifies the two-context browser runner without writes or credentials. |
| Full-seam campaign ledger | `e2e/fullSeam/manifest.ts` is the single versioned inventory for branch, terminal, lifecycle, and rule-requirement coverage. Its focused test enforces stable unique identities, exact cross-references, explicit missing-driver dispositions, and the Cribbage/Gin fixture bindings. It records planned coverage; only retained exact-build evidence can turn a row into a pass. |

## Supabase boundary

`20260905001047_horses_scc_action_authority.sql` owns Horses/SCC roll/hold/lock
admission, server dice and the completion boundary shared with recovery.
`useHorsesMobileController.ts` submits intents and projects receipts. SQL proof:
`horses_scc_action_authority_rollback_proof.sql`; two-player browser proof:
`e2e/liveness/diceActionAuthority.spec.ts`.

`20260905000428_real_money_fixture_exclusion.sql` gates Holm/Cribbage/Gin
fixtures by server money mode and gives the private Cribbage cut helper an
explicit game UUID. Both public discard owners supply the round's UUID.

Holm community/Chucky authority and public reveal projection are in
`20260904235545_holm_private_round_cards.sql`: `private.holm_round_cards`,
the BEFORE projection trigger and the private hydration helper used by the
existing decision/showdown owners. Its complete rollback proof is
`supabase/tests/holm_private_cards_rollback_proof.sql`.

Admin role commands/projections are in
`20260904233922_protected_admin_role_source.sql`; participant identity, host
bot admission and private contact reads are in
`20260904234530_participant_identity_and_profile_privacy.sql`.
`PlayerManagement.tsx` calls `admin_set_user_role` and `admin_get_profiles`.
The four Add Bot callers retain `create_session_bot`; its allocator is internal.

| Area | Source owner |
|---|---|
| Cribbage gameplay authority | `supabase/migrations/20260816113000_cribbage_authority_cutover.sql`: private hidden state, redacted projection, guarded mutations, dealer/start/discard/pegging/counting/continuation/settlement RPCs, and disconnect recovery. `20260816124000_fix_cribbage_startup_handoff.sql` adds atomic ante-to-dealer-selection entry and repairs the scheduled recovery query. `20260816153000_cribbage_postgame_authority.sql` owns exact-settlement continuation to the next dealer-game setup with a durable replay claim. Client intent/state access is in `src/lib/cribbageAuthority.ts`; `Game.tsx` submits the postgame identity. |
| Cribbage forced-tie campaign fixture | `supabase/migrations/20260830193000_cribbage_dealer_draw_tie_harness.sql` adds exact-game arm/get/cancel RPCs over the RLS-protected settings row and a private atomic consumer inside the existing Cribbage dealer-selection authority. It rejects real-money and terminal games, requires an admin participant, expires, consumes once, and leaves the ordinary randomized path unchanged. `supabase/tests/cribbage_dealer_draw_tie_harness_proof.sql` is the rollback proof; `e2e/humanChaos/dealerDraws.humanChaos.spec.ts` is the guarded browser driver. |
| Cribbage rule-branch campaign fixture | `supabase/migrations/20260830213000_cribbage_rule_branch_harness.sql` exposes the existing near-double-skunk, max-pegging-fan, and His Heels authority profiles as exact-game, expiring, fake-money-only, two-active-human requests. The private first-hand consumer is one-shot, its marker is removed by `private.cribbage_public_state`, and later hands return to ordinary authority. `supabase/tests/cribbage_rule_branch_harness_proof.sql` proves the safety/lifecycle boundaries; the four explicit rows in `e2e/branchSmoke/manifest.ts` and guarded driver in `allGames.branchSmoke.spec.ts` own browser evidence. |
| Gin rule-branch campaign fixture | `supabase/migrations/20260831203958_gin_rule_branch_harness.sql` and `20260831215500_gin_rule_branch_target_fallback.sql` expose normal knock/layoff, Gin, undercut, and stock-two void as exact-game, expiring, fake-money-only one-shot requests. Near-Gin targeting uses the canonical human-host fallback. `supabase/tests/gin_rule_branch_harness_proof.sql` owns rollback safety and outcome proof; four explicit rows in `e2e/branchSmoke/manifest.ts` plus `allGames.branchSmoke.spec.ts` own production browser evidence. |

| Area | Source owner |
|---|---|
| Typed browser client | `src/integrations/supabase/client.ts` creates the singleton `supabase` client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with local-storage session persistence and token refresh. |
| Generated schema/RPC types | `src/integrations/supabase/types.ts`. This is generated evidence, not a replacement for migration inspection. |
| Local project/function config | `supabase/config.toml`, owned production project id `xvhmbuppghwmwpwrkzao`; Vercel production at `holm357.com` targets this project. |
| Schema history | `supabase/migrations/` (349 versioned migration files). Later definitions supersede earlier same-named functions. |
| Edge Functions | `supabase/functions/enforce-deadlines`, `enforce-all-deadlines`, `generate-incident-report`, `reset-password`, and `voice-to-text`; shared helpers live in `supabase/functions/_shared/`. |
| Canonical chip transfer projection | `supabase/migrations/20260809170000_canonical_chip_transfer_ledger.sql` journals every player/pot chip mutation and emits immutable game-scoped batches; `20260809210000_stage_chip_transfer_cursors.sql` stages endpoint cursors with the mutation. `20260810193000_split_normal_357_leg_sweep_transfer_projection.sql` first split normal final-leg 3-5-7 presentation; `20260817131736_fix_357_leg_reserve_and_setup_decline.sql` corrects owned leg reserve so it never enters the pot and publishes ordered `leg`/`sweep`/`transfer` stages. Browser financial writers were retired in `20260905004403_financial_write_authority_and_holm_remainder.sql`; internal server commands own those transfers, while `enforce-all-deadlines` uses the same RPC for watchdog transfers. `ChipPresentationLedger` performs an exact one-shot batch lookup when an endpoint cursor proves its INSERT event was missed. `ChipTransportProvider` and `CanonicalSeatCluster` keep the ledger-owned source seat visible throughout an outbound flight. Game-owned admission prerequisites include `src/lib/threeFiveSeven/showdownPresentation.ts` for the exact Secret Reveal/result/cursor boundary. |
| Post-game participation and abandonment owner | `supabase/migrations/20260809190000_fast_postgame_presence_confirmation.sql` and `20260809200000_extend_fake_money_postgame_presence.sql` own result-backed post-game watches, three consecutive five-second missed windows, absent-player sit-out, and real/fake terminal disposition when presence is ambiguous. `20260815163818_atomic_explicit_postgame_stand_up.sql` separately owns authenticated explicit Stand Up plus its immediate zero/one/eligible cohort decision in one transaction. Initial waiting and live dealer games remain outside these owners; the legacy `enforce-all-deadlines` Edge Function remains separate. |
| Serialized scheduled recovery | `supabase/migrations/20260820023000_serialize_game_recovery_scheduler.sql` installs the sole one-second `private.advance_due_game_state()` cron owner. `20260820180000_canonical_game_timer_ownership.sql` adds the exact-identity `private.game_timer_registry` and its canonical drain task for session dealer selection, dealer setup, ante, Holm decisions, Horses/SCC progression, and postgame continuation; `20260820190000_index_canonical_game_timer_foreign_keys.sql` completes its foreign-key indexes. `20260823235121_real_money_liveness_contract.sql` publishes a completed-pass heartbeat, exposes the participant-scoped redacted health RPC, and fails closed before a new real-money configuration enters ante decision when recovery is unhealthy; `20260824000455_fix_real_money_liveness_phase_column.sql` corrects the timer phase projection. `20260901085259_admit_due_recovery_work.sql` admits exact due owners immediately and rotates one full-safety owner per tick, retaining heartbeat-independent fake-money and disconnect recovery without invoking all tasks together. The dispatcher remains the only scheduler. `src/lib/realMoneyLivenessContract.ts` inventories every game phase and the two explicit human-untimed exceptions; `src/lib/actionSurfaceRecovery.ts` owns presentation-only missing-action reconciliation. Rollback proofs for the underlying scheduler live in `supabase/tests/game_recovery_scheduler_rollback_proof.sql` and `supabase/tests/canonical_game_timer_rollback_proof.sql`. |
| Holm postgame authority | `supabase/migrations/20260823171449_holm_postgame_authority.sql` hardens `private.advance_standard_postgame` with exact completed-round and `chucky_final_award` settlement admission for Holm, and exposes authenticated `public.holm_advance_postgame`. Connected clients and the existing canonical timer converge on the same durable `(game_id, dealer_game_id, hand_number)` claim. `MobileGameTable.tsx`, `holmTransferPresentationStage.ts`, and `holmPresentationBarrier.ts` require both the exact immutable Chucky-award cursor receipt and celebration completion before a connected client submits that claim; the timer remains the disconnect fallback. Rollback proof: `supabase/tests/holm_postgame_authority_rollback_proof.sql`. |
| Horses/SCC connected authority | `supabase/migrations/20260823173530_horses_scc_connected_authority.sql` routes connected completed rounds through `public.horses_scc_advance_completed_round`, which chooses the shared atomic tie-rollover or terminal-settlement owner from exact persisted dice. `public.horses_scc_advance_postgame` and the canonical timer converge on the hardened standard-postgame owner, which requires the exact completed dice round and one `horses_terminal` result. Rollback proof: `supabase/tests/horses_scc_connected_authority_rollback_proof.sql`; typed client: `src/lib/horsesSccAuthority.ts`. |

Owned-target rehearsal evidence, the retained/excluded data boundary, function
deployment status, and final cutover gates are recorded in
`docs/codex/SUPABASE_CUTOVER.md`.

`src/integrations/supabase/types.ts` records the deployed Holm preparation and
activation RPCs. Their current defining migrations and rollback proofs remain
the authority over generated declarations.

## Session and table orchestration

| Owner | Responsibility |
|---|---|
| `src/components/GameLobby.tsx` | Lobby listing, create/join navigation, lobby realtime, admin/settings entry, and completed-session results access. |
| `src/lib/lobbyFetch.ts:fetchLobbyGames` | Bounded lobby query, player/profile projection, ended-session snapshot lookup, and abort handling. |
| `src/pages/Game.tsx` | Central route/lifecycle orchestrator: cold public hydration, auth admission, game/round/player/card fetches, central realtime, identity resets, pregame, dealer selection/config presentation, ante intent, game startup, game-over continuation, and local Session Ended admission. Waiting-table Start Game calls only `public.begin_session_dealer_selection`; that RPC owns the roster, exact two-player normalization, and `waiting → dealer_selection` transition, while the canonical timer trigger owns the draw. Full snapshots run through `src/lib/serializedAuthoritativeFetch.ts`; burst triggers coalesce and recovery stays armed until a snapshot succeeds. Expiring phase mutations are submitted through `src/lib/gameTimerAuthority.ts`; `src/hooks/useDeadlineEnforcer.ts` is a compatibility no-op rather than a client scheduler. Fresh admission suppresses expired setup/ante UI and sends already-ended or confirmed-missing sessions directly to the lobby. `src/lib/sharedPlayerCards.ts` limits shared `player_cards` reads and empty-hand recovery to Holm and 3-5-7; dedicated-state and dice games never enter that recovery path. |
| `src/components/PreGameLobby.tsx`, `src/components/WaitingForPlayersTable.tsx` | Pregame and waiting-room presentation inside the persistent table shell. |
| `src/hooks/useWaitingRoomActions.ts` | Invite/rejoin/start actions and queued Add Bot calls through `create_session_bot`; minimum two players and maximum seven occupied seats are enforced here/the waiting UI. |
| `src/components/DealerGameSetup.tsx` | Seven-game selector, per-game configuration, `dealer_games` creation, `games.current_game_uuid` assignment, dealer-game boundary cleanup, and transition to ante/dealer-selection phases. Every setup surface is body-portaled in the named canonical modal z-band above shell transports and high-card reveals. |
| `src/hooks/useHighCardDealerSelection.ts` | Presentation of database-owned initial/session dealer selection; the existing Cribbage authority path remains separate. `src/lib/sessionDealerDrawPresentation.ts` owns exact `preparedAt` receipt identity, ordered cumulative tie waves, exact painted-wave advancement, and the live per-client hold that carries an incomplete presentation across the status-driven setup handoff without blocking database progression or replaying a cold historical receipt. |
| `src/pages/Game.tsx:handleGameOverComplete` | Post-presentation continuation router. Holm, Horses/SCC, 3-5-7, and Yahtzee branch to their exact database postgame owners before shared browser leader/evaluation work; legacy/shared paths consume pending session end, evaluate participant state, select/rotate the next dealer, and enter dealer/game selection. Typed clients include `src/lib/holmPostgameAuthority.ts` and `src/lib/horsesSccAuthority.ts`. |
| `src/components/canonicalShell/SessionEndedTablePhase.tsx` | Local Session Ended announcement, felt Results panel, and Back to Lobby action. Fresh mounts of an already-ended session are redirected by `Game.tsx`; connected clients retain the shell first. |

## Canonical shell ownership

| Surface | Source owner |
|---|---|
| Persistent table root | `src/lib/canonicalShell/PersistentTableShell.tsx:PersistentTableShell`. |
| Single felt host | `src/lib/canonicalShell/ShellOwnedFeltHost.tsx:ShellOwnedFeltHost` is the only direct importer/renderer of `src/lib/canonicalShell/CanonicalFeltSurface.tsx:CanonicalFeltSurface`. The old handoff path under `src/components/canonicalShell/` was stale. |
| Gameplay/waiting slot | `src/lib/canonicalShell/PlayfieldSlotController.tsx:PlayfieldSlotController`; slot identity/choreography live in `PlayfieldSlot.ts`, `useSlotIdentityTracker.ts`, and `slotChoreography.ts`. |
| HUD and tab rail | `ShellHudChrome.tsx`, `ShellHudGrid.tsx`, `ShellTabBar.tsx`, `ShellTimerRail.tsx`, and `ActivePlayerHUD.tsx`. |
| Seat projection | `SeatAnchorLayer.tsx`, `seatAnchors.ts`, `seatRing.ts`, `CanonicalSeatCluster.tsx`, `CanonicalOpponentSeat.tsx`, `GameplayOpponentSeatLayer.tsx`, and `PreSessionSeatLayer.tsx`. |
| Geometry | `ResponsiveGeometryProvider.tsx`, `canonicalShellLayoutConfig.ts`, `canonicalSlotPlacement.ts`, `src/lib/wave4LayoutResolver/`, and game providers in `src/lib/wave5GameplayGeometry/`. |
| Announcements and celebration | `announcements/CanonicalAnnouncementProvider.tsx`, `CanonicalAnnouncementLayer.tsx`, `CanonicalCelebrationLayer.tsx`, `SessionLifecycleAnnouncer.tsx`, and `renderers.tsx`. |
| Overlay ownership | `ShellOverlayMounts.tsx` exposes the canonical `slot`, `settlement`, and `transient` layers. |
| Chip transport | `ChipTransportProvider.tsx`, `ChipTransportRuntime.tsx`, `ChipPresentationLedger.ts`, `ChipPresentationDeltaRuntime.tsx`, `holmTransferPresentationStage.ts`, and `chipEndpoints.ts`. The provider owns financial departure/arrival/reconcile display and its signed delta-effect stream. Concurrent player-to-pot flights compose as one ledger-owned pot-arrival cohort, while the delta runtime derives opponent-label origin from the canonical felt-facing chip-disc rim. Holm classifies immutable stage topology solely to admit and advance its non-financial phase; dealer-game-ending Chucky awards are exact `transfer`-reason stages whose durable cursor receipt participates in connected terminal release. |
| Card transport/deal | `cardTransport/CardTransportProvider.tsx`, `CardTransportRuntime.tsx`, `DealRuntime.tsx`, and `cardEndpoints.ts`. |
| Settlement presentation | `settlement/SettlementProvider.tsx`, `SettlementRuntime.tsx`, and `settlement/types.ts`. These are presentation owners, not financial authority. |
| Active hand | Shared `src/components/activeHand/ActiveHandFan.tsx` and `MeasuredActiveHandFan.tsx`; Holm also retains a separate local-hand route in `MobileGameTable.tsx`. |

## Authoritative identity and anti-regression

`src/lib/gameStateSync/useGameStateSync.ts:useGameStateSync` accepts only
forward authoritative snapshots and semantically identical equal-progress
snapshots. `src/lib/gameStateSync/authoritativeIdentity.ts:useAuthoritativeIdentity`
tracks dealer-game, hand, and round identity; `Game.tsx` and game components
reset transient/presentation state when those identities change.
`src/lib/authoritativeGameState.ts` merges complete `games` Realtime row images
without dropping joined relations and rejects strictly older row timestamps.
Its publication policy preserves complete-row ingestion for all pre-hand
phases and six ordinary families, while active 3-5-7 treats a constituent
`games` row only as a refetch signal because
`three_five_seven_current_frame` owns the atomic gameplay projection.
`src/lib/threeFiveSeven/decisionReceipt.ts` consumes the exact committed
decision result on the initiating client before Realtime/full-fetch
reconciliation.

| Game family | Progress adapter |
|---|---|
| Holm | `src/lib/gameStateSync/holmProgress.ts:getHolmProgress` |
| 3-5-7 | `src/lib/gameStateSync/threeFiveSevenProgress.ts:getThreeFiveSevenProgress` |
| Cribbage | `src/lib/gameStateSync/cribbageProgress.ts:getCribbageProgressFn` |
| Gin Rummy | `src/lib/gameStateSync/ginRummyProgress.ts:getGinRummyProgress` |
| Horses and SCC | `src/lib/gameStateSync/horsesProgress.ts:getHorsesProgress` |
| Yahtzee | `src/lib/gameStateSync/yahtzeeProgress.ts:getYahtzeeProgress` |

## Game ownership map

### Holm

- Entry/presentation: `Game.tsx` -> `MobileGameTable.tsx`;
  `HolmAnchoredSlot.tsx`, `HolmDealOrchestrator.tsx`,
  `HolmCanonicalCommunityRow.tsx`, `ChuckyHand.tsx`,
  `CommunityCards.tsx`, and `HolmWinPotAnimation.tsx`.
- Showdown admission: `Game.tsx` derives one non-financial Holm phase plan per
  authoritative `rounds.id`/hand plus immutable transfer cursor;
  `MobileGameTable.tsx` admits the matching staged transfer batches through
  `holmTransferPresentationStage.ts`. Do not use `games.current_round` as a
  Holm hand identity because it remains `1` across hands.
- Non-financial leg cue: the shared `+L` `ValueChangeFlash` is a 3-5-7-only
  child of `MobileGameTable.tsx`; it is never a Holm/pot/chip-balance effect.
- State/actions: initial creation enters `public.start_holm_initial_hand`;
  decisions enter through `src/lib/gameLogic.ts:makeDecision` and the
  exact-round `public.holm_submit_decision`. The last multi-player decision
  calls `public.resolve_holm_showdown` from
  `20260814020000_holm_database_resolution_hardening.sql`, which owns card
  evaluation, final reveal, settlement, and successor creation in one
  transaction. `src/lib/holmGameLogic.ts:endHolmRound` can only request that
  exact resolver; it does not evaluate, settle, or create a hand. Per-client
  selection of the completed predecessor or its exact prepared successor lives
  in `src/lib/holmPreparedPresentation.ts`. `HolmDealOrchestrator.tsx` reports
  the shared deal-ready boundary through `MobileGameTable.tsx`; `Game.tsx`
  then calls authenticated `public.acknowledge_holm_prepared_hand_dealt`.
  Before that successor deal, `MobileGameTable.tsx` captures the exact Holm
  transfer stage/identity at canonical-ledger admission. `Game.tsx` stores the
  resulting completion in the evidence map defined by
  `src/lib/holmPresentationBarrier.ts` and reconciles it idempotently with the
  exact predecessor barrier. Mutable successor props never reclassify a batch
  at settlement. Holm timer/control presentation also matches the exact
  presented dealer-game/round/hand, while raw deadline enforcement remains
  independent of client presentation.
  Migration `20260814190000_holm_acknowledged_presentation_release.sql` owns
  the private immutable active-human cohort, final-ack publication, and the
  configurable server-only missing-acknowledgement fallback. The
  service-only `recover_pending_holm_showdowns` call in
  `supabase/functions/enforce-deadlines/index.ts` replays only a legacy
  all-decisions-in multi-player hand. All-fold and solo-vs-Chucky retain their
  established atomic action owners. Showdown recovery uses the
  presentation-only `rounds.presentation_fallback_at` lease, never the
  gameplay `decision_deadline`.
- Deadline action owner: `supabase/functions/enforce-deadlines/index.ts`
  authenticates an active participant and calls the service-only
  `public.holm_apply_deadline_decision` adapter, most recently defined by
  `20260812150000_atomic_holm_turn_and_continuation.sql`. The adapter locks the
  exact identity and delegates the action, next turn/deadline, and terminal
  branch to `public.holm_submit_decision`; it is not a second settlement owner
  and cannot invent a replacement deadline.
- Bots: `src/lib/botPlayer.ts:makeBotDecisions` and
  `src/lib/botHandStrength.ts:getBotFoldProbability`; scheduling/authority
  recovery is mounted in `Game.tsx`.
- Settlement/terminal: `src/lib/holmSettleHand.ts:settleHolmHand` calls
  `public.holm_settle_hand`; `supabase/migrations/20260810201500_stage_holm_showdown_transfer_projection.sql`
  adds the ordered immutable pot-award/replacement-pot projection to the
  existing one-transaction settlement. The initial-hand RPC in that migration
  journals ante collection as `ante`; the ordinary
  snapshot unique index in
  `supabase/migrations/20260801013407_1fce27d9-ddff-4616-b08b-0231bcb2d114.sql`.
- Focused tests: `holmProgress.test.ts`,
  `holmPreparedPresentation.test.ts`,
  `holm_acknowledged_presentation_release_proof.sql`,
  `PersistentTableShell.lifecycle.test.tsx`, Holm transport/slot tests under
  `src/lib/canonicalShell/`, and the harness profiles listed below.

### Cribbage

- Entry/presentation: `Game.tsx` -> `CribbageMobileGameTable.tsx`;
  `CribbageFeltContent.tsx`, `CribbageDealOrchestrator.tsx`,
  `CribbageAnchoredCribCutMount.tsx`,
  `CribbageAnchoredPeggingRowMount.tsx`, `CribbageCountingPhase.tsx`, and
  `CribbagePegBoard.tsx`. `src/lib/cribbage/cribbageCutPresentation.ts`
  is the sole presentation-boundary derivation for a live cut versus an
  authoritative exposed-cut rejoin and derives the one-time persisted crib
  hydration for a partial-discard rejoin; its focused test runs before `npm
  run build`.
- State/actions: `private.cribbage_round_states` owns hidden and mutable truth;
  `rounds.cribbage_state` is its redacted realtime projection.
  `src/lib/cribbageAuthority.ts` fetches caller-specific state and submits
  pegging intent; `CribbageMobileGameTable.tsx` owns presentation only. Exact
  round Realtime notifications trigger private-state refetches; there is no
  recurring browser fallback poll. `cribbageRenderGuards.ts` derives the
  committed counting-plan baseline for the first counting paint.
- Lifecycle: `public.cribbage_begin_dealer_selection` atomically consumes the
  completed-ante boundary and publishes the dealer result;
  `src/lib/cribbageRoundLogic.ts:startCribbageRound` submits the replay-safe
  initial-hand RPC. Dealer selection, first deal, discard/cut,
  pegging, counting, successor release, and disconnect recovery are owned by
  `20260816113000_cribbage_authority_cutover.sql`, with startup correction in
  `20260816124000_fix_cribbage_startup_handoff.sql` and the terminal-counting
  presentation lease in
  `20260816143000_defer_cribbage_terminal_until_counted.sql`. The terminal
  dealer-game reset and next-dealer derivation are owned by
  `public.cribbage_advance_postgame` in
  `20260816153000_cribbage_postgame_authority.sql`; its private exact-identity
  claim makes duplicate clients and late replays read-only.
  `public.cribbage_finalize_counting` / `public.cribbage_release_counting`
  retain the accepted counting presentation lease. A database-resolved winner
  remains private `terminal_pending` until visible-count acknowledgement; the
  same scheduled owner promotes and settles it after the disconnect fallback.
  `public.cribbage_record_counting_progress` in
  `supabase/migrations/20260814010000_cribbage_counting_rejoin_cursor.sql`
  owns the monotonic presentation cursor; `CribbageCountingPhase.tsx` derives
  a reconnect cursor from the durable count-start anchor only until that
  cursor is persisted. `src/lib/cribbage/countingResume.ts` derives the
  active resumed combo announcement and guards historical final-pegging events;
  `CribbageMobileGameTable.tsx` admits that event only to a client that observed
  the same hand in `pegging`, and suppresses bootstrap ambient announcements
  while authoritative counting owns the restored-combo rail. Bootstrap remains
  silent until the first authoritative Cribbage phase arrives.
  The service-only fallback caller is in
  `supabase/functions/enforce-deadlines/index.ts`.
- Bots/scoring: the client may choose a discard presentation preference, but
  private server helpers validate cards and independently derive pegging and
  counting points. `private.advance_due_cribbage_state` is the disconnect-safe
  bot/start/continuation/settlement owner.
- Settlement/terminal: `src/lib/cribbageSettleGame.ts:settleCribbageGame`
  submits immutable identity to `public.cribbage_settle_game`; the proven
  settlement implementation is retained behind the authority wrapper in the
  cutover migration.
  The RPC owns the result claim, server-derived payout, chips, round completion,
  snapshots, terminal disposition, and LAST HAND session financials in one
  transaction. `CribbageMobileGameTable.tsx` observes/replays settlement and
  owns presentation only. `Game.tsx` and
  `src/lib/canonicalShell/liveTerminalPresentationHold.ts` own the exact-scope,
  same-mount hold that keeps the table admitted when atomic settlement reaches
  `session_ended` before the child can publish terminal animation liveness; a
  fresh terminal mount has no latch and follows the direct-to-lobby path.
  `cribbage_apply_discard` and `cribbage_apply_pegging_action` lock the exact
  private hand and publish one redacted successor snapshot.
- Focused tests: Cribbage deal orchestrator, cards-tab render/measurement,
  Go bubble, pegging Go, artifact descriptor, render guard, stress, and hand
  render invariant tests under `src/components/` and `src/lib/cribbage/`,
  plus `cribbageProgress.test.ts`; `cribbageSettleGame.test.ts` covers the
  identity-only client RPC boundary and replay/error result handling, and
  `liveTerminalPresentationHold.test.ts` covers live-versus-fresh terminal
  admission identity. Direct SQL behavior still requires migration/deployment
  proof.

### Gin Rummy

- Entry/presentation: `Game.tsx` -> `GinRummyGameTable.tsx`;
  `GinRummyFeltContent.tsx`, `GinRummyDealOrchestrator.tsx`,
  `GinAnchoredSlot.tsx`, `GinAnchoredInteractionSlot.tsx`,
  `GinRummyMobileCardsTab.tsx`, and the knock/gin overlays.
- State/actions: `ginRummyTypes.ts`;
  `ginRummyGameLogic.ts:createInitialGinRummyState`, `dealHand`,
  `takeFirstDrawCard`, `passFirstDraw`, `drawFromStock`,
  `drawFromDiscard`, `discardCard`, `declareKnock`, `layOffCard`, and
  `scoreHand`.
- Lifecycle: `ginRummyRoundLogic.ts:startGinRummyRound`,
  `startNextGinRummyHand`, `updateGinRummyState`, and
  `fetchGinRummyState`.
- Bots/scoring: `ginRummyBotLogic.ts`; `ginRummyScoring.ts:findOptimalMelds`,
  `scoreKnock`, `canKnock`, and `hasGin`.
- Settlement/terminal: ordinary hand history remains in
  `ginRummyRoundLogic.ts:recordGinRummyHandResult`; terminal settlement is
  `ginRummySettleGame.ts:settleGinRummyGame`, which submits immutable identity
  to `public.gin_rummy_settle_game` in
  `20260804010000_atomic_gin_terminal_settlement.sql`.
- Focused tests: `ginRummyGameLogic.test.ts`,
  `ginRummyScoring.test.ts`, `ginRummyNonDealerNearKnock.test.ts`, Gin table
  knock/write/tab tests, Gin cards-tab tests, and `ginRummyProgress.test.ts`.

### Yahtzee

- Entry/presentation: `Game.tsx` -> `YahtzeeGameTable.tsx`;
  `YahtzeeAnchoredSlot.tsx`, `YahtzeeAnchoredInteractionSlot.tsx`,
  `YahtzeeOverlays.tsx`, `DiceRollAnimation.tsx`, and dice shell primitives.
- Score presentation: `YahtzeeGameTable.tsx` and
  `src/lib/yahtzeePresentation.ts` bind the scorer card/dice/rail event to the
  exact round and action sequence. A later authoritative sequence retires that
  local presentation before paint; this does not advance game state.
- State/actions: `rounds.yahtzee_state` is written only through
  `public.yahtzee_apply_action` and the full-mask
  `public.yahtzee_set_holds` RPC in
  `20260820140918_atomic_yahtzee_hold_mask.sql`;
  `src/lib/yahtzeeAuthority.ts` submits exact intent/action sequence and
  consumes the committed result. `YahtzeeGameTable.tsx` coalesces optimistic
  hold intent and drains the latest mask before roll or score. Pure client
  rule helpers remain preview/presentation support.
- Lifecycle: `yahtzeeRoundLogic.ts:startYahtzeeRound` calls atomic
  `public.start_yahtzee_round`; `public.yahtzee_advance_postgame` owns the
  exact-settlement handoff; `private.advance_due_yahtzee_state` owns recovery.
- Bots/scoring: `yahtzeeBotLogic.ts:getBotHoldDecision`,
  `getBotCategoryChoice`, and `shouldBotStopRolling`;
  `yahtzeeScoring.ts:scoreCategory`, `getTotalScore`, and Joker helpers.
- Settlement/terminal: `src/lib/yahtzeeSettleGame.ts:settleYahtzeeGame`
  submits immutable identity to `public.yahtzee_settle_game`, defined by
  `supabase/migrations/20260803234111_atomic_yahtzee_terminal_settlement.sql`
  and corrected for post-progression replay by
  `supabase/migrations/20260804000259_fix_yahtzee_settlement_replay.sql`.
  The RPC derives score/winner or tie, owns fixed-stake payout, result claim,
  post-payout snapshots, and terminal disposition. `YahtzeeGameTable.tsx`
  retries settlement and owns presentation only; `Game.tsx` retains the live
  terminal table and delegates continuation without shared browser cleanup.
- Authority migration/proof:
  `supabase/migrations/20260816210000_yahtzee_authority_cutover.sql` and
  `supabase/tests/yahtzee_authority_rollback_proof.sql`.
- Focused tests: `yahtzeeScoring.test.ts`, `yahtzeeGameLogic.test.ts`,
  `yahtzeeProgress.test.ts`, `yahtzeeAuthority.test.ts`,
  `yahtzeePresentation.test.ts`, `yahtzeeSettleGame.test.ts`, the Yahtzee cases in
  `liveTerminalPresentationHold.test.ts`, and shared die-row/shell tests.

### Production diagnostics

- `src/lib/invariantEventLogger.ts` is the always-on, edge-deduplicated writer
  for true invariant violations in `debug_events`.
- `src/lib/persistSyncDebugEvent.ts` retains opt-in sync/proof events in
  `debug_sync_events`; ordinary transition, correction, and gate events do not
  persist without the exact debug channel.
- Game-specific detailed traces, including `yahtzeeHeldDieTrace.ts` and 3-5-7
  wartime capture, are fail-closed and require their explicit channel.
- Production retention is owned by
  `supabase/migrations/20260831194950_repair_quota_retention.sql`:
  `private.purge_quota_diagnostics` independently keeps the two high-volume
  debug tables and successful cron history to one day while preserving failed
  cron evidence for seven days; the broader diagnostic purge uses the same
  one-day floor and excludes audit/session history.
- Cribbage visual-report forensics are local and submit-driven:
  `src/lib/cribbage/forensicTrace.ts` owns a 200-entry, payload-bounded,
  `(game_id, dealer_game_id)`-scoped in-memory ring, while
  `src/lib/cribbage/activeHandSnapshotStore.ts` captures the current or most
  recently unmounted Cards subtree, action-gate state, active-hand DOM counts,
  and discard-control hit-test stack. `VisualBugReportButton.tsx` attaches that
  evidence only when a visual report is submitted; the trace performs no
  continuous network writes and gameplay never reads it.

### 3-5-7

- Entry/presentation: `Game.tsx` -> `MobileGameTable.tsx`;
  `ThreeFiveSevenAnchoredSlot.tsx`, `ThreeFiveSevenDealOrchestrator.tsx`,
  `ThreeFiveSevenProofCardsAnimation.tsx`, and
  `ThreeFiveSevenTerminalController.tsx`.
- Route provenance and historical deal reconstruction:
  `src/lib/threeFiveSeven/routeEntryMode.ts` classifies the first hydrated
  3-5-7 identity from either the preceding persistent-route game type or
  witnessed pre-hand lifecycle. This makes DG1 live for an already-connected
  route while retaining historical reconstruction for a cold active-hand
  mount. `src/lib/threeFiveSeven/waveAdmission.ts` independently enforces one
  cumulative R1/R2/R3 manifest per exact DealRuntime ledger.
  `cardTransport/DealRuntime.tsx` reconstructs the authoritative cumulative
  per-recipient settled baseline for refresh/rejoin; later waves remain
  additive. `src/lib/threeFiveSeven/presentationReadiness.ts` filters exact
  current-wave card receipts. `Game.tsx` owns the single identity-complete
  readiness token used by both timer and action gates; `MobileGameTable.tsx`
  and `ThreeFiveSevenDealOrchestrator.tsx` render the authoritative prior-wave
  baseline plus only those exact new receipts. `src/lib/crossCountryRouteGauntlet.test.ts` covers all 49 ordered
  route pairs and lagging/cold-client variants; `dg1LiveEntryGauntlet.test.ts`
  protects the first-dealer-game boundary across all seven real-money games.
- State/actions: `src/lib/gameLogic.ts:startRound`, `makeDecision`,
  `autoFoldUndecided`, `endRound`, and `proceedToNextRound`;
  `src/lib/cardUtils.ts:evaluateHand`; seam helpers in
  `src/lib/threeFiveSeven/advanceRound.ts`. These client functions now submit
  intent and exact identity to the server-authority RPCs.
- Bots: `botPlayer.ts:makeBotDecisions` with
  `botHandStrength.ts:getBotFoldProbability`; the browser submits human intent,
  while `three_five_seven_recover_game` owns disconnected/bot expiry and
  progression.
- Authority: `supabase/migrations/20260816213000_three_five_seven_authority_cutover.sql`
  guards public gameplay rows and adds atomic `three_five_seven_begin_game`,
  exact decision/expiry, resolution/continuation, settlement/reveal, durable
  postgame handoff, and scheduled recovery. Hidden-card read policy optimization
  is in `20260817123000_optimize_357_hidden_cards_rls.sql`. The recovery RPC is
  also called by `enforce-all-deadlines` and the 3-5-7 branch of
  `enforce-deadlines`. Follow-up
  `20260817131736_fix_357_leg_reserve_and_setup_decline.sql` owns correct leg
  reserve accounting and exact postgame setup-owner decline; the browser RPC
  adapter is `src/lib/threeFiveSeven/declineSetup.ts`.
- Atomic read projection: migration
  `20260818140000_atomic_357_current_frame.sql` defines
  `three_five_seven_current_frame`; `src/lib/threeFiveSeven/currentFrame.ts`
  validates exact identity/full viewer-hand admission, rejects late or
  regressive frames, and supplies the strict round selector used by `Game.tsx`.
- PvP showdown pacing: `src/lib/threeFiveSeven/showdownPresentation.ts` binds
  opponent-face readiness, the configured reading dwell, the immutable `win`
  transfer batch, and generic result announcement to the accepted atomic frame.
  Migration `20260822090000_pvp_showdown_pacing_defaults.sql` owns that delay
  and Holm's Rabbit Hunt post-final-flip continuation delay.
- Settlement/terminal: `three_five_seven_settle_game` accepts exact committed
  resolution identity and retains the established atomic chip/snapshot
  settlement implementation behind its authority wrapper.
- Focused tests: `threeFiveSeven/advanceRound.test.ts`,
  `threeFiveSeven/currentFrame.test.ts`,
  `threeFiveSevenProgress.test.ts`,
  `supabase/tests/three_five_seven_authority_rollback_proof.sql`,
  `supabase/tests/three_five_seven_rollover_proof.sql`, and shared card
  transport/slot tests.

### Horses

- Entry/presentation: `Game.tsx` -> `MobileGameTable.tsx` ->
  `useHorsesMobileController.ts`; `DiceAnchoredSlot.tsx`,
  `HorsesMobileCardsTab.tsx`, `HorsesDie.tsx`,
  `HorsesHandResultDisplay.tsx`, and `HorsesPlayerArea.tsx`.
- State/actions: `rounds.horses_state`;
  `horsesGameLogic.ts:rollDice`, `toggleHold`, `lockInHand`,
  `evaluateHand`, and `determineWinners`; connected intent adapter is
  `useHorsesMobileController`. It does not write the whole state, initialize
  rounds, repair null turns, or advance timeouts. Database action RPCs and the
  canonical recovery timer own those mutations.
- Lifecycle: `private.start_horses_scc_initial_round` through canonical ante
  authority; connected-round/postgame RPCs own continuation. Browser round
  writers were retired with WP6.
- Bots: `horsesBotLogic.ts:getBotHoldDecision`,
  `shouldBotStopRolling`, and `applyHoldDecision`, driven by the claimed
  controller in `useHorsesMobileController`.
- RPCs: `claim_horses_bot_controller` (latest definition remains
  `supabase/migrations/20251231220448_9e641bd2-2d4c-4be1-8d68-74aca357c083.sql`);
  `horses_set_player_state` latest in
  `supabase/migrations/20260208181247_b7f5d957-7530-40fb-84b6-a850c77197f6.sql`;
  `horses_advance_turn` latest in
  `supabase/migrations/20260322190632_da97037f-98a4-44a0-b9c3-1b3822ee7ff0.sql`.
- Settlement/terminal: `src/lib/horsesSettleGame.ts:settleHorsesGame` submits
  immutable identity to `public.horses_settle_game`, defined by
  `supabase/migrations/20260811010000_horses_scc_disconnect_safe_settlement.sql`,
  with interrupted-turn preservation in
  `20260811011500_preserve_horses_scc_partial_turn_rolls.sql`.
  The RPC derives the persisted-dice outcome and atomically owns the result
  claim, pot transfer, snapshots, and terminal disposition. The dedicated
  `enforce-horses-scc-deadlines-5s` database job resolves expired no-client
  turns and all-absent tie rollovers. Connected completed rounds now submit
  exact identity through `src/lib/horsesSccAuthority.ts`; PostgreSQL selects
  that same tie owner or terminal settlement. Connected win presentation and
  canonical-timer recovery also share the exact standard-postgame owner.

### Ship Captain Crew

- Entry/presentation: the Horses path above with
  `gameType='ship-captain-crew'`; SCC artifacts are `SCCDie.tsx` and
  `SCCHandResultDisplay.tsx`.
- State/actions: SCC also stores state in `rounds.horses_state`;
  `sccGameLogic.ts:rollSCCDice`, `lockInSCCHand`, `evaluateSCCHand`, and
  `determineSCCWinners`; `useHorsesMobileController` is the mounted owner.
- Lifecycle uses the shared Horses/SCC server owners; bots use
  `sccBotLogic.ts:getSCCBotDecision` and `shouldSCCBotStopRolling`.
- RPC/settlement: reuses the Horses action RPCs, connected-round/postgame
  authority, and the shared
  `public.horses_settle_game` terminal owner above. Its server evaluator keeps
  6-5-4 qualification/cargo rules distinct from Horses wild scoring.

## Snapshot and result pipeline

Canonical snapshot identity is
`(game_id, dealer_game_id, hand_number, player_id)`.

| Role | Source |
|---|---|
| Shared participation commands | `src/lib/sessionParticipation.ts` calls `public.session_leave` and `public.session_take_seat`; migration `20260905003226_atomic_departure_rejoin.sql`. |
| Departing-player audit | `private.session_departures`, written from locked server rows by participation version. No financial snapshot key is reserved mid-hand. Browser snapshot DML is revoked. |
| Holm transactional writer | `public.holm_settle_hand`, latest projection change in `supabase/migrations/20260810201500_stage_holm_showdown_transfer_projection.sql`. |
| Financial snapshot writers | Seven transactional settlement owners. The seat command also records a zero opening balance for a newcomer at an already-settled boundary. Browser snapshot writers are removed. |
| Cribbage transactional writer | `public.cribbage_settle_game` in `supabase/migrations/20260802001500_atomic_cribbage_terminal_settlement.sql`. |
| Yahtzee transactional writer | `public.yahtzee_settle_game` in `supabase/migrations/20260803234111_atomic_yahtzee_terminal_settlement.sql`, latest definition in `supabase/migrations/20260804000259_fix_yahtzee_settlement_replay.sql`. |
| Session Ended reader | `SessionEndedTablePhase.tsx:SessionEndedFeltPanel` merges the latest snapshot participants with the current roster; humans dedupe by `user_id`, bots by `player_id`. |
| Lobby/session result reader | `src/components/SessionResults.tsx` is snapshot-first with `game_results` fallback; `src/lib/lobbyFetch.ts` loads ended-game snapshots. |
| History reader | `src/components/hand-history/useHandHistoryData.ts` plus the session-history query in `Game.tsx`. |
| SessionResult minting | `public.record_session_results`, latest definition in `supabase/migrations/20260802001500_atomic_cribbage_terminal_settlement.sql`, runs on the terminal status transition, reads latest human snapshots, and dedupes new writes by source game and profile. |
| Snapshot schema/index | `supabase/migrations/20260801011431_c899bfad-30e4-4d26-9201-57755fb9c896.sql` adds/stamps `dealer_game_id`; `supabase/migrations/20260801013407_1fce27d9-ddff-4616-b08b-0231bcb2d114.sql` creates the ordinary four-column unique index needed by PostgREST conflict inference. |

## Realtime subscriptions

| Channel owner | Payload |
|---|---|
| `Game.tsx` channel `game-${gameId}` | `games` UPDATE plus an exact-id `games` DELETE ejection listener, `players` all events, and `rounds` all events. Every `games` UPDATE first merges the complete authoritative row image and invalidates an older in-flight snapshot; status-specific side effects cannot suppress co-published dealer cards, results, or cursors. Fetches are debounced 300 ms and serialized/coalesced. A five-second fallback runs after channel loss or failed subscribe catch-up, and stops only after both subscription and one complete snapshot succeed. |
| `Game.tsx` channel `session-history-${gameId}` | INSERTs into `session_player_snapshots`. |
| `Game.tsx` channel `show-cards-${gameId}` | Ephemeral 3-5-7 `show-cards` broadcast, guarded by dealer-game identity. |
| `CribbageMobileGameTable.tsx` | `cribbage-dealer-selection-${gameId}` watches `games`; `cribbage-mobile-${currentRoundId}` watches the current `rounds` row. Both perform exact authoritative catch-up on every `SUBSCRIBED` edge and central recovery receipt. |
| `GinRummyGameTable.tsx` | `gin-rummy-${roundId}` watches the current `rounds` row and refetches caller-specific authority on every `SUBSCRIBED` edge and central recovery receipt. |
| `SessionEndedTablePhase.tsx` | `session-ended-results-${gameId}` watches snapshot INSERTs. |
| `GameLobby.tsx` | Separate all-event `games` and `players` lobby channels, plus bounded refresh on focus/visibility and every five seconds. |
| `ReleaseVersionGate.tsx` | Watches the `system_settings.release_publication` UPDATE, then rechecks the public build manifest. Realtime is lobby-update UX only; the keyed game-route entry boundary independently verifies the manifest before game admission. |
| Peripheral channels | `useGameChat.ts`, `useChipStackEmoticons.ts`, voice witness/report mounts, maintenance/make-it-take-it settings, debug harness cache, canonical layout config, and Geometry Lab stores. |

Yahtzee intentionally relies on the central `Game.tsx` round subscription.
Cribbage and Gin add current-round subscriptions on top of the central owner;
that overlap must be considered before changing fetch/realtime behavior.
`src/lib/realtimeAuthoritativeCatchup.ts` owns successful-application ordering for exact reads,
complete channel-loss classification, and the local recovery receipt emitted
after successful reconnect/resume/fallback snapshots. The central channel is
the only fallback poll owner. `useAuthoritativeIdentity` consumes the same
receipt for its dealer-game-scoped round feed.

## Key migrations and RPCs

| Capability | Latest repository evidence |
|---|---|
| Holm terminal settlement | `holm_settle_hand` with staged-showdown projection in `supabase/migrations/20260810201500_stage_holm_showdown_transfer_projection.sql`; wrapper `src/lib/holmSettleHand.ts`. |
| Holm showdown presentation cadence | `game_defaults` columns in `supabase/migrations/20260811113000_holm_showdown_presentation_timing_defaults.sql` plus the Rabbit Hunt post-reveal continuation dwell in `20260822090000_pvp_showdown_pacing_defaults.sql`; server availability reader in `src/lib/holmGameLogic.ts`; active felt admission in `src/components/MobileGameTable.tsx`; Admin controls in `src/components/GameDefaultsConfig.tsx`. |
| 3-5-7 atomic seam/instant R1 | `advance_357_round` in `supabase/migrations/20260728201549_36222967-7f21-478b-bf1c-c80cb508bcc4.sql`. |
| Cribbage discard | `cribbage_apply_discard` in `supabase/migrations/20260427222814_cc092d72-fc73-4e06-8d21-d9baccc1bebb.sql`. |
| Cribbage next hand | `cribbage_create_next_hand` in `supabase/migrations/20260702221620_32c1e1a0-167e-44b3-925f-bb6bd704c760.sql`. |
| Cribbage terminal settlement | `cribbage_settle_game` in `supabase/migrations/20260802001500_atomic_cribbage_terminal_settlement.sql`; wrapper `src/lib/cribbageSettleGame.ts`. |
| Yahtzee terminal settlement | `yahtzee_settle_game` introduced in `supabase/migrations/20260803234111_atomic_yahtzee_terminal_settlement.sql`, latest in `supabase/migrations/20260804000259_fix_yahtzee_settlement_replay.sql`; wrapper `src/lib/yahtzeeSettleGame.ts`. |
| Horses/SCC action state | `claim_horses_bot_controller`, `horses_set_player_state`, and `horses_advance_turn` in the files named in the game map; autonomous expiry/terminal ownership is `20260811010000_horses_scc_disconnect_safe_settlement.sql`. |
| Generic chip mutation | `decrement_player_chips` in `supabase/migrations/20251212213623_e036d1c1-7eaa-45d8-9496-a35379c38f67.sql`; `increment_player_chips` in `supabase/migrations/20260120005657_d59027a0-1301-4da2-adf5-a85b6dfef87b.sql`. |
| Transactional Add Bot | `allocate_bot_alias_number` and `create_session_bot` in `supabase/migrations/20260801001032_5d3bce26-50f5-4087-bbcb-d6c7d78d1a7e.sql`. |
| Session snapshots/results | `record_session_results` in `supabase/migrations/20260208145329_0a5d4d26-1d1d-4653-8077-2143eec69bfd.sql`; canonical identity migrations `supabase/migrations/20260801011431_c899bfad-30e4-4d26-9201-57755fb9c896.sql` and `supabase/migrations/20260801013407_1fce27d9-ddff-4616-b08b-0231bcb2d114.sql`. |
| Admin fake-money smoke teardown | `admin_blast_fake_money_game` in `supabase/migrations/20260815180000_admin_blast_fake_money_game.sql`; `PlayerOptionsMenu.tsx` exposes it only through the admin/fake-money guard in `Game.tsx`, whose DELETE listener returns connected clients to the lobby. |
| Published build signal | `supabase/migrations/20260815170000_add_release_publication_signal.sql` seeds the single release row; `supabase/functions/publish-release/index.ts` verifies the public manifest then writes it; `.github/workflows/publish-release.yml` invokes that publisher after a `main` deployment is public. Client enforcement is `src/components/ReleaseVersionGate.tsx` and `src/lib/releaseVersion/`. |
| Real-money abandonment reconciliation | Post-game waiting boundary, private finalizer/triggers, and the `reconcile-abandoned-real-money-sessions` pg_cron job latest in `supabase/migrations/20260809173000_postgame_waiting_session_resolution.sql`; rollback proof in `supabase/tests/session_abandonment_reconciliation_proof.sql`. |
| Deadline/lifecycle helpers | `supabase/migrations/20260820180000_canonical_game_timer_ownership.sql` owns exact dealer-selection, configuration, ante, gameplay, pause/resume, and Horses/SCC postgame deadlines. `20260823010000_freeze_hardening.sql` bounds each child owner's lock wait and records private slow/error evidence; `20260823011000_restore_freeze_hardening_canonical_timers.sql` preserves the later canonical-timer runner branch. `src/lib/gameTimerAuthority.ts` exposes authenticated browser intent; the legacy Edge enforcers are not the progression owner. |
| Refresh/rejoin presentation provenance | 3-5-7 exact wave classification is `src/lib/threeFiveSeven/routeEntryMode.ts`, owned by the persistent route baseline in `Game.tsx`; Holm identity/barrier classification is `src/lib/holmPresentationBarrier.ts`. Partial hydration is never captured as a historical baseline. |
| Cutover write lock and fake-history purge | `supabase/migrations/20260802184800_cutover_readiness.sql`; the lock is inert until its `system_settings` flag is enabled, and the controlled import bypass is session-local. |

## Debug harness registry

The canonical registry is
`src/lib/debugHarness/profiles.ts:DEBUG_HARNESS_REGISTRY`; persistence/cache
and hooks are `runtimeCache.ts`, `useDebugHarness.ts`, and
`useGlobalDebugMode.ts`. `runtimeCache.ts:getActiveHarnessCached` is the sole
execution boundary: a configured profile may execute only when the globally
persisted `harnesses_mode` gate is on. `getConfiguredHarnessCached` is
display-only for the Admin surface.

Per-user network simulation is a separate transport concern.
`src/hooks/useNetworkSim.tsx` reads `profiles.network_sim_mode` and
`network_sim_logging`, applies them through `src/lib/networkSim.ts`, and does
not consult the game-rule `harnesses_mode` cache. Shared mode state lives in
`src/lib/networkSimRuntime.ts`. For Cross-Country Chaos,
`src/lib/networkSimChaos.ts` generates the continuous deterministic phase
cycle and `src/lib/networkSimTransport.ts` applies it to the shared Supabase
HTTP fetch and WebSocket transport configured by
`src/integrations/supabase/client.ts`. The profile-control and simulation-event
routes bypass impairment so the local harness remains reversible and its
evidence remains writable. The deterministic response-loss phase delegates an
HTTP operation exactly once and discards its response, exercising ambiguous
commit recovery without permitting a harness retry.

The session dealer-draw tie smoke fixture is a separate one-shot authoritative
input request, not a persistent game profile. Admin arm/cancel/status controls
live in `src/components/GameDefaultsConfig.tsx`; the host-scoped, ten-minute,
atomically consumed database owner is
`supabase/migrations/20260824165309_session_dealer_draw_tie_harness.sql`; its
rollback proof is
`supabase/tests/session_dealer_draw_tie_harness_proof.sql`. It never reads or
mutates `harnesses_mode`.

The separate database-backed 3-5-7 wartime stream is gated by
`src/lib/threeFiveSeven/wartime/capture.ts`: Wartime Debug must be explicitly
enabled, the mounted route must currently own a 3-5-7 game, and scoped events
must match that game id. `Game.tsx` publishes that route context and keeps its
diagnostic timer wrappers stable across ordinary renders.

| Game | Profiles excluding `none` |
|---|---|
| Holm | `force_player_beats_chucky`, `force_chucky_beats_player`, `pause_showdown_freeze` |
| Cribbage | `near_double_skunk`, `max_pegging_fan`, `perpetual_heels` |
| Gin Rummy | `near_gin`, `non_dealer_near_knock` |
| Yahtzee | `near_win`, `reorder_probe` |
| 3-5-7 | `instant_win`, `pause_r1_showdown`, `pause_r2_showdown`, `pause_r3_showdown` |
| Horses | `force_tie` |
| SCC | `force_no_qualify` |

Legacy id `opponent_instant_knock` resolves read-only to
`non_dealer_near_knock`.

## Focused test index

- Anti-regression: all six adapters have `*.test.ts` coverage under
  `src/lib/gameStateSync/`, including the shared Horses/SCC adapter;
  `useGameStateSync.test.tsx`, `authoritativeIdentity.test.ts`, and
  `visualContract.test.tsx` cover shared behavior.
- Canonical shell: lifecycle, routing, slot, seat ring/anchors, tab portal,
  chip transport/endpoints, card/die row layout, and announcement renderer
  tests live under `src/lib/canonicalShell/`.
- Cribbage: focused component and logic tests are listed in the Cribbage map.
- Gin: focused component, game logic, scoring, and harness tests are listed in
  the Gin map.
- 3-5-7: `src/lib/threeFiveSeven/advanceRound.test.ts`,
  `src/lib/threeFiveSeven/showdownPresentation.test.ts`, and
  `src/lib/threeFiveSeven/routeEntryMode.test.ts`.
- Freeze ownership/migrations: `src/lib/freezeHardeningMigration.test.ts`.
- Yahtzee: `src/lib/yahtzeeScoring.test.ts`,
  `src/lib/yahtzeeGameLogic.test.ts`,
  `src/lib/yahtzeeSettleGame.test.ts`, and Yahtzee terminal-scope cases in
  `src/lib/canonicalShell/liveTerminalPresentationHold.test.ts`.
- Lobby: `src/lib/lobbyFetch.test.ts`.
- No focused Holm financial-RPC, Gin terminal, Horses rule/terminal, or SCC
  rule/terminal test exists in this checkout. Cribbage and Yahtzee have
  focused client RPC-boundary tests; direct SQL/deployed behavior remains a
  required proof.
