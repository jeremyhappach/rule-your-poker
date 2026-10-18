# Continued Megatouch smoke — 2026-10-18

Jeremy explicitly authorized implementation and production delivery of six
continued smoke findings. Checkpoint tag: `megatouch-continued-smoke-2026-10-18`.
Physical-device acceptance is pending.
Migration `20261018171604_megatouch_ante_and_activity` is installed; the complete
rollback proof passes both before installation and against the deployed definitions.

## Corrections and preserve boundaries

- All three multiplayer configure RPCs formerly marked everyone ante-up and
  created live matches immediately. They now commit the canonical ante phase,
  frozen configuration and deadline. Only the caller's configuration accepts
  their stake. Other humans must explicitly Ante Up despite saved auto-ante
  preferences. Canonical decline/timeout/leave resolution remains the owner.
  Its new private adapter creates the unchanged game-specific match only after
  consent; no round or private match exists beforehand. The established caller
  form loads defaults and permits edits; integer validation no longer truncates
  decimal stakes. Arcade remains nonfinancial.
- A 90 ms quiet ding follows an increased authoritative eleven count in the
  same live round/actor scope. Initial snapshots, rejected/partial selections,
  repeated revisions, recovery epochs, paused/hidden views and tab catchup are
  silent. The existing shared audio owner enforces viewer preferences and
  session deduplication.
- Audio already used one application context across routes. A delayed
  non-running state notification could nevertheless retire a timeline that
  had never played. It now retains unplayed, unexpired cues, while interruption
  still retires started cues. Trusted gestures start one silent sample per
  context for iOS unlock; closed contexts replace their old listener. No game
  creates or closes a separate context. This addresses a reproduced lifecycle
  defect; the exact physical iPhone Chrome failure remains owner smoke.
- TriTowers records were **not deleted**: inspection found 78 historical
  results (10 version 2, 11 version 3, 57 version 4), plus one current version 5
  result. Versions 2–4 already share a compatible score group. Version 5 is
  genuinely different: old automatic exhaustion finishes without a time bonus;
  manual Take Score when stuck can award remaining time bonus. The previous
  release selected version 5 and hid the historic selector inside Info.
  The main leaderboard now exposes “Classic · Automatic finish” and
  “Manual Take Score · Current”, with the scoring distinction explained.
  Existing standings, scores, versions and compatibility queries are preserved;
  no delete, rewrite, restoration mutation or backfill was needed.
- “Recent logins” is an admin-only view of `profiles.last_seen_at`, displayed in
  the viewer's local timezone, newest first, UUID tie-break, NULL/“Never” last.
  Earlier values came from lobby entry/foreground events using the client clock
  and are retained as recorded. New values are server timestamps from visible
  authenticated app entry, trusted interaction or foreground return, throttled
  to one write per minute on both client and server. Token refresh and background
  heartbeats do not advance this field. The server checks the existing admin
  role; a narrow trigger prevents direct browser timestamp edits despite
  existing table-level profile grants. No account-creation timestamps are used.
- The 11 Up multiplayer overlay selects finalized winner UUIDs, including ties,
  before reading this completed score's immutable achievement facts. Exact
  top-ten position, newly established personal best and overall record can
  combine. Historical bests and matched records do not produce “new” callouts.
  Losing players' history/leaderboard eligibility, canonical chip settlement,
  confetti, winner pulse, synchronized hold and continuation are unchanged.

## Validation

The candidate migration and complete rollback proof cover exact setup replay,
noncaller authorization, no pre-consent round, frozen configuration, acceptance,
duplicate start, decline, leave, server timeout, shared rule identity, winner,
tie, late replay, terminal continuation, actual canonical chip/journal effects,
all-player finalized score facts, Arcade zero financial writes and Blast.
Activity proof covers admin denial, every profile, ordering, Never preservation,
server timestamps/throttling and rejection of direct authenticated timestamp
writes. No synthetic records survive these rollback transactions.

`node dev/eleven-up/continued-proof.mjs` produces the complete BEGIN/ROLLBACK
proof in `.codex/evidence/continued-smoke/complete-proof.sql`. Its temporary
configuration adapters explicitly submit each synthetic human's consent before
running the existing financial/lifecycle proofs. The new consent proof uses
the real configure RPCs directly.

TypeScript, 2,441 application tests, 241 harness tests and the production build pass.
Browser audio checks pass on Chrome desktop, Chrome touch emulation and Edge,
including first/subsequent cues across both mode directions in one document,
suspended/closed contexts, dedupe, mute and delayed preference loading. Shared
Run21/TriTowers audio hooks remain covered by the application suite. Game Over
geometry passes at 320×568, 390×844, 844×390 and 1440×900 in solo/multiplayer.
Local evidence is under `.codex/evidence/continued-smoke/` and
`.codex/evidence/eleven-smoke/`; browser audio evidence is in `dev/audio/`.

## Production smoke

1. In each multiplayer game, change the caller's stake; verify the other human
   sees that amount and no play starts until Ante Up. Check Sit Out, leave,
   timeout and subsequent configuration/continuation.
2. On physical iPhone Chrome, keep sound enabled and navigate multiplayer →
   Arcade → multiplayer without reloading. Check the first and next intro,
   eleven ding and score sound; background/foreground once and try again.
   Include a Run21 and TriTowers round. Physical-device playback is not proved
   by desktop touch emulation.
3. Select TriTowers Classic and All Time; verify historic standings. Switch to
   current rules and verify the separately labeled standings.
4. Open main-lobby admin → Recent logins. Verify local dates, recent activity
   after app use, and Never-last rows. Regular players cannot read the RPC.
5. Verify winner-only achievements, a no-achievement winner, tied winners and
   a losing player's personal-best history; observe normal chips/hold/next game.
