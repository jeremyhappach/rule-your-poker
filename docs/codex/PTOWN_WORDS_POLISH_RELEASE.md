# Ptown Words polish release — 2026-10-27

Owner accepted the local smoke except rack taps zooming the board and explicitly
approved production publication with fake-money eligibility for all players and
no expiration. This supersedes the publication hold in PTOWN_WORDS_POLISH_LOCAL.md.

## Scope and authority

Rack clicks/taps select only, preserving overview or the current detail camera.
Direct board taps own zoom and placement. The approved gesture, reveal, invalid
word, rack shuffle, score/HUD and Exchange refinements ship together. Tile points
remain separated from letters at the bottom-right corner. One modest bot policy
uses the licensed SCOWL common-word subset of ENABLE2K; human validity continues
to use full ENABLE2K. No hidden opponent rack or bag order reaches the chooser.

Turn time is still 180000ms. New matches freeze the presentation configuration;
the next full turn starts after the committed word reveal. Existing matches keep
their frozen behavior. Settlement remains atomic and immediate; terminal visual
release respects the reveal. Canonical recovery and financial ownership remain.

The prior deployed capability advertised real-money human play. This release
explicitly closes it: catalog moneyModes is fake only, capability version 3
requires a fake session, and configure/start reject real money with SQLSTATE
42501. Existing active eligible profiles need no admin role, allowlist or expiry.
Inspection found no active real-money Words matches.

## Hosted qualification

Project xvhmbuppghwmwpwrkzao. Guarded migration 20261027170439 records exact
preimage hashes for seven changed function owners. It installs presentation and
casual bot policy, the private licensed vocabulary and fake-only admission guards.
It closes admission/bots during frontend publication without stopping existing
match authority. No earlier migration was repeated and no live match was edited.

Candidate and installed rollback proofs PASS. Core rules, 2/3/4-player winner/tie
cases, actual canonical chips and balanced ledger transfers, duplicate/replay/
late replay, injected transfer failure rollback, authorization/stakes, continuation,
terminal state, bot recovery and private information boundaries are exercised.
Recovery calls are scoped to synthetic dealer UUIDs; global recovery dispatch
state is not changed. Additional authenticated ordinary non-admin cases prove
fake admission, real configuration rejection, real start rejection and anonymous
capability rejection. All synthetic fixtures rolled back. Installed release flags
were verified enabled=true, admission_enabled=false, bots_enabled=false.

Source: dev/ptown-words/prepare-polish-release.mjs and fake-only-proof.sql.
Captured preimages: dev/ptown-words/polish-release-preimage.json. Existing local
concurrent-connection proofs and browser evidence are retained with the polish
checkpoint. Production activation requires passing frontend gates, exact-SHA
Vercel READY/public manifest and the canonical release-publication signal.

## Smoke

TypeScript PASS. The full source run had 3004 passing assertions and two lazy
rule-panel loading timeouts (Battle31 and legacy Royal Flash); both untouched
files pass together on focused rerun, all 9 tests. No test timeout or unrelated
product code was changed. All 241 harness assertions and the production bundle
PASS. Browser and hosted qualification results below complete the release gate.

Phone and desktop browser checks PASS: mouse/touch rack selection leaves zoom
unchanged, direct board tap zooms without placing, detail selection retains camera,
touch pan/double-tap, editable/rejected drafts, shuffle identities, bot reveal,
Exchange confirm/cancel/focus, reduced motion and reconnect. Layout checks cover
320x568, 390x760, 844x390 and 1024x760, with 44px actions and no page errors.
Evidence: `dev/ptown-words/evidence/polish-pass-browser.json`.

Security advisors were reviewed. Private vocabulary intentionally has RLS enabled
with no client policy and revoked client privileges; only server authority reads
it. Existing authenticated SECURITY DEFINER RPCs retain explicit actor/session
checks, proven under the actual authenticated role. No new public RPC was added.

At a fake-money table add at least one bot, select Words, ante up and play/pass.
Rack taps must not zoom; board taps zoom and then place. Check tile points,
opponent reveal, turn handoff, Exchange, reload and eventual canonical payout.
Physical production smoke remains Jeremy's acceptance step.
