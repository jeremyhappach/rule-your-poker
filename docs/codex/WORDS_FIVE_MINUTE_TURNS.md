# Words five-minute turns — November 14, 2026

New live games and Async offers freeze `ptown-words/4`: five-minute playable
turns, two three-minute time banks per player, and the existing 36-hour Async
availability window. Existing /1 and /2 games retain three-minute clocks; /3
retains its original availability-only clock. Previously created offers keep
their frozen rules when accepted. No historical game or turn is rewritten.

Migration `20261114160043_words_five_minute_turns.sql` is installed. It guards
the deployed function definitions before updating the current rules selector,
new Async offer/capability configuration, and the existing live/Async version
checks for entry, expiry, banks and pause requests. The deal guard validates
the full frozen rules against the version registry, including old offers.
Scoring, dictionary, settlement, progression, presentation and gestures are
unchanged. Rendered clocks already use authoritative deadlines.

The rule panel and Async information now describe the frozen duration. The
catalog defaults to /4 while retaining support for /1, /2 and /3.

## Verification

The complete candidate rollback proof passed before application, and the same
proof passed against the installed migration. It exercises actual deployed
RPCs and financial triggers: two to four players, fake/real winner and tie,
balanced transfers and canonical chips, injected transfer failure, duplicate
and late receipts, authorization, terminal hold and continuation, pause and
host transfer, bank increments, precise expiry, and timeout provenance.

Async coverage includes new /4 offers and faithfully reproduced pre-change /2
offers, actual acceptance, entry, replay, banks, 36-hour availability, playable
expiry passing to the successor, and rejection of stale expiry. Pure rule tests
cover all four frozen versions and reject altered configurations. Synthetic
rows roll back; the old broad recovery sweep is deliberately omitted from
hosted qualification so existing sessions are never touched.

Reproduce SQL with `node dev/words-gameplay/five-minute-proof.mjs --candidate`
before applying, or without the flag against installed functions. The script
emits one rollback transaction and composes existing core/financial/bank proofs
with `supabase/ptown-words/five-minute-proof.sql`.

Client coverage checks five-minute rule text, legacy rule text, five-minute
clock rendering and the unchanged three-minute bank increment. TypeScript,
all 4,159 application tests in 569 files, 241 harness tests, 46 release-tooling
checks, Vite production build and the unchanged 90 MB static gate passed
(89,946,312 bytes). The local full-suite attempts hit five-second timeouts under
load; the complete successful run used two workers and a 15-second test timeout,
with no weakened assertions or test/build configuration changes. Public
deployment verification is recorded in the delivery receipt.

## Files and smoke

- Database: migration above, the new timing proof and proof composition script.
- Client: `src/components/rules/PtownWordsRules.tsx`,
  `src/components/delayed/WordsTurn.tsx`,
  `src/lib/gameCatalog/games/ptown-words.ts`.
- Tests: `PtownWordsRules.test.tsx`, `PtownWordsView.test.tsx`.
- Release memory: this report, `CURRENT_RELEASE.md`, `BACKLOG.md`.

Jeremy's production smoke: create a new live and Async Words game, verify 5:00
on entry and a +3-minute bank, then check that an existing three-minute game
retains its duration. Physical-device gameplay acceptance remains pending.
