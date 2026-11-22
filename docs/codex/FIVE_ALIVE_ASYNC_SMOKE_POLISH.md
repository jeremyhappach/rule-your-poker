# Five Alive Async smoke polish — November 22, 2026

The five supplied Chrome/iPhone screenshots expose presentation gaps in the
existing Five Alive adapter. This correction uses the shared Async headers,
turn introduction, review receipts, child result and boxer finale. No scoring,
word allocation, stake, settlement, migration or financial writer changes.

## Correction and ownership

- `AsyncGameTitle` is shared by setup selection/configuration/review and match
  headers. Existing artwork remains; Five Alive, Chucky Showdown and Crib Lab
  gain their missing typography/branding entries.
- `sealedProjection` supplies finished counts, including failures, and releases
  opponent guesses only for mutually completed rounds. This intentionally
  supersedes permanent redaction of earlier guesses after mutual completion.
  Current opponent guesses, outcome, multiplier and score remain sealed.
- `FiveAliveMatchWords` reads the permitted gameplay projection on match revision
  changes. Its View Words dialog never begins or acknowledges a replay. The same
  results renderer shows one's finished current word with Opponent: Pending.
- An accepted sixth miss finishes its tile reveal, presents You failed! and the
  answer for five visible seconds, requests the existing two-note failure cue
  through platform audio, then returns locally to `/delayed`. Reload restores
  saved history without replaying this transient failure cue.
- Tiles size letters from tile containers. Completed input removes the keyboard,
  brings board/result/history together, and retains safe-area padding and scroll
  access on short layouts. Outcome copy distinguishes solves from failures.
- An unviewed result receives the existing Async intro, exact opponent/word
  number, sequential guess reveals, both calculations and score flights/counts.
  Existing review ACKs gate the next Word N intro and shared bell.
- After final review/score presentation, the live adapter enters existing
  `ChildResults`, then `MatchFinale` only when the shared receipt gate permits it.
  Winner, stake and net use the existing server projections. No client award or
  settlement command was added.

## Evidence and limits

The deployed Five Alive load/commit definitions retain parent/child locks,
membership, receipt fingerprint, revision/segment and terminal guards. Unique
review `(event_id,viewer)`, review event-key and settlement match/game/dealer-game/
result indexes were inspected read-only. No database mutation was performed.

The standard push-enabled build passed TypeScript, 4,377 application tests,
241 harness tests and 46 release-tooling tests. Static size was 89,822,290 bytes,
below the unchanged 90,000,000-byte gate. Subsequent focused tests cover the
completed-history wording and passive match history. Ten server rule/projection
tests pass, including six misses and mutual-completion privacy.

`dev/five-alive/presentation/async-polish-proof.mjs` runs actual components and
shared rules through disposable local transport in Chrome mobile mode. Five
sizes (320×568, 390×844, 430×932, 585×766, 844×390) pass horizontal containment,
tile-letter containment and compact waiting spacing. Word 2 pending history,
replay into Word 3, sixth-guess solve, sixth miss, five-second failure hold
(5,011.6 ms observed) and refresh without failure replay pass.

`dev/five-alive/presentation/async-ending-proof.mjs` runs the actual Async routes,
review components and boxer finale with an isolated settled $1 projection.
Winner and loser views show Hap won the $1 stake before the boxer sequence.
Refresh retains the three presentation receipts and emits only state reads and
presentation ACKs. No browser errors occurred. This is presentation evidence,
not a newly executed live financial settlement proof.

Screenshots and machine reports are under
`qualification.local/five-alive/async-polish/`: waiting/history, failure,
sixth-solve, opponent intro, paired scores, stake winner/loser and boxer
winner/loser. Local screenshots are not physical iPhone captures.

Remaining acceptance: both physical iPhone/PWA players complete a fresh Async
match, including one waiting on Word 2, sixth solve/miss, muted/unmuted cues,
replay into the next word and final authoritative $1 settlement. Confirm the
same saved outcome after refresh. Preserve existing smoke matches.
