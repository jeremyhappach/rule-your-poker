> Historical local checkpoint, superseded by the authorized
> [October 24 reconciliation and production release](SIX_CARD_GOLF_COMPLETION_RELEASE.md).

# Multiplayer Golf completion checkpoint — local only — 2026-10-23

Base: `4571d140baa9507a5a3e3d2c19dd42a1f5fbeb47`, verified against local main,
origin/main and the public build manifest before work. Branch:
`codex/golf-local-completion`. Jeremy authorized implementation and qualification
locally only. No main integration, push, hosted migration, release-signal change,
production gameplay mutation or deployment is included.

## Findings and corrections

1. Score surfaces used several string conversions: positive totals lacked `+`,
   some zero values were `0` or `+0`, and per-hole pencil scores used raw numbers.
   One presentation formatter now supplies `+N`, `E` and negative values to the
   scorecard, completed-hole standings, seat totals, history and scoring/winner
   text. An unplayed hole remains blank; the zero completed-hole total is `E`.
   Original pencil strokes remain; the renderer adds a plus stroke. Numeric rules,
   stored scores and the existing public-only score projection are unchanged.
2. Deployed `private.golf_recover()` invoked the all-human pause helper inside an
   admitted match. The helper is also called by canonical automatic-play control,
   so deleting only the recovery call would leave another path to the same pause.
   The candidate removes that recovery call and narrowly excludes an active,
   unfinished play-money Golf match from the shared helper. Deliberate pauses
   still take precedence; real-money and configured timeout-policy branches are
   retained. Canonical postgame continues to evaluate eligibility between dealer
   games. The checked-only Auto-play control now lives in the active player pane.
   Unchecking uses the existing versioned `golf_reclaim_control` RPC, which clears
   both `auto_fold` and `sit_out_next_hand`; it disappears only on authoritative
   confirmation. A fresh game has no unchecked opt-in control or Info button.
3. The scoring presentation intentionally delays counting after the last motion,
   but the table treated that delay as another turn and rendered the owner's
   large piles. Authoritative hole completion now suppresses turn affordances.
   Existing transport anchors remain through the completed action animation;
   afterward piles disappear during the configured pre-scoring delay. Counting,
   reveal order, results timing and numeric scoring remain unchanged.
4. The committed Golf roster guard rejected the canonical Blast cascade with
   `golf:match_liability_committed`. Inside the existing locked, admin-only,
   explicitly play-money Blast transaction, the candidate retires that session's
   Golf matches before deleting the session graph. This releases only the
   liabilities being administratively destroyed in the same atomic operation.
   Direct player deletion remains rejected. Existing Farkle cleanup, authorization,
   real-money rejection and already-deleted behavior are preserved. No new
   settlement, refund or financial product policy was introduced.

## Local qualification

- TypeScript, all 2,864 application tests (412 files), 241 harness tests,
  63 focused Golf/Mega tests and the production Vite build pass. Existing
  bundle-size warnings remain; no dependencies were installed.
- The SQL runner clones an existing isolated fixture database on **127.0.0.1:55439**.
  It never accepts a hosted connection. It reconstructs the three shared owners
  from read-only deployed definitions, guards exact preimages, applies the candidate
  twice to prove idempotence, and rolls back all fixture work.
- Both `/1` and `/2` are exercised. `/2` rule-function hashes are checked against
  the inspected deployment before correction. Six cases per version cover
  human-plus-bot and two-human matches in both money modes, plus active cleanup.
  Play-money cases progress with every human automatic through nine-hole canonical
  settlement and terminal completion; real-money cases pause without changing
  the unresolved hand and resume with a usable allowance.
- Checks include unexpired and expired boundaries, deliberate/repeated recovery,
  real/play-money reclaim, stale control versions, outsider rejection, reconnect
  projections, clearing deferred sit-out, own-card privacy, balanced canonical
  chips, single settlement, postgame identity retirement, paired twos at zero,
  active and settled Blast, interruption rollback, retry, non-admin denial,
  real-money denial and restricted function grants. The `/2` run also executes
  the existing financial winner/tie/replay/failure-rollback regression suite.
- The actual canonical UI passes the 390×680 Edge browser scenario: no fresh
  checkbox, checked control fits the active pane, reclaim request identity/version,
  authoritative disappearance across reload, pencil `+`/`E`/negative labels,
  blank future holes, public totals held during scoring, retained final-action
  anchors, no frame with a stale owner-turn pile, and the configured 1200 ms
  pre-scoring hold. No browser errors or external requests were recorded.

Commands:

```text
node dev/six-card-golf/local-completion-proof.mjs
node dev/six-card-golf/local-completion-proof.mjs --v2
node dev/six-card-golf/local-completion-review.mjs --check
node dev/six-card-golf/local-completion-review.mjs
```

The last command serves the synthetic review at
`http://127.0.0.1:5224/__completion-review`. It cannot access a database.
The proof runner uses the existing local PostgreSQL tools/context from the main
worktree; `GOLF_LOCAL_REFERENCE_ROOT` can name another existing local fixture root.
No dependency installation is required or performed.

Actual evidence is under `qualification.local/golf-local-completion/`
(`evidence-v1.json`, `evidence-v2.json`) and
`qualification.local/six-card-golf/cardback-seat-review/`
(`completion-evidence.json`, `completion-autoplay.png`,
`completion-scorecard.png`, `completion-scoring.png`). Build/test logs use the
`qualification.local/golf-completion-` prefix.

## Scope, shared dependencies and remaining gates

Product changes are confined to `src/components/golf/` and the new
`src/lib/golf/scoreLabel.ts`. SQL is prepared in
`supabase/six-card-golf/local-completion.candidate.sql`; the paired proof and
reference files are local fixtures, not production migrations.

The shared pause helper and Blast RPC remain shared owners. Their new behavior is
limited to Golf; Canasta and other games receive no implementation changes.
Published opponent-card slots, medium face tiers, seat tableau inspection, Mega
presentation release, frozen rule versions, admission, stake consent, settlement,
canonical recovery ownership and hidden-card protections are preserved.

There is no unresolved local product/financial decision. Publication remains
unapproved. A later release still needs a registered forward migration, fresh
hosted preimage/grant inspection, contained hosted proofs and normal publication
qualification. Physical iPhone smoke is not established by the Edge fixture.
Deferred four-player and short-landscape redesign remains outside scope.
