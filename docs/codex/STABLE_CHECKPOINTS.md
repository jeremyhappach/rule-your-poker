# Stable checkpoints — do not reopen without a new repro

## Platform

- 3-5-7 exact-wave baseline and shared timer/action readiness passed published
  production fake-money smoke on 2026-09-01 at commit
  `c5ee6d0bf7451ae797da30a260e023ce9e0736e9`. Both clients completed the
  deterministic R1/R2/R3 progression on one accepted round identity per wave
  and finished Round 3 with seven visible cards, one timer, enabled Drop/Stay
  controls, and zero stale artifacts. The continuous observer recorded zero
  violations and no 6000 ms peer breach (p95/max 3412 ms); guarded cleanup
  deleted the exact session and Vercel reported no runtime errors. Preserve the
  route-owned identity-complete readiness token and the authoritative
  prior-wave baseline plus exact-current-wave receipt rule. This is focused
  deal-transition/readiness coverage, not full 3-5-7 gameplay or deadlines.
- Gin's exact normal-knock/repeated-layoff, Gin, undercut/hand-two, and
  stock-two-void rows passed concurrent published production fake-money smoke
  on 2026-08-31 at commit
  `8f4617725dab3eb37f14f3eb9b404bd0d8d3a4d8`. The normal-knock row confirmed
  that each successful felt-target layoff clears both lifted selection owners,
  allowing the shifted third card to expose its legal meld target and complete
  settlement. All four rows ran with continuous observation and a 6000 ms
  peer-progress ceiling; each exact authoritative outcome passed, every fake
  session was deleted, and Vercel reported no runtime errors in the campaign
  window. Preserve the paired layoff/card selection reset and the fixture's
  fake-money, exact-game, one-shot fail-closed boundaries. This is targeted Gin
  outcome and repeated-layoff coverage, not full Gin coverage; no real-money
  session was created or touched.
- Cribbage's deterministic pegging 15/31/run/Go/reset and counting
  fifteens/flush/nobs rows passed concurrent published production fake-money
  smoke on 2026-08-31 at commit
  `9b72339db4c853423d48671bb8b2eda4bfa3988c`. Both exact fixtures drove the
  intended `5,10,6,10,9,8,7,J` order through the visible UI, entered counting,
  reached terminal hand 4, and verified fixture cancellation plus session
  deletion. All 85 correlated actions completed with zero observer violations
  and zero unexpected 6000 ms peer-progress breaches; peer maxima were 5939
  and 5779 ms. Preserve visible-card selection mapped back to authoritative
  rank progression; display order must not stand in for source order in an
  exact branch oracle. This is targeted branch coverage, not full Cribbage
  coverage. One independent `advance-due-game-state-1s` cron startup timeout
  occurred in the window without affecting either observed game and remains
  separate platform-health evidence for RCA.
- Browser presence heartbeat admission liveness passed the targeted published
  production checkpoint on 2026-08-31 at commit
  `859de6047f8d254918ee95a93104ea312ab3f456`. Under three concurrent isolated
  fake-money pairs, all eight browsers retained at most one in-flight
  `voice_presence_heartbeats` request even when one write lasted 15.1 seconds;
  later observations coalesced and drained the newest status. Four completed
  Cribbage games reached terminal with zero observer violations, zero
  non-exempt 6000 ms peer-budget breaches, verified fixture cancellation, and
  verified session deletion. Supabase recorded zero job-startup timeouts in
  the run window. Preserve the single per-tab request owner, newest-status
  coalescing, existing authenticated payload/cadence, and best-effort failure
  boundary. This accepts heartbeat/admission liveness only: two deterministic
  rule rows still failed a post-terminal card-order oracle and do not receive
  full branch-coverage credit.
- Cribbage exact-game rule fixtures and their latency RCA passed published
  production fake-money smoke on 2026-08-30 at commit
  `e8bf659772556bc3914895ba4bd0caa227bcb220`. Near double-skunk,
  nonterminal His Heels, and max pegging/counting ran concurrently, reached
  terminal, and verified fixture cancellation plus guarded session deletion.
  Across 44 correlated actions they recorded zero observer violations and zero
  unexpected 6000 ms peer-budget breaches; peer maxima were 5290, 6079, and
  5128 ms respectively, with the sole over-budget sample explicitly belonging
  to the deliberate session-start offline proof. Preserve fake-money/two-human/
  admin-participant fixture scope, private marker redaction, exact one-shot
  consumption, ordinary successor hands, default-off Go-race tracing,
  post-authority history writes, and explicit expected-delay ownership. This is
  targeted rule-fixture and latency coverage, not full Cribbage branch coverage.
- Gin Rummy's discard-pile rejoin lock passed published production fake-money
  smoke on 2026-08-30 at commit
  `ad4ab01e078b16c2a5b671fc6575219048aafcf9`. After a route reload in the
  exact discard phase, the card just taken from the discard pile remained the
  one disabled card; ordinary play continued to terminal hand 3. All 119
  actions had observer receipts, with zero presentation violations and no
  unmarked 6000 ms peer-budget breach (peer p95 3007 ms), and cleanup was
  verified. Preserve the authority-derived `drawSource` plus exact-player
  `lastAction` policy at selection, disabled-control, and submit boundaries;
  do not restore a local presentation latch as the rule owner. Stock draws and
  layoff remain unaffected. This is targeted rule/rejoin coverage, not full Gin
  branch coverage.
- Gin Rummy live-action latency and applicable deadline seams passed published
  production fake-money coverage on 2026-08-30 at commit
  `f11c8ec552d949d3c66bed00b0dd75951046c6a6`. The changed-parameter
  transition settled two 50-point games with 390 correlated actions, zero
  observer violations, and no unmarked 6000 ms peer breach (peer p95 2726 ms).
  Dealer-setup and ante timeout/rejoin then passed concurrently with zero
  violations, zero page crashes, no peer-budget breach, and verified cleanup.
  Preserve Realtime-owned live existence/pause state, the metadata-only Gin
  receipt short circuit, direct immutable first-draw intent, and explicit
  expected-delay evidence. Do not restore recurring games-table polling or a
  serialized first-draw state read. Human Gin gameplay remains intentionally
  untimed; this checkpoint is not complete rule-branch coverage.
- Gin Rummy Run It Back exact-config ownership passed published production
  fake-money smoke on 2026-08-30 at commit
  `9b7b70c13726e836d63afcac83930bb47f9bdc86`. Source and successor preserved
  the identical 50-point configuration through terminal settlement; all 486
  actions had complete RPC/actor/peer receipts, with zero observer violations
  and no 6000 ms breach. Preserve the immutable `dealer_games.config` capture,
  exact five-field Run Back commit, and fail-closed missing-config behavior;
  setup-form defaults must never substitute for completed Gin configuration.
- Cribbage request-owned pegging liveness passed published production smoke on
  2026-08-29 at commit `8cc8275fe5646a26ed4183e222702923067ed0d6`.
  Two concurrent isolated fake-money clients at 393x662 and 342x576 each
  reached terminal hand 5 through repeated pegging, counting, and successor
  transitions with zero observer violations and no 6000 ms peer-progress
  breach. Preserve the direct immutable event-sequence action, RPC-lifecycle
  writer gate, replay-safe bounded retry, and single-flight counting cursor;
  presentation animation must never reopen an unresolved writer.
- Waiting-table Start Game passed published two-human production smoke on
  2026-08-26 at commit `a88af23c953a3156adaf071056e9d2d3c9ee9e12`.
  `public.begin_session_dealer_selection` atomically owns the eligible roster,
  two-player normalization, lifecycle reset, and `waiting → dealer_selection`
  transition; the canonical timer trigger owns the dealer draw. Preserve the
  authenticated RPC boundary and replay outcomes rather than restoring client
  `players`/`games` writes or anonymous `games` privileges.
- The 3-5-7 Run Back cross-country readiness recovery passed against immutable
  production commit `544372002b42df143a6e56956c755cb2b79a9b36` on 2026-08-26.
  Two live fake-money clients survived the targeted offline burst and both
  exposed the current-round decision surface after the successor dealer game
  began. Preserve the exact hand/wave/round identity match, live
  `in_progress`/`betting` status, expected self-card threshold, and exclusion
  of historical entry; a local transport receipt may enhance presentation but
  must not indefinitely suppress an already-authoritative legal action.
- The full two-human terminal-settlement matrix passed production on
  2026-08-25 against published runtime commit
  `4023c6c1ac891f4402e2ace59b132a3776cb0c92`: Holm, 3-5-7, Cribbage, Gin
  Rummy, Horses, Ship Captain Crew, and Yahtzee each reached one exact terminal
  settlement after cross-country disorder. Every scenario proved a winner, two
  distinct human terminal snapshots, connected-client Session Ended, ended
  database state, fresh-mount lobby admission, and guarded cleanup. Preserve
  the immediate browser-online fanout to exact game-specific loaders, their
  identity/progress admission guards, and the database-owned 3-5-7 session-end
  request. Do not reduce this checkpoint to startup or first-action evidence.
- The automated two-human browser liveness matrix passed production on
  2026-08-25 against published frontend commit
  `716ce39a93e8c38972981b1ab81f555dd2c6b1e1`: Holm, 3-5-7, Cribbage, Gin
  Rummy, Horses, Ship Captain Crew, Yahtzee, and the isolated-context runner
  passed 8/8 in 4.0 minutes. Each game survived one client's long-haul
  HTTP/Realtime disorder, an offline session dealer draw, loss of the exact
  non-dealer ante RPC response after commit, a second offline burst, and a full
  route remount. Both clients converged on one authoritative session/dealer-
  game identity, one shell/felt, and a visible legal-action surface. Preserve
  the fake-money-only, two-distinct-human, no-bot/no-global-harness boundary and
  mandatory guarded Blast cleanup.
- The multi-wave session dealer draw passed published two-client production
  smoke on 2026-08-24 at commit
  `f97aa9caec063ce8e4a88f30e3084baf124dd930`, using the host-scoped one-shot
  tie fixture in `Aug 24 - Dansby Swanson`. Both clients presented the tied
  first wave and K/Q tiebreaker cleanly before Dealer Setup; the setup modal
  won shell stacking, and the fixture atomically consumed itself. Preserve the
  `preparedAt` receipt identity, exact painted-card acknowledgement, local
  setup admission gate, canonical modal z-band, and database-owned lifecycle.
- Player-v-player showdown financial pacing passed published two-human
  production smoke on 2026-08-22 at commit
  `8d873a5b6971254da1ad9fbe5da2253d35d056a9`. In 3-5-7, Secret Reveal on
  reveals permitted opponent cards and holds the configured reading dwell
  before releasing the player-to-player transfer and announcement together;
  Secret Reveal off remains immediate and exposes no cards. In Holm Rabbit
  Hunt, Pussy Tax transfer and narration remain concurrent with the reveals,
  while continuation holds for the configured dwell after the final card
  lands. Preserve these exact presentation gates without moving settlement or
  continuation authority out of PostgreSQL.
- All seven games passed a clean published production smoke on 2026-08-21 at
  commit `8dd5e5b2d16e6304c89280e978c070ddd009b6d0`, using two human
  clients with Cross-Country Chaos enabled. This accepts the current end-to-end
  database authority, cross-client synchronization, presentation continuity,
  and game-rule behavior as a stable checkpoint. Do not reopen any accepted
  behavior without a new production repro.
- Around 2026-07-03 all seven games were smoke-tested with general geometry/polish considered good.
- Canonical table/felt/shell continuity must not be replaced by per-game table swaps.
- Chat stability and lobby performance had accepted fixes.
- Horses, SCC, Yahtzee, Holm, and 3-5-7 had major sync cutovers validated; Cribbage and Gin functioned but retained legacy-ish areas.
- The canonical chip-transfer ledger passed production smoke on 2026-08-09 at
  commit `79cfdcc75efd31c479f69cf7c72aa6a2398fba20`: it held a Holm
  solo-vs-Chucky pot payout until community and Chucky reveal presentation had
  completed, then transferred exactly once without a balance bounce. The
  missing destination-chip bounce is explicitly deferred presentation debt.
- The 3-5-7 normal final-leg payout ordering passed production smoke at commit
  `cd88b3d1d5965593236c68324743e3f32d6a5eee`: final leg, leg sweep, then pot
  flight, winner announcement, and confetti. Destination bounce remains
  deferred; unsolicited winner-card exposure is a separate queued consent bug
  (Backlog item 3H).
- The 3-5-7 winner-only final-leg handoff passed published production smoke on
  2026-08-19 at commit
  `045cd01f2d3e2b11cbf44946ac43afb67559a4f3`. When no opponent owns a leg,
  the terminal sequence skips the zero-transfer 3.5-second legs-to-player hold
  and proceeds through the existing sweep-credit/pot handoff. Preserve the
  timed sweep when one or more opponent legs actually move.
- The 3-5-7 atomic setup and exact first/new-hand deal-admission P0 passed
  published two-client smoke on 2026-08-17 at commit `8f6890caa`. Preserve the
  initiating-client committed RPC result, immediate private-card refetch, and
  exact durable transfer cursor; do not make Realtime the bootstrap or deal-
  admission trigger again.
- The 3-5-7 exact charged-Round-1 opening-transfer claim passed published
  two-client rollover smoke on 2026-08-19 at commit
  `d025d95825a88e87b01e8404a01d218e8ca91367`. Preserve the round-owned
  immutable ante cursor returned to the initiating client; do not derive
  opening presentation from the mutable game cursor or a peer Realtime event.
- The 3-5-7 final-leg baseline and Round 1 deal-presentation gate passed
  published two-client smoke on 2026-08-17 at commit `845f5865b`. Preserve the
  immutable `targetLegs - 1` terminal baseline and exact-hand DealRuntime
  readiness token. A later post-sweep leg-stack repaint before the next dealer
  game is separately queued and does not reopen these accepted behaviors.
- The `+L` leg cue scope passed production smoke on 2026-08-10 at commit
  `0e6498d83c1e65faf3872a21dd344223dfc51c22`: it remains visible for real
  3-5-7 leg wins and cannot survive into Holm or another shared-table game.
- Opening ante presentation passed production smoke on 2026-08-11 at commit
  `0bc5718ba8087df4ce19217f111b423bceba7ecd`: card transport stays closed
  until the canonical ledger's aggregate ante-to-pot arrival boundary. Preserve
  that transport event as the presentation owner; do not restore a timer-based
  card-deal release.
- The stale published-build gate passed production smoke on 2026-08-16 at
  commit `02233d8913e7629f8847e29ad5931d95b1e1b18b`. A stale lobby may show
  the release modal when its Realtime signal arrives, but a new game route
  always performs its own no-cache public-manifest check before `Game` mounts.
  Preserve that fail-closed entry boundary and the rule that an already-admitted
  live table is not interrupted by a later publication.

## Cribbage

- The Cribbage server-authority sweep passed published two-client production
  smoke on 2026-08-16 at commit
  `a73855939c2737f685e0cefc9b5851473bfbe54f`. Both clients completed dealer
  startup, a partial-discard refresh retained the committed crib cardbacks, the
  winner remained nonterminal until the visible scoring combo crossed the
  target, settlement committed exactly once, and the session advanced into the
  next dealer-game setup. Preserve the private hidden-state owner, terminal
  counting lease, and `public.cribbage_advance_postgame` exact-settlement claim;
  do not restore browser-authored dealer-game resets.
- Cribbage count rejoin passed production smoke on 2026-08-13 at commit
  `938d89437d888323ab63fc5be254d917f3d5101c`: a refresh, reconnect, or
  connection change during the visible count resumes at the durable monotonic
  cursor (or the database start-anchor fallback before the first cursor write)
  and remains in presentation through the authoritative release. Preserve the
  RPC-only cursor write; do not restore browser full-state replacements.
- Cribbage counting-announcement rejoin passed production smoke on 2026-08-13
  at commit `2914488bea66377bd3b5606ca27bebc538ba18c1`: a refresh or
  reconnect during a highlighted combo immediately presents that matching
  combo, never a stale final-pegging or inferred next-hand announcement.
  Preserve counting-cursor rail ownership and the no-authoritative-snapshot
  bootstrap silence.
- Atomic Cribbage settlement and connected-client terminal presentation are an
  accepted production checkpoint as of 2026-08-03. The disconnect/LAST HAND
  path settles immediately and exactly once in the database while a remaining
  connected client retains the table, cards, cut reveal, win presentation, and
  transient Session Ended flow. A genuinely fresh mount of an already-ended
  session still goes directly to the lobby.
- Preserve `public.cribbage_settle_game` as the replay-safe owner of result,
  payout, post-payout snapshots, terminal disposition, and real-money session
  ledger rows. Presentation may retry settlement and hold the mounted shell,
  but may not delay or own financial authority.
- Published follow-up smoke for commit
  `f9c7b1ebba91287049916e4caa09d281ace3df5a` passed the terminal card-
  continuity correction. Do not restore the stale-complete bootstrap guard for
  a `complete` Cribbage state with an authoritative winner.
- Table/HUD remains through celebration.
- His Heels reveal/announcement sequencing passed production smoke.
- Perpetual Heels harness is gated and visibly identified.
- Cribbage scoring announcement timing was reported stable.

## Yahtzee

- The remounted-actor deadline admission seam passed published two-client
  production fake-money smoke on 2026-09-01 at commit
  `effdf6c400535891eb39e645a53669bae067d3f0`. Preserve the shared fail-closed
  manual-turn predicate across timer publication, Roll/Hold/Score controls,
  authoritative action-surface marking, and all four manual mutation handlers.
  Once the server-owned deadline is no longer future, the client must expose an
  inert timeout-recovery status until database-owned fake-money Auto-roll or
  real-money pause arrives; it must not create a client progression owner. The
  continuous observer recorded zero violations and no 6000 ms peer breach
  (p95/max 3079 ms), and guarded plus independent cleanup verification found no
  retained game. This is focused deadline/remount admission coverage, not full
  Yahtzee gameplay or lifecycle coverage.
- The scoped Yahtzee timeout, timer, and pause/resume matrix passed published
  two-client production smoke on 2026-08-28 at commit
  `b3051358abebea3cc7681a27074c0b499e2617bd`. Preserve fake-money-only
  whole-turn auto-play, `sit_out_next_hand`, immediate paced peer-visible
  rolls, the bot indicator, and checkbox rejoin. Preserve real-money expiry as
  pause-only with no bot/sit-out inheritance or action, the pause announcement,
  inert controls, authenticated host resume, and a fresh configured timer.
  Preserve the single proportional decrementing opponent arc outside the
  canonical 40px chip stack. This checkpoint does not claim broader Yahtzee
  game or lifecycle coverage.
- Yahtzee score presentation and rail handoff passed published two-client
  production smoke on 2026-08-17 at commit
  `987f9a31be249bae3d2c26ddeaa6dfa13840e9a3`. Preserve the scorer-bound,
  round/action-sequence keyed presentation: a cached score may remain only
  until a newer authoritative action is observed, then its card, dice, and
  exact rail event must retire before that newer action paints. The roller's
  canonical rail status lasts across the whole turn, and score narration holds
  only for the matching score presentation interval; do not restore helper
  lines that displace the opponent scorecard or allow score text to truncate.
- Atomic Yahtzee settlement and connected-client terminal presentation passed
  the published two-human terminal-disconnect smoke on 2026-08-03. Preserve
  `public.yahtzee_settle_game` as the replay-safe owner of result, fixed-stake
  payout, snapshots, terminal disposition, and real-money ledger output; the
  client may retry settlement and retain presentation, but may not own those
  writes.
- The winner chip did not bounce during the accepted smoke's celebration. This
  is a queued presentation-only defect; do not reopen the accepted settlement
  or terminal-hold behavior to correct it.

## Holm

- Holm Chucky canonical flip presentation passed production smoke on
  2026-08-21 at commit `fcce653ecd8906e967eb78a58e40daf7338c5f63`:
  every Chucky card retained the configured reveal cadence, flipped visibly in
  its existing canonical slot, and completed the final flip before result and
  transfer presentation. Preserve the configured scheduler as cadence owner,
  the measured `faceFillPx` geometry, and the exact-hand final-flip completion
  gate; rejoin/historical mounts must remain direct and replay-free.
- Holm Chucky card-face sizing passed the reported Chrome desktop
  mobile-emulator smoke on 2026-08-16 at commit
  `9509c16bfb9fdf43c2e2e469fa09e57fc9cffdb0`: rank and suit art derives from
  the measured canonical Chucky slot, so it fits the existing card boxes
  without overlap or crop. Preserve the slot-bound `faceFillPx` owner; do not
  reintroduce a device-size fallback or alter canonical stage geometry.
- Holm dealer-game teardown card retirement passed production smoke on
  2026-08-16 at commit `8cd3cc884e88393a548c99edae8a75139a42c10b`:
  clearing `games.current_game_uuid` retires the old community, player, and
  Chucky card surfaces in the same render; no four-card remount occurs before
  next-game setup. Preserve the `currentRoundNotReadyForPresentation` ownership
  gate at the Holm card-surface root.
- The authoritative Rabbit Hunt all-fold reveal passed production smoke on
  2026-08-11 at commit `22d4aa8c258fbac461d3ce92966d4924b9955a62`:
  the both-player all-fold path showed the Rabbit Hunt marker and sequentially
  revealed community cards three and four while pussy-tax presentation began.
  Preserve the database settlement owner for the four-card reveal; do not
  restore the removed client-side all-fold reveal or gate presentation on
  mutable decision or solo-showdown latches. The deadline fallback must retain
  parity with normal settlement.
- Mobile solo-vs-Chucky showdown presentation passed smoke on 2026-08-10 at
  commit `abeeb3e06e46d9d1088467372ab808ac07fcf462`: the pot is legible in
  the canonical announcement rail while tabled cards remain unobstructed, the
  result keeps the pot context, and the established transfer still completes.
- `holm_settle_hand` owns known terminal branches.
- Chucky processing eligibility correction was accepted.
- Ordinary and terminal presentation holds were stabilized.
- Duplicate ordinary pot/confetti was fixed with a stable consumed key.
- Both-stay presentation passed smoke.
- Session Ended removes player/community/Chucky card rows.
- Add Bot waiting-seat and alias behavior passed the later bot-heavy smoke.
- Bot scheduler fixes require regression attention because multiple distinct lost-edge defects were found.
- Owned-preview deadline/progression smoke passed on 2026-08-03 at commit
  `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220` in Holm game
  `25662485-03b6-434b-85f0-f96e983dfe7e`: the timer stayed hidden until the
  deal settled, expiry reached the atomically guarded resolver, the all-fold
  hand progressed, later auto-folds and rejoin worked, and the game completed.
  Preserve the event-driven resolver and no-polling boundary. The two observed
  timer animation/flicker defects are explicitly non-blocking backlog items,
  not failures of authoritative progression.
- Atomic Holm initial-hand startup passed fresh two-client production smoke on
  2026-08-05: one opening deal was shown and refresh retained the same
  authoritative hand. Preserve the database-owned H1/R1 identity and do not
  restore browser-side `max(hand_number) + 1` recovery.
- Holm deadline-epoch timer presentation passed production smoke on 2026-08-06
  at commit `d7149e0d4ab3a3409ee6fbbc3aa15cf7f1c810e2`: after the deal-settled gate,
  the first visible frame was full and the timer only descended. Preserve the
  atomic remaining/total/deadline snapshot and pre-paint transition reset.
- Holm DG1H1 live-entry provenance passed fresh two-client production smoke on
  2026-08-15 at commit `372dd2cf7fb4ef7bce948d812c38048cad100ec4`:
  the opening deal transported normally, the first active player's timer
  appeared through the existing deal-settled gate, and play continued without
  a freeze. Preserve the pre-hand lifecycle provenance classification. Do not
  fabricate `DealRuntime` settlement/release state for a skipped historical
  entry or bypass canonical card transport.
- Holm DG1H1 Buck presentation and the persistent paused-session announcement
  passed production smoke on 2026-08-15 at commit
  `6f0951b8ea652633212dbec2a162c5fe86ced8fd` (tag
  `holm-dg1h1-buck-pause-2026-08-15`). Preserve the exact server-authored H1
  Buck identity and recipient-only hands-wave admission, plus the shell-owned
  pause ambient keyed by the authoritative host UUID. Do not move either into
  card transport, timer, settlement, or continuation ownership.
- Consecutive identical Holm showdowns passed production smoke on 2026-08-10
  at commit `4eaf5b0be8c20eac4f3e33d5d3699b85f98d1588`: every hand showed its
  canonical pot-to-winner then loser-to-pot stages. Preserve the
  `rounds.id`/hand plus transfer-cursor phase-plan identity; never use
  `games.current_round` as a Holm hand key.

## Sitting Out seat retention

- The 3-5-7 disconnected-winner postgame correction passed repeat two-human
  production smoke on 2026-08-22 at commit
  `e1ee17935967d3408d419febfbc437a6c492ac84`. Preserve the single gameplay
  seat owner through the final-leg award, the exact config-timeout forced-
  absence watch, canonical stand-up after its confirmation lease, and hidden-
  tab protection. `Aug 22 - Lake Avenue` subsequently reached
  `session_ended` through the configured five-minute hidden lease; general
  silent-departure seat release is separate queued lifecycle work and is not
  part of this checkpoint.
- The shared Sitting Out seat-retention correction passed smoke on 2026-08-09
  at commit `52abf4628b651ed899c0b178207972b4edbfec84`. A player who sits out
  remains seated in the relative-seat projection, while next-game eligibility
  remains separate. Only explicit Stand Up or Leave releases a seat. This does
  not allow a post-game absence watcher to forfeit a seat.
- The fake-money post-game heartbeat extension passed production smoke on
  2026-08-09 at commit `d8f8cef3bc3cd01b615ab354163ef66be10c0f7b`. Only a
  result-bearing post-game Waiting table arms the three-miss / fifteen-second
  watch; an absent player becomes Sitting Out, and zero active humans reaches
  Session Ended without financial rows or balance changes.

## Session Ended

Accepted design:

- transient table phase, not modal;
- connected live-flow clients only;
- reconnect/fresh mount of ended session goes to lobby;
- standard HUD/tabs remain;
- results on felt;
- Back to Lobby local-only;
- participant source is current roster plus latest valid snapshots.
- Explicit zero-active post-game closure passed two-client production smoke on
  2026-08-15: after one player sat out and the other stood up, both clients
  entered Session Ended immediately and no setup dialog mounted. Preserve the
  atomic server disposition and keep heartbeat grace limited to ambiguous
  still-active humans.
- The Session Ended join-affordance gate passed production smoke on 2026-08-15
  at commit `8b5e8f4ecc4d42f3028a48f71492b34aec80112b`. Open-seat `+`
  controls remain suppressed in this terminal table phase, while a stood-up
  viewer retains the established absolute observer projection and ordinary
  Waiting-table observers retain valid join controls.

Do not reintroduce a scrim/modal, automatic lobby redirect for connected flow, or gameplay artifacts behind Results.

## Validation

Published runtime smoke is acceptance. Typecheck alone is never a stable checkpoint.

## Owned Supabase production

- The final backend cutover completed on 2026-08-03. Vercel production
  deployment `dpl_9DxrLEW3xwuZQCZv2USavnqr7uDC` reached `READY` and serves
  <https://holm357.com>.
- All 20 retained application datasets, all 11 password/metadata fingerprints,
  and the per-profile financial ledger matched the locked source immediately
  before the frontend switch.
- The emitted production bundle contains the owned project
  `xvhmbuppghwmwpwrkzao` and contains no Lovable-backed project reference.
  The target is unlocked; the retired source remains write-locked for rollback.
- The unauthenticated production route reached `/auth` with no console errors.
  Jeremy then reported ordinary production sign-in and lobby loading clean on
  2026-08-03.
- The combined production fake-money smoke then passed: create/play,
  authenticated voice-to-text, game completion, and Completed Sessions all
  worked against the owned backend.
- Production password recovery then passed on `holm357.com`: email delivery,
  production callback, password update, sign-out, and new-password sign-in all
  worked. The owned-Supabase production cutover is accepted complete; the
  retired source remains the locked rollback snapshot.
- Lovable runtime retirement completed on 2026-08-03: the old Lovable
  publication is offline, all three source Cloud jobs are inactive, and the
  write-locked rollback project remains preserved. The Vercel fallback
  `https://ptown-poker.vercel.app/auth` continued to return HTTP 200.

## Owned Supabase preview

- The authenticated lobby and create-game/game-entry path passed preview smoke
  on 2026-08-02 after migration
  `20260802174956_restore_public_data_api_grants.sql` restored explicit Data API
  grants. Keep all 48 public tables behind RLS and preserve anonymous read-only
  access to `games`.
- Authenticated voice transcription passed preview smoke on 2026-08-02 through
  the direct OpenAI `gpt-transcribe` path: spoken text returned to the unsent
  message draft. Preserve the user-JWT requirement and the no-persisted-audio or
  voice-diagnostics posture.
- `holm357.com` was attached to the existing Vercel Production environment on
  2026-08-03 with valid configuration and HTTPS HTTP 200. The owned Supabase
  Auth Site URL is `https://holm357.com`; preserve both its `/**` redirect entry
  and the protected owned-preview redirect entry through backend cutover.
## 2026-08-12 — Cribbage final-discard recovery proof

- The rollback proof against preserved real-money `Aug 12 - Piper` confirmed
  one legal non-duplicated cut, pegging admission, and inert duplicate/late
  replay. Production recovery selected 5-diamonds and preserved all financial
  and historical state.

## 2026-08-25 — Cribbage multi-hand cross-country preview checkpoint

- Commit `42faab42a` passed the authenticated, two-client
  `cribbage-multi-hand` scenario through terminal settlement, peer recovery,
  and guarded fake-money teardown on the deployed preview.
- This checkpoint specifically covers the delayed later-hand cut and pegging
  presentation boundary; it is preview evidence, not a substitute for
  production smoke.

## 2026-08-31 — Gin post-knock rejoin and terminal checkpoint

- Production commit `aeb2427f6f51a26ca7039f5f6a023bda2416098c` passed three
  concurrent, isolated fake-money rows with the continuous observer and a
  6000 ms action-to-peer budget.
- `gin-knock-layoff-rejoin` passed in game
  `a388e8e8-cfcc-4ecf-b2c4-b1595bc2afc6`: after the first layoff and a full
  route reload, the remaining two legal cards selected normally, exposed the
  correct felt melds, and completed the exact knock outcome.
- `gin-successor-hand-rejoin` passed in game
  `c369743a-57fe-4a00-a56f-22afacb63fbb`: hand 2 reloaded with ten current-hand
  cards, no stale knock display, and no visible masked faces.
- `gin-scoring-terminal-rejoin` passed in game
  `8d89ddfd-49dc-4645-8a1e-30939020fb3d`: the scoring reveal was authoritative,
  the continuously connected client retained Session Ended, and the reloaded
  client followed the fresh-mount lobby rule.
- All three sessions were deleted with verified cleanup. Preserve the
  post-knock full-authoritative presentation gate; do not weaken opening-deal
  admission, redaction, self-draw withholding, or database action authority.

This checkpoint does not claim complete Gin coverage or supersede the queued
Gin server-authority migration.
