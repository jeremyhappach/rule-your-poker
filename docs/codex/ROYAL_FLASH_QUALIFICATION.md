# Royal Flash v1 qualification — October 18, 2026

Follow-up: `ROYAL_FLASH_ACCEPTANCE_AUDIT.md` records the complete eight-item
audit, corrected score/layout gaps and expanded actual-wrapper browser proof.
Its explicit verification limits supersede any ambiguity in this original summary.

Jeremy approved the P-Town rules in `ROYAL_FLASH_RULES_PROPOSAL.md`. Both modes
use the SQL core in `supabase/royal-flash/rules.sql`. Multiplayer and Arcade
freeze `royal-flash/1`; there is no client scoring or mode-specific rule tuning.

Production migration `20261018183121_royal_flash_v1.sql` is installed. Its complete
candidate and installed proofs passed inside transactions that rolled back all
synthetic users, sessions, financial records and scores. Shared owner definitions
were guarded against drift. The existing Arcade recovery worker is version 7.
The migration initially closes admission; `activate.sql` opens it only after the
matching production client is verified. Multiplayer remains fake-money only.

Evidence:

- `supabase/royal-flash/proof.sql`: actual canonical chip changes, winner, split
  tie and all-player tie, balanced transfer batches, final snapshots, setup and
  action replay, late replay, authorization, terminal hold and zero-client recovery.
  Arcade completion creates exactly one immutable result and no financial/session
  writes. Both modes freeze the same config.
- `core-proof.sql`: every scoring category, Ace edges, incomplete lines, no wrap,
  52 unique cards, replacement, private deck redaction, exact clock boundaries,
  full-grid whole-second bonus, cumulative totals, earned third-round progression,
  mode parity, bot decisions using only the public projection, consent/frozen
  offers, pause/resume and bot scheduling.
- `dev/royal-flash/concurrency.mjs`: two actual connections race duplicate and
  competing commands; exactly one settlement/result/transfer batch. Concrete
  balances: 100/100 → 109/91 for a nine-chip stake. Injected settlement failure
  leaves 100/100 and no result. Arcade concurrent duplicate returns one committed
  response and one duplicate.
- Full local browser games through the real SQL authority: two Arcade rounds
  return to the leaderboard; two multiplayer participants play both rounds and
  reach the terminal result. The preview transport is loopback-only and uses a
  disposable database.
- Twelve layout combinations: 320×568, 390×844, 844×390 and 1440×900, with one,
  two or seven players. All 25 cells fit, preserve card proportions, and produce
  no page scrolling. Screenshots were inspected.
- Desktop Chromium verified first-game audio, Arcade → multiplayer, automatic
  resume of a suspended context through the ordinary Start gesture, and one
  shared AudioContext. Hook tests reject duplicate/recovery/scope-change cues.
  The reverse multiplayer → Arcade transition also passed. Reload restored the
  active round silently; the next ordinary placement unlocked audio again.
- TypeScript app check passes. All 2,441 existing application tests passed;
  the two new placement-audio tests passed after adding their jsdom annotation.
  All 241 harness tests pass. The Vite production build passes with existing
  bundle-size and Browserslist warnings.

The initial recommended `bunx tsgo --noEmit` could not run because tsgo is not
installed (its fallback package lookup returned 404). Validation used the existing
local TypeScript compiler with `-p tsconfig.app.json --noEmit`; no dependency
installation was performed.

Existing Run21, TriTowers and 11 Up rules, compatibility groups, recorded scores
and history are not rewritten. Additive routing branches leave their paths intact.
Current score announcements are restricted to winning participants. Bots do not
receive human leaderboard records.

Physical iPhone Safari audio/device smoke is **not verified**. Automated Chromium
and shared-audio tests cannot establish physical-device acceptance. Jeremy's
production smoke remains required: edit the default stake before offering it;
accept from another participant; play with a bot; finish and continue/end a
session; finish Arcade and verify its leaderboard; switch both directions between
modes and check sound after backgrounding, reconnecting and changing mute.
