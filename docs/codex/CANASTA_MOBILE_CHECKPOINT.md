# Canasta mobile checkpoint — implementation in progress

This branch is a local, isolated interaction review. No catalog, route admission,
database migration, live RPC, financial write, production deployment or main
integration is authorized at this checkpoint. Main remains unchanged.

## Owner inventory completed before edits

- `PlayingCard`: shared by Holm/3-5-7, community/Chucky, Gin, Cribbage, Run21,
  TriTowers, Take Two, Royal Flash and Trip Flip. Explicit opt-in Joker prop;
  standard Card/Rank/Suit and all evaluators unchanged.
- `resolvedCardFace`: unchanged standard/masked validation. New physical-card
  wrapper validates suitless Joker separately without accepting fabricated suits.
- `CardTransportProvider` and `CardTransportRuntime`: persistent shell, Holm/Gin/
  Cribbage/3-5-7 orchestrators and deal runtime. Separate flight/card IDs preserved.
  Joker is opt-in; ordinary visibleFace and existing manifests remain compatible.
- `ActiveHandFan`: Holm/3-5-7, Gin, Cribbage, PlayerHand, MeasuredActiveHandFan,
  admin hand layout. Not edited: arbitrary large hands require a scrollable tray
  in canonical row four, using the same PlayingCard primitive, not a compressed fan.
- `PersistentTableShell`, `CanonicalSeatCluster`, `ShellHudGrid`, shell tab,
  announcement, timer, chip and card transport owners are imported, not duplicated.
- Geometry uses existing container-relative safe-felt exclusion solver. No
  product viewport-specific rules or shell row retuning.
- New rule predicates live in `src/lib/canasta/rules.ts`; fixture identities and
  UI-only scene assembly live under `dev/canasta`, outside production routing.

The original checkout has an active Six-Card Golf branch and unrelated changes.
This work uses a separate managed worktree from a150cd6ae. Shared-owner changes
must be reconciled with that work before eventual integration, not overwritten.

## Review

From this worktree:
`node node_modules/vite/bin/vite.js --config dev/canasta/vite.config.ts`

Open `http://127.0.0.1:4327/mobile.html`. The wrapper offers five real iframe
viewport sizes, including portrait/landscape; the inner app uses the actual shell.
No environment file is loaded. Any accidental Supabase/auth call throws.
Existing dependencies are reused through a junction; nothing was installed.

Scenarios cover 15/30/60 cards, duplicate selection and sorting, Joker allocation,
opening feedback, frozen pickup, final discard/out, cancellation and reconnect to
the committed fixture. Clock presentation uses the canonical timer owner.

**Large-hand limitation:** 104 (all non-red-three cards) is an absolute physical
stress bound, not a proved maximum-reachable hand. The scene labels this
explicitly and supersedes the initial 88-card measurement. It tests capacity
beyond any legal hand without imposing a new gameplay cap. Exact reachable maximum
still requires an executable full-deck legal-action witness; it is not proved
by the layout fixture. That requested evidence remains outstanding.

Fixture commit/reconnect uses versioned local session storage, not a claim of
database receipt/recovery qualification. Financial/recovery/full-match proofs
are deliberately not implemented before interaction acceptance.

Canonical AudioManager and card-swoosh cue are wired to accepted fixture flights,
with offline-only preferences and a review mute control. No profile access occurs.
The mounted shared celebration owner is retained; no fixture fabricates a match
winner or payout from a single hand going out.

## Validation recorded October 20

- 82 tests in seven focused files pass: 21 Canasta boundary fixtures plus standard
  card-face, hidden/masked rendering, highlights, Joker and manifest regressions.
- App TypeScript and `dev/canasta/tsconfig.json` pass using installed TypeScript.
  `tsgo` was unavailable; no tool or dependency was installed.
- Isolated Vite production bundle passes. This is a local build, not a deployment.
- Browser interaction verified: one duplicate remains selected after sorting;
  Joker reassignment produces two drafts and flags the now-invalid two-card
  source group; frozen pickup rejects 30 against a 50 opening, accepts the
  added three aces and retains the countdown; final discard legally ends the
  two-canasta fixture; reconnect retains 30 committed cards/revision 2 while
  clearing an unsubmitted draft.
- `evidence/canasta-mobile/layout-matrix.json` records actual DOM measurements.
  `capacity-104-matrix.json` adds ten final capacity checks, with and without
  safe-area envelopes. The earlier 88-card rows remain labeled historical
  intermediate measurements rather than being silently rewritten.
  Five iframe viewports: 320×568, 375×812, 430×932, 812×375, 932×430.
  One shell, distinct physical IDs, 52×approximately 90 CSS-pixel card targets,
  no document-level horizontal overflow. The workspace scrolls inside row four.
  Safe-area envelopes reserve explicit test chrome; physical Safari's native
  safe-area and touch behavior remain owner acceptance, not claimed here.
- Compact/landscape arrangement requires vertical workspace scrolling plus a
  horizontal hand strip. This is intentionally presented for interaction review,
  not declared an accepted final interaction.

## Acceptance and release gates

- Frozen contract: `CANASTA_CONTRACT.md`.
- Focused unit evidence and rendered evidence: recorded below when run.
- Owner interaction review: PENDING.
- Exact maximum-hand reachability: PENDING.
- Full gameplay/authority, bot matches, privacy, concurrency, recovery,
  both-money financial rollback, terminal and production qualification: MISSING.
- Production admission: CLOSED / no Canasta admission added.
- No production publish at this checkpoint.
