# Chess bot forfeit handoff — November 14, 2026

Jeremy reported: confirmed forfeit plays the king explosion and sound, then
shows the generic “P-Town Chess completed $0” screen, restores the board, and
gets stuck reconnecting. This correction integrates the relevant previously
unpublished multiplayer presentation fix with the published forfeit sequence.

## Frozen evidence

Session `9344a7ee-5eb3-4ecc-93b1-d4c038a2fddc`, dealer game
`8417050e-b13d-42db-a358-0b2a63a21595`, round
`56db1116-c35d-4600-8baa-7b2d0b5f0c64`. The authoritative match is finished,
revision 58, resignation, fake money, stake 5. Result
`9289dab7-11a1-44ee-9286-71f38dccfe22` awards Bot 1 the win. Batch
`593ad73f-8205-4b04-8307-a4540d15f079`, cursor 1, transfers exactly 5 from
Hap's player `ddeb7092-78aa-429c-a6ee-d1ba9f8c523b` to bot player
`ff4e5e35-3193-4794-9fd7-854a57668235`. Opening balances 0/0 become −5/+5.
Both current player balances agree. The forfeit was committed at 21:46:45 UTC;
the session ended at 21:48:11 after Hap's player became `left`.

Postgres logs then show `chess:participant_required`. The installed
`private.chess_authorize` correctly rejects live reads after a player leaves.
The installed `chess_record` reads settled balances from immutable session
snapshots, not a subsequent game's running balances. These are read-only
observations; the match, balances, history and authorization were not changed.

## Ownership and correction

- `shellRouting.ts`: Chess was absent from `CANONICAL_SHELL_FAMILY`, allowing
  `Game.tsx` to mount the legacy generic game-over surface using its unused $0
  pot. Register Chess with the persistent canonical shell.
- `ChipTransportProvider.tsx`: Chess was absent from durable presentation
  cursor registration. Its table waited for a settled/reconciled cursor that
  was not retained after animation. Register the existing cursor receipt.
- `Game.tsx`: preserve the locally presenting Chess identity in the playfield
  slot through server setup/successor changes; admit a new board only during
  gameplay/game-over. Retire the old board after its exact terminal token.
- `ChessTable` / `ChessView`: show the committed signed player result, checked
  against result identity, transfer endpoints and saved balances. Preserve
  explicit forfeit/timeout labels and the existing 5.2-second forfeit admission.
  Inconsistent evidence remains explicit and cannot silently complete.
- `SessionLifecycleAnnouncer`: avoid re-emitting an unchanged setup ambient
  on its own context updates. Preserve changes to dealer labels and recovery
  when another owner replaces the ambient; shared pause ownership is unchanged.

No rule, scoring, clock, bot, financial writer, API, migration, server progression,
or historical-data change. Async keeps its existing final-board/finale path.

## Qualification and acceptance

The route tests use the actual Game/shell/board/ledger with fixture network and
clock state. They cover both result viewers, setup/configuration/successor races,
inconsistent financial evidence/recovery, and bot forfeit into next-game setup
or Session Ended with Back to Lobby. Browser qualification uses actual
`useChess`, `/api/chess` request payloads and canonical chip runtime with isolated
server responses. It confirms a single user-confirmed resignation, explosion,
signed loss and automatic handoff, plus the preexisting checkmate paths in both
phone orientations. No synthetic production games are created.

Local evidence: `qualification.local/route-tests.log`, `chess-build.log`, and
`chess-multiplayer-p0/browser.json` plus screenshots. Production PWA acceptance
remains Jeremy's: forfeit against a bot, observe explosion → explicit result
and payout → normal next-game table without generic $0 or reconnecting board;
also check an ended session reaches Session Ended and Back to Lobby.

PASS: 48 focused checks; all four browser scenarios (portrait/landscape mate,
bot forfeit into setup, bot forfeit into Session Ended and lobby); standard
TypeScript; 4,237 application tests; 241 harness tests; 46 release-tooling tests;
Vite build and the unchanged 90 MB static-size gate. The browser fixture mirrors
the server's existing UUID receipt dedupe when transport recovery retries an
acknowledged action. No production retry/authorization code was changed.
Final internal diff review preserves the explosion/sound, existing result labels,
Async behavior, shell ownership and exact completion guards.
