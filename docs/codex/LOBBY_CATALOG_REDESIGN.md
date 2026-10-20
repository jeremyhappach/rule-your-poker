# Lobby/settings presentation catalog candidate

Date: 2026-10-20. Base: a150cd6aecc746143f246186a8b46421d0534355, fetched origin/main before implementation. Isolated branch: codex/lobby-catalog-redesign. Release is NOT approved: no merge, push, migration, gate change or deployment.

## Ownership and scope

- src/lib/gameCatalog/games contains one typed presentation descriptor per integrated game; index.ts is the composition point. Fifteen multiplayer games, seven supported Arcade games. Yahtzee's explicit disabled Arcade placeholder remains separate. Golf and other unfinished games are not registered.
- Stable IDs/defaults aliases, category, family, supported modes, active-roster constraints, bot policy, capability adapter key, development/smoke metadata, lazy rules loader, defaults editor kind, artwork key and optional geometry key are distinct. Existing presentationMode resolution and server admission/rules/stakes/settlement remain authoritative. Catalog metadata never activates a game.
- DealerGameSetup is the live owner. GameSelection had only test callers; those tests now exercise the shared DealerGamePicker and the unused duplicate was removed. The live owner retains configuration, deadlines, consent and Run Back. Game.tsx only forwards money mode at its two setup call sites.
- The canonical setup screen has no opponent subset selector. Its existing route props count non-sitting-out, non-observer, non-left participants, not the total lobby. Exact-two selection uses these props. A changed roster or closed capability disables the action; RPC validation still arbitrates races. No participant-selection policy was added.
- Defaults keeps its existing collection validation and save code, and every existing editable field key. Stakes move to the top, with secondary sections collapsed. Farkle stays mounted after first visit until close so switching games retains its independent draft. Its committed response updates the parent collection draft; its persistence adapter is unchanged.
- Rules articles were moved without rewriting rules. Mega rules modules are loaded from per-game descriptors. Current help uses existing leaderboard currentRuleset metadata then arcade_rules_help; selected history passes its exact version. Active-game imports remain compatible through re-exports and keep frozen configuration props.
- Arcade retains leaderboard routes, Play/Resume, records, history and artwork controls. Arcade route loading is deferred. Geometry Lab UI/storage/factories are unchanged; parity tests enumerate every registered descriptor.

## Verification

- Production fixture: dev/lobby-catalog/production-fixture.json contains read-only defaults and Arcade ruleset metadata. admission-evidence.json captures relevant deployed configure-RPC constraints. No player, session or financial records were read or written for fixtures.
- Full app run: 2,552 passed; two existing Run21 localAuthority recovery cases timed out at 5 seconds under parallel load. Both passed in isolation (about 2.3 and 2.1 seconds); all 18 localAuthority tests passed on rerun. No test timeout or gameplay code was modified.
- Harness suite: all 241 tests passed.
- Focused dealer/Farkle/selection checks: 56 passed. New catalog/defaults/rules checks: 24 tests, including field persistence, cancel/reopen, Farkle draft retention and saved-response reconciliation, capability failure/invalid rosters, bots, deployed parity, geometry keys, current TriTowers and legacy Royal Flash help.
- Browser verification: 56 checks using installed desktop Edge/Chromium, actual UI components and isolated in-memory adapters. Covers widths 320/375/390/430, 844x390 landscape, 1280x800 desktop, enlarged text, disabled exact-two/human-only states, expanded settings, native dropdown, all 15 rules entries, seven leaderboard links, close behavior and Info focus restoration. No horizontal page overflow or page errors.
- Screenshots: dev/lobby-catalog/screenshots. Fixture artwork is absent; existing storage rendering/upload adapters are preserved and existing artwork tests remain part of the app suite. These screenshots do not certify uploaded production artwork, physical keyboard behavior, VoiceOver, dynamic Mobile Safari chrome or safe-area values on a physical iPhone.
- Local browser harness is dev-only and aliases Supabase to memory; it cannot make production writes. Start with node node_modules/vite/bin/vite.js --config dev/lobby-catalog/vite.config.ts; run node dev/lobby-catalog/screenshots.mjs. No tools/dependencies installed; existing node_modules was shared via an isolated-checkout junction.

## Remaining acceptance and release

Production publication is deliberately pending explicit release approval. No preview deployment is required. After approval, integrate against the then-current main without overwriting concurrent game additions, publish through the established helper, and perform production-first smoke:

1. On a small iPhone, choose Cards/Dice/Other, verify full titles, eligibility, setup stake changes and non-caller Ante Up. Confirm Run Back requires fresh consent.
2. Open Defaults, switch games with unsaved edits, save an intended stake change, reopen to verify; verify Farkle separately. Do not change defaults merely to test without choosing an intended value.
3. Check Arcade artwork, each leaderboard, personal bests, existing Resume, and historical rules help. Confirm no new Arcade mode appears for multiplayer-only games.
4. Check lobby and in-game Rules at normal/large text sizes, scrolling, keyboard, focus and Safari chrome/safe areas. Check Geometry Lab selector and saved profiles remain intact.
5. Confirm an existing active/paused session resumes normally. Gameplay, scores, clocks, recovery, historical rows and finances are outside this redesign.

No stable checkpoint is claimed until Jeremy's production smoke passes.

Final validation: TypeScript no-emit check passed; Vite production bundle passed (existing large-chunk and old Browserslist-data warnings). Final focused rerun: 75 tests passed after review corrections. Browser rerun: all 56 checks passed on the final lazy-loader implementation. Existing validation/save block matched the base after whitespace normalization, and no existing editable field key was removed.
