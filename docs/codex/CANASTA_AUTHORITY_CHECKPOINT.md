# Canasta local integration checkpoint — October 21, 2026

Latest local reconciliation with main `6b15f4eb0` is recorded in
`CANASTA_RECONCILIATION.md`. It preserves the released catalog and terminal owners,
updates only the guarded Ante Up insertion, and qualifies Canasta with the released
Race/11 Up/Battle31 database baseline. Hosted transport and native gates remain.

## October 21 fake-money admission and closed package

Approved local-only follow-up adds authoritative fake-money guards to configure
and begin, and session-specific capability filtering. The admission proof covers
both closed modes, forged client mode, no side effects on rejection, genuine fake
setup followed by a mode change, private-RPC denial, and committed retry after
gate closure. Run Back uses the same configure owner; actual hosted Run Back
remains part of browser qualification. Existing rule/financial/recovery code is
unchanged. Both-money financial tests are synthetic rollback regressions only.

Passed this pass: main rollback consent/financial/control/RLS/admission proof;
independent settlement/deadline/reclaim concurrency; worker-process crash/restart;
exact generated closed-install and both release rollback scripts locally.
The package verifies closed flags and inactive scheduler before any local health
fixture. Generated artifacts have reproducible hashes and a no-write check.
Previous app tests/build evidence is unchanged; no client source changed here.
See `CANASTA_RELEASE_PACKAGE.md`. Release remains blocked by current-main
reconciliation, hosted authority/transport/browser checks and native acceptance.

## October 21 recovery and timeout correction

Supersedes the final-revision limitation and mechanical-only timeout description
below. Local-only authorization: fix final delivery and terminal/reconnect/restart
behavior, apply Horses/SSC timeout standard, preserve rules and accepted geometry.

- Root cause: revision RLS required a non-left player row while the terminal
  projection allowed the frozen participants. A narrowly scoped security-definer
  visibility predicate now grants settled frozen participants the revision signal,
  still requiring an active profile. Private hands are not published.
- Eligible fake-money expiry uses the same own-hand/public-information bot planner
  as bot seats. Canonical auto_fold and sit_out_next_hand are set atomically. Both
  Canasta reclaim and canonical set_automatic_play(false) clear the queued sit-out.
  Real-money expiry and all-human inactivity pause; the latter commits automatic
  status first without playing the pending turn. A legal bot plan can meld cards;
  deterministic completion remains only the bounded fallback. Rules/stake unchanged.
- Uncheck Auto-play restores manual controls; opponent seats reuse AutoRollIndicator
  in the existing canonical chip slot. No other game's presentation changes.
- Restart proof exposed a paused postgame continuation blocked by the shared pause
  guard. Due work and finish now defer while paused, preserving settlement until
  canonical resume. No pause guard is bypassed.
- Local rollback SQL verifies canonical control RPCs, unchanged hand/deadline on
  reclaim, exact final revision, terminal Stand Up, repeated finish, authenticated
  RLS access by the left frozen participant, outsider denial and inactive-account
  denial. Private projection reconnect returns the finished authoritative snapshot.
- recovery.proof.mjs starts separate Node worker processes against a disposable
  database in the network-disabled container, kills execution after committed
  gameplay and after terminal finish, then starts fresh workers. It verifies expired
  claim rejection, dispatcher lease rotation, health acknowledgement, canonical
  pause/resume, no duplicate turn/settlement and final revision persistence. This
  clone lacks pg_net: only HTTP delivery is stubbed; actual dispatcher/lease/RPC/
  financial owners execute. This does not qualify deployed cron or Edge delivery.
- Component tests hold until authoritative finish, the server hold deadline and
  canonical chip cursor completion; emit one exact completion token, retain the
  correct first round after later-hand reconnect, reject wrong tokens and avoid a
  retained table on a fresh ended entry. Canonical owners are mocked at this
  component boundary; production Game-route navigation is still a release test.
- Two rendered fixture tabs verified bot meld/discard completion, opponent robot,
  reconnect with checked Auto-play, uncheck propagating to the opponent, all-human
  pause without further drawing, separate resume at 120 seconds and reconnect
  preserving cards/melds. Evidence: autoplay-opponent.png and autoplay-reclaim.png.

Release remains closed. Remaining installed-stack checks include authenticated
consent-to-terminal navigation, actual Supabase Realtime delivery and cron/Edge
transport, Run Back/sit-out transitions and physical iPhone acceptance. This pass
does not push, deploy, install production SQL, activate admission or change main.

Validation for this correction: 146 tests across 20 files passed, including
Horses/SSC authority/terminal and canonical player-intent regressions. App/server/
fixture TypeScript, application build and recovery-worker bundle passed. All three
local SQL proof runners passed: rollback consent/financial/control/RLS; competing
settlement/deadline/injected rollback plus reclaim versus stale autoplay; and
separate-process recovery. Existing build advisory warnings are unchanged.

## October 21 local integration addendum

This section supersedes the implementation gaps in the October 20 record below.
The approved local pass reconciles Ante Up and adds consent, recovery and canonical
multiplayer wiring. Rules and accepted appearance are unchanged. Nothing has been
pushed, installed in production, deployed or activated.

- The old local dispatcher clone predates the Megatouch branches. The candidate
  now checks the normalized hash of the October 21 deployed definition and inserts
  only the Canasta branch. Removing that insertion reproduces the deployed hash,
  preserving Race Poker and every other branch and replay guard. The captured
  production definition is qualification input only, never a production replacement.
- Setup uses closed capabilities, exactly two seats, positive match stake and fresh
  canonical Ante Up consent. Configuration and roster freeze together. Run Back
  carries the stake only and requires fresh consent. Commit revalidates active
  profile, participant UUID, user/bot kind and frozen seat position.
- Authenticated HTTP route, private revision-CAS store, public revision-only signal,
  bounded recovery lease/worker and disabled scheduler candidate are wired locally.
  Admission requires recent successful recovery health. SQL remains unapplied.
- Game.tsx mounts CanastaTable in the canonical shell with retained roster and
  actual first-round identity, including reconnect during later hands. Existing
  identity, HUD/tabs, announcements, card transport/audio, chip admission, celebration
  and terminal completion owners are reused. No second rules engine or table exists.
- Browser review uses the real reducer and private projection behind loopback HTTP
  and SSE, with synthetic participants. It is in-memory and has no authentication,
  financial writes or durable worker. It is not full-stack release qualification.

Validation: 120 focused tests across 14 files; app, server and fixture TypeScript;
full application build and recovery-worker bundle passed. Three autonomous matches
reached the match boundary with physical-card conservation on every action. Existing
Browserslist age, mixed-import and large-chunk build advisories remain.

The network-disabled local PostgreSQL clone passed actual canonical consent,
both-money settlement and lease proofs inside rollback. Disposable competing-session
proofs passed duplicate/different-request settlement, deadline expiration while
waiting for the canonical lock, and injected failure after chip transfer. Each
successful settlement had one result, one balanced batch, two snapshots and exact
+S/-S canonical chips. The disposable concurrency database was dropped afterward.

Rendered evidence: duplicate physical aces survived selection/sorting and qualified
a frozen-pile opening. The committed meld and 14-card hand survived reconnect;
final discard advanced the turn with 13 cards and without resetting the active
deadline. The 320x568 safe-area audit covered those 13 cards, not the maximum hand
(its old harness label says maximum). The 812x375 audit covers 15 cards in a paused
fixture. Both report no layout failures. Prior 71-card evidence remains separate.
See evidence/canasta-mobile/integrated-{narrow,landscape}.png and matching audit JSON.
Review URL: http://127.0.0.1:4328/mobile.html?authority=1 (local server required).

Remaining release blockers: authenticated two-human/human-bot consent-to-terminal
browser runs; actual Supabase Realtime membership transitions; worker restart and
zero-client recovery; pause/Take Back Control races; Run Back and sit-out flows;
terminal hold/Session Ended/fresh reconnect; native iPhone acceptance; installed
authority and deployment qualification. In particular, verify revision visibility
when a participant becomes left at terminal completion: the current revision RLS
requires non-left membership even though terminal projection reads permit frozen
participants. Resolve any missed terminal signal before release. Initial deal
transport on live admission also needs qualification; fresh snapshot baselines
deliberately avoid replaying old flights. No release readiness is claimed.

This pass stops at the repository's bounded execution checkpoint. The canonical
patterns supplied the adapters, but full authenticated lifecycle qualification is
an additional pass; it cannot be inferred from the local reducer fixture.

## October 20 record (historical)

Jeremy accepted the canonical appearance and authorized local implementation via
the originating workstream. Base: c63c7bfd3. No merge, push, production migration,
deployment, or admission activation is authorized. This checkpoint is incomplete;
it is not a release candidate or a claim that Canasta is playable in the app.

## Implemented locally

- `src/lib/canasta/engine.ts` consumes the frozen predicates and owns the full
  match/hand transition: physical 108-card validation, alternating deal, red-three
  exposure/replacement, initial upcards, draw, atomic pickup/opening, committed
  melds, final discard/out, signed scoring, 5,000-point match boundary, equal-total
  continuation, rotating dealer, request receipts, private projections, deadlines,
  pause/resume generations and mechanical completion. No bot strategy enters a
  human timeout. Server shuffle uses cryptographic random IDs and Fisher–Yates.
- `engine.test.ts` replays a complete physical deck through deal, all 31 stock
  turns, frozen opening pickup and final discard. It reaches 71 then 70 cards
  with full conservation checks. This closes the previous predicate-only proof
  gap for that witness. Targeted boundary fixtures are separately identified.
- `bot.ts` consumes only the active seat's redacted projection. Eight shuffled
  full hands finish through the reducer. This is bounded strategy, not a claim
  of expert-level play or completed human/bot match qualification.
- `server/canasta` contains secure shuffle, revision-CAS authority orchestration,
  privileged RPC store, authenticated HTTP handler factory, due-work processor,
  and postgame completion call. These factories have no production route,
  credential default, scheduler registration, or publication hook.
- `supabase/canasta/*.candidate.sql` contains closed configure admission, private
  Ante Up begin adapter, private state/receipts, commit deadline checks after
  canonical locks, signed total verification, canonical chip-transfer settlement,
  atomic result/journal/snapshots, canonical pause trigger, player automatic-control
  synchronization, due-work query, terminal hold and postgame continuation.
  The lifecycle follows existing Run21/Boxdrop ownership. Candidate SQL remains
  unapplied; the proof runs all DDL and synthetic state inside BEGIN/ROLLBACK.
- The accepted editor now lives in `src/components/canasta/HandEditor.tsx` and
  shared `canasta.css`; the offline review re-exports it. `CanastaGame.tsx` accepts
  authoritative transport snapshots, uses canonical timer/HUD/announcements,
  clears drafts across turn identities and reconnect, retains uncertain command
  IDs, and rejects regressive or conflicting equal-revision snapshots. It does
  not mount a second table or own terminal lifecycle.

## Evidence and limits

- 40 Canasta tests pass: 21 rule boundaries, 3 original maximum/count tests,
  7 full-reducer tests and 9 authority/bot/shuffle/reconciliation tests.
- 34 shared regression tests also pass: 25 card-face boundaries, 2 Joker renders,
  1 physical-card transport and 6 Holm manifest cases; 74 total across eight files.
  App, fixture and server TypeScript pass;
  isolated review Vite bundle passes with existing Browserslist-age/chunk-size
  advisories. No dependencies or tools were installed.
- `node supabase/canasta/proof.mjs` passes against an isolated, network-disabled
  clone of the existing stopped local qualification database, using its actual
  financial triggers. The original database volume was mounted read-only.
  No production database writes occurred. The local proof verifies fake/real
  +10/-10 chips, balanced canonical transfer batch, atomic results/snapshots,
  qualifying tie without payment, signed -100 hand score, duplicate/conflicting/
  late replay, membership rejection, fresh-lock deadline rejection, canonical
  expired pause/resume, terminal hold and one postgame continuation. Admission
  remains false even inside the proof. This is not a complete financial release
  gate: true competing SQL transactions and full consent-to-terminal flow remain.
  The two-worker race test uses an in-memory CAS store, not competing SQL sessions.
- `authority-editor-audits.json`: all 71 cards at 320×568 with safe-area envelope;
  enabled Finish controls at 812×375 with envelope. Zero target-size, clipping,
  overlap, overflow or nested-scroll failures. Screenshot:
  `evidence/canasta-mobile/authority-editor-landscape.png`. These are shared-editor
  fixture checks, not an end-to-end live Canasta table or native Safari test.

## Remaining implementation and qualification

1. Connect `private.canasta_begin` to the exact canonical Ante Up dispatcher and
   add frozen configuration/roster guards and revision publication. Keep both
   release/admission gates closed. Do not substitute direct begin calls for
   actual fresh stake consent in qualification.
2. Register authenticated transport and canonical server recovery scheduling;
   qualify process restart, zero clients, concurrent requests, pause races,
   Take Back Control, sit-out-next-match and reconnect after every committed phase.
3. Integrate the Game route, existing seat projection, felt artifacts, card
   transports/audio, shared celebration and retained terminal presentation.
   Wire `CanastaGame` into that owner; fresh ended reconnect must go to lobby.
   The current offline review still uses its original presentation fixture.
4. Complete end-to-end two-human and human/bot matches, concealed/out/black-three
   boundaries, qualifying ties and successor hands, actual consent and Run Back,
   SQL concurrency/authorization/rollback proofs, browser interaction and physical
   mobile acceptance. Verify other games at every changed shared call site.

The repository execution budget requires a stop before a longer cross-cutting
integration. The reducer/private-store pattern was sufficient for this checkpoint;
the remaining canonical dispatcher, scheduler and retained-route adapters are
additional owners, not a mechanical copy of one game. Continue those in the next
bounded local pass under the existing approval. No additional product decision
has been made or is requested here. Release gates remain closed.
