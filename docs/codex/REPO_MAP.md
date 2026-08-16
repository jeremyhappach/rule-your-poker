# Repository map

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

Package scripts in `package.json` are `dev: vite`, `build: vite build`,
`build:dev: vite build --mode development`, `lint: eslint .`, and
`preview: vite preview`. There is no package `typecheck` script. Repository
policy specifies `bunx tsgo --noEmit`; a production build is `bun run build`.

## Supabase boundary

| Area | Source owner |
|---|---|
| Cribbage gameplay authority | `supabase/migrations/20260816113000_cribbage_authority_cutover.sql`: private hidden state, redacted projection, guarded mutations, dealer/start/discard/pegging/counting/continuation/settlement RPCs, and disconnect recovery. Client intent/state access is in `src/lib/cribbageAuthority.ts`. |

| Area | Source owner |
|---|---|
| Typed browser client | `src/integrations/supabase/client.ts` creates the singleton `supabase` client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with local-storage session persistence and token refresh. |
| Generated schema/RPC types | `src/integrations/supabase/types.ts`. This is generated evidence, not a replacement for migration inspection. |
| Local project/function config | `supabase/config.toml`, owned production project id `xvhmbuppghwmwpwrkzao`; Vercel production at `holm357.com` targets this project. |
| Schema history | `supabase/migrations/` (290 versioned migration files). Later definitions supersede earlier same-named functions. |
| Edge Functions | `supabase/functions/enforce-deadlines`, `enforce-all-deadlines`, `generate-incident-report`, `reset-password`, and `voice-to-text`; shared helpers live in `supabase/functions/_shared/`. |
| Canonical chip transfer projection | `supabase/migrations/20260809170000_canonical_chip_transfer_ledger.sql` journals every player/pot chip mutation and emits immutable game-scoped batches; `20260809210000_stage_chip_transfer_cursors.sql` stages endpoint cursors with the mutation. `20260810193000_split_normal_357_leg_sweep_transfer_projection.sql` preserves one normal final-leg 3-5-7 settlement while publishing its reserve-return and pot-award batches in order. `src/lib/gameplayChipTransfers.ts` is the browser writer, while `enforce-all-deadlines` uses the same RPC for watchdog transfers. `ChipPresentationLedger` performs an exact one-shot batch lookup when an endpoint cursor proves its INSERT event was missed. `ChipTransportProvider` and `CanonicalSeatCluster` keep the ledger-owned source seat visible throughout an outbound flight. |
| Post-game participation and abandonment owner | `supabase/migrations/20260809190000_fast_postgame_presence_confirmation.sql` and `20260809200000_extend_fake_money_postgame_presence.sql` own result-backed post-game watches, three consecutive five-second missed windows, absent-player sit-out, and real/fake terminal disposition when presence is ambiguous. `20260815163818_atomic_explicit_postgame_stand_up.sql` separately owns authenticated explicit Stand Up plus its immediate zero/one/eligible cohort decision in one transaction. Initial waiting and live dealer games remain outside these owners; the legacy `enforce-all-deadlines` Edge Function remains separate. |

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
| `src/pages/Game.tsx` | Central route/lifecycle orchestrator: cold public hydration, auth admission, game/round/player/card fetches, central realtime, identity resets, pregame, dealer selection/config, ante completion, game startup, game-over continuation, and local Session Ended admission. |
| `src/components/PreGameLobby.tsx`, `src/components/WaitingForPlayersTable.tsx` | Pregame and waiting-room presentation inside the persistent table shell. |
| `src/hooks/useWaitingRoomActions.ts` | Invite/rejoin/start actions and queued Add Bot calls through `create_session_bot`; minimum two players and maximum seven occupied seats are enforced here/the waiting UI. |
| `src/components/DealerGameSetup.tsx` | Seven-game selector, per-game configuration, `dealer_games` creation, `games.current_game_uuid` assignment, dealer-game boundary cleanup, and transition to ante/dealer-selection phases. |
| `src/hooks/useHighCardDealerSelection.ts` | Initial/session dealer-selection behavior. |
| `src/pages/Game.tsx:handleGameOverComplete` | Shared post-presentation continuation owner: consumes pending session end, evaluates participant state, selects/rotates the next dealer, and enters dealer/game selection. |
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
| Chip transport | `ChipTransportProvider.tsx`, `ChipTransportRuntime.tsx`, `ChipPresentationLedger.ts`, `ChipPresentationDeltaRuntime.tsx`, `holmTransferPresentationStage.ts`, and `chipEndpoints.ts`. The provider owns financial departure/arrival/reconcile display and its signed delta-effect stream. Concurrent player-to-pot flights compose as one ledger-owned pot-arrival cohort, while the delta runtime derives opponent-label origin from the canonical felt-facing chip-disc rim. Holm classifies immutable stage topology solely to admit and advance its non-financial phase. |
| Card transport/deal | `cardTransport/CardTransportProvider.tsx`, `CardTransportRuntime.tsx`, `DealRuntime.tsx`, and `cardEndpoints.ts`. |
| Settlement presentation | `settlement/SettlementProvider.tsx`, `SettlementRuntime.tsx`, and `settlement/types.ts`. These are presentation owners, not financial authority. |
| Active hand | Shared `src/components/activeHand/ActiveHandFan.tsx` and `MeasuredActiveHandFan.tsx`; Holm also retains a separate local-hand route in `MobileGameTable.tsx`. |

## Authoritative identity and anti-regression

`src/lib/gameStateSync/useGameStateSync.ts:useGameStateSync` accepts only
forward authoritative snapshots and semantically identical equal-progress
snapshots. `src/lib/gameStateSync/authoritativeIdentity.ts:useAuthoritativeIdentity`
tracks dealer-game, hand, and round identity; `Game.tsx` and game components
reset transient/presentation state when those identities change.

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
  authoritative exposed-cut rejoin; its focused test runs before `npm run
  build`.
- State/actions: `private.cribbage_round_states` owns hidden and mutable truth;
  `rounds.cribbage_state` is its redacted realtime projection.
  `src/lib/cribbageAuthority.ts` fetches caller-specific state and submits
  pegging intent; `CribbageMobileGameTable.tsx` owns presentation only.
- Lifecycle: `src/lib/cribbageRoundLogic.ts:startCribbageRound` submits the
  replay-safe initial-hand RPC. Dealer selection, first deal, discard/cut,
  pegging, counting, successor release, and disconnect recovery are owned by
  `20260816113000_cribbage_authority_cutover.sql`.
  `public.cribbage_finalize_counting` / `public.cribbage_release_counting`
  retain the accepted counting presentation lease.
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
- State/actions: `rounds.yahtzee_state`;
  `yahtzeeGameLogic.ts:rollYahtzeeDice`, `toggleYahtzeeHold`,
  `scoreYahtzeeCategory`, and `advanceYahtzeeTurn`; the mounted component
  persists state directly.
- Lifecycle: `yahtzeeRoundLogic.ts:startYahtzeeRound`; terminal disposition is
  owned by the settlement RPC below.
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
  retries settlement and owns presentation only; `Game.tsx` plus the generic
  live-terminal scope helper retain a connected LAST HAND table.
- Focused tests: `yahtzeeScoring.test.ts`, `yahtzeeGameLogic.test.ts`,
  `yahtzeeProgress.test.ts`, `yahtzeeSettleGame.test.ts`, the Yahtzee cases in
  `liveTerminalPresentationHold.test.ts`, and shared die-row/shell tests.

### 3-5-7

- Entry/presentation: `Game.tsx` -> `MobileGameTable.tsx`;
  `ThreeFiveSevenAnchoredSlot.tsx`, `ThreeFiveSevenDealOrchestrator.tsx`,
  `ThreeFiveSevenProofCardsAnimation.tsx`, and
  `ThreeFiveSevenTerminalController.tsx`.
- State/actions: `src/lib/gameLogic.ts:startRound`, `makeDecision`,
  `autoFoldUndecided`, `endRound`, and `proceedToNextRound`;
  `src/lib/cardUtils.ts:evaluateHand`; seam helpers in
  `src/lib/threeFiveSeven/advanceRound.ts`.
- Bots: `botPlayer.ts:makeBotDecisions` with
  `botHandStrength.ts:getBotFoldProbability`; scheduling is in `Game.tsx`.
- Settlement/terminal: later-round/new-hand seams and a normal R1 instant sweep
  are owned by `public.advance_357_round`, latest in
  `supabase/migrations/20260810210000_separate_357_rollover_amount.sql`. Its
  public signature accepts transition identity only and derives the persisted
  3-5-7 rollover at the R3 -> next-hand R1 boundary. Normal
  leg-completion settlement remains the private client
  `gameLogic.ts:handleGameOver`; legacy instant helpers remain under
  `src/lib/threeFiveSeven/`.
- Focused tests: `threeFiveSeven/advanceRound.test.ts`,
  `threeFiveSevenProgress.test.ts`,
  `supabase/tests/three_five_seven_rollover_proof.sql`, and shared card
  transport/slot tests.

### Horses

- Entry/presentation: `Game.tsx` -> `MobileGameTable.tsx` ->
  `useHorsesMobileController.ts`; `DiceAnchoredSlot.tsx`,
  `HorsesMobileCardsTab.tsx`, `HorsesDie.tsx`,
  `HorsesHandResultDisplay.tsx`, and `HorsesPlayerArea.tsx`.
- State/actions: `rounds.horses_state`;
  `horsesGameLogic.ts:rollDice`, `toggleHold`, `lockInHand`,
  `evaluateHand`, and `determineWinners`; mounted action/timeout/recovery
  owner is `useHorsesMobileController`.
- Lifecycle: `horsesRoundLogic.ts:startHorsesRound` and
  `endHorsesRound`.
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
  turns and all-absent tie rollovers; mounted code retains presentation and
  connected tie rollover only.

### Ship Captain Crew

- Entry/presentation: the Horses path above with
  `gameType='ship-captain-crew'`; SCC artifacts are `SCCDie.tsx` and
  `SCCHandResultDisplay.tsx`.
- State/actions: SCC also stores state in `rounds.horses_state`;
  `sccGameLogic.ts:rollSCCDice`, `lockInSCCHand`, `evaluateSCCHand`, and
  `determineSCCWinners`; `useHorsesMobileController` is the mounted owner.
- Lifecycle/bots: `sccRoundLogic.ts:startSCCRound` and `endSCCRound`;
  `sccBotLogic.ts:getSCCBotDecision` and `shouldSCCBotStopRolling`.
- RPC/settlement: reuses the Horses action RPCs and the shared
  `public.horses_settle_game` terminal owner above. Its server evaluator keeps
  6-5-4 qualification/cargo rules distinct from Horses wild scoring.

## Snapshot and result pipeline

Canonical snapshot identity is
`(game_id, dealer_game_id, hand_number, player_id)`.

| Role | Source |
|---|---|
| Shared current-roster writer | `src/lib/gameLogic.ts:snapshotPlayerChips`. |
| Departing-player writer | `src/lib/gameLogic.ts:snapshotDepartingPlayer`. |
| Holm transactional writer | `public.holm_settle_hand`, latest projection change in `supabase/migrations/20260810201500_stage_holm_showdown_transfer_projection.sql`. |
| Game-specific client writers | Gin in its round logic and normal 3-5-7 in `gameLogic.ts`; Horses/SCC client code submits terminal identity only through `src/lib/horsesSettleGame.ts`. |
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
| `Game.tsx` channel `game-${gameId}` | `games` UPDATE plus an exact-id `games` DELETE ejection listener, `players` all events, and `rounds` all events. Fetches are debounced 300 ms. A five-second fallback poll starts only after channel failure unless safety polls are disabled. |
| `Game.tsx` channel `session-history-${gameId}` | INSERTs into `session_player_snapshots`. |
| `Game.tsx` channel `show-cards-${gameId}` | Ephemeral 3-5-7 `show-cards` broadcast, guarded by dealer-game identity. |
| `CribbageMobileGameTable.tsx` | `cribbage-dealer-selection-${gameId}` watches `games`; `cribbage-mobile-${currentRoundId}` watches the current `rounds` row. |
| `GinRummyGameTable.tsx` | `gin-rummy-${roundId}` watches the current `rounds` row. |
| `SessionEndedTablePhase.tsx` | `session-ended-results-${gameId}` watches snapshot INSERTs. |
| `GameLobby.tsx` | Separate all-event `games` and `players` lobby channels, plus bounded refresh on focus/visibility and every five seconds. |
| `ReleaseVersionGate.tsx` | Watches the `system_settings.release_publication` UPDATE, then rechecks the public build manifest. Realtime is lobby-update UX only; the keyed game-route entry boundary independently verifies the manifest before game admission. |
| Peripheral channels | `useGameChat.ts`, `useChipStackEmoticons.ts`, voice witness/report mounts, maintenance/make-it-take-it settings, debug harness cache, canonical layout config, and Geometry Lab stores. |

Yahtzee intentionally relies on the central `Game.tsx` round subscription.
Cribbage and Gin add current-round subscriptions on top of the central owner;
that overlap must be considered before changing fetch/realtime behavior.

## Key migrations and RPCs

| Capability | Latest repository evidence |
|---|---|
| Holm terminal settlement | `holm_settle_hand` with staged-showdown projection in `supabase/migrations/20260810201500_stage_holm_showdown_transfer_projection.sql`; wrapper `src/lib/holmSettleHand.ts`. |
| Holm showdown presentation cadence | `game_defaults` columns in `supabase/migrations/20260811113000_holm_showdown_presentation_timing_defaults.sql`; server availability reader in `src/lib/holmGameLogic.ts`; active felt admission in `src/components/MobileGameTable.tsx`; Admin controls in `src/components/GameDefaultsConfig.tsx`. |
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
| Deadline/lifecycle helpers | `handle_config_deadline_timeout` latest in `supabase/migrations/20260809173000_postgame_waiting_session_resolution.sql`; Edge Function enforcement under `supabase/functions/enforce-*/`. |
| Cutover write lock and fake-history purge | `supabase/migrations/20260802184800_cutover_readiness.sql`; the lock is inert until its `system_settings` flag is enabled, and the controlled import bypass is session-local. |

## Debug harness registry

The canonical registry is
`src/lib/debugHarness/profiles.ts:DEBUG_HARNESS_REGISTRY`; persistence/cache
and hooks are `runtimeCache.ts`, `useDebugHarness.ts`, and
`useGlobalDebugMode.ts`. `runtimeCache.ts:getActiveHarnessCached` is the sole
execution boundary: a configured profile may execute only when the globally
persisted `harnesses_mode` gate is on. `getConfiguredHarnessCached` is
display-only for the Admin surface.

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
- 3-5-7: `src/lib/threeFiveSeven/advanceRound.test.ts`.
- Yahtzee: `src/lib/yahtzeeScoring.test.ts`,
  `src/lib/yahtzeeGameLogic.test.ts`,
  `src/lib/yahtzeeSettleGame.test.ts`, and Yahtzee terminal-scope cases in
  `src/lib/canonicalShell/liveTerminalPresentationHold.test.ts`.
- Lobby: `src/lib/lobbyFetch.test.ts`.
- No focused Holm financial-RPC, Gin terminal, Horses rule/terminal, or SCC
  rule/terminal test exists in this checkout. Cribbage and Yahtzee have
  focused client RPC-boundary tests; direct SQL/deployed behavior remains a
  required proof.
