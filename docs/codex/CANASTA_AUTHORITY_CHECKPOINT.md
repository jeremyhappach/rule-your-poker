# Canasta local authority checkpoint — October 20, 2026

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
