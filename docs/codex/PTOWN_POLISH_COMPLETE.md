# P-Town polish complete — November 8, 2026

## Scope and precedence

Jeremy explicitly requested implementation of `ptown-polish-complete.zip`.
`CODEX-HANDOFF.md` takes precedence over `EARLIER-SMOKE-CHECKLIST.md`.
Work starts from published main `02fbb633d8709451b1a67afa44284e400e3a1681`;
the older dirty six-card-golf worktree is untouched.

The earlier checklist is already on main: standard Rules sections, both Drop
carry confirmations, Voyage manual opening/automatic rounds/roll warnings and
bank offers, Chucky rabbit/final-fold continuity, and Horses square dice/manual
third banking. Those behaviors are retained. New scoring and art below supersede
the corresponding earlier requirements.

## Owners and corrections

- Words: canonical move history supplies a reserved Last label under each player.
  Only the scorer's label clears during the existing presentation; their old total
  remains until +points lands. Pass/exchange do not replace the last scored word.
  Reload uses history without creating another score owner.
- Async Words: deployed migration `20261106150725` already admits the shared
  `ptown-words/2` rules: 180,000 ms, two 180,000 ms banks, and a separate 36-hour
  availability deadline. Creation freezes this config; acceptance/deal and
  `begin_turn` carry it forward. The observed active older /3 match was created
  November 6 at 02:17 UTC, before that migration. Existing /3 matches retain their
  frozen clockless rules. Generic async help incorrectly still defaulted to /3;
  it now explains current /2 clocks and explicitly preserves historical /3 help.
  No historical matches were rewritten.
- Speaker: AudioManager owns one shared one-second cooldown. Preference/icon
  change immediately on the first accepted gesture; all placements share it.
- Account access: session restoration and account RPCs previously had no bounded
  wait; auth event work could also enter the auth lock. Each wait now expires at
  ten seconds with in-place Retry. Auth callback work runs outside the callback;
  duplicate checks coalesce, obsolete results cannot win, and the URL remains
  intact. A cold launch never admits unchecked/pending/suspended accounts.
  Previously verified mounted games retain the existing transient-refresh policy.
  This fixes the demonstrated unbounded wait boundary; no physical device trace
  established the precise cause of the original one-minute stall.
- Drop: /5 reuses the accepted /4 partial-carry authority. Only three positive
  lane scores earn 500. The five-card pair-of-jacks case remains zero and can
  carry onward. The canonical result drives announcement and audio. The added
  four-second result phase counts 0→500, holds +500 for two seconds, then runs the
  existing tally. Third-round results stay until Back to Leaderboard; navigation
  neither submits nor settles a score.
- Voyage: presentation-only flights move new 6/5/4 qualifiers sequentially into
  Ship/Captain/Crew. Each arrival has one ding. Flight coordinates/scale come
  from source and canonical board targets. Remaining dice center as a group.
  Each accepted bank has a distinct 320 ms confirmation, before the existing
  third-bank tally. Recovery/identity changes retire transient flights.
- Horses: /4 freezes the exact approved five-by-five matrix, 180,000 ms duration,
  1.30/1.10/1.00 roll factors and 1.20 natural factor, rounded once. The largest
  meld then highest rank selects the result. Five actual ones has base 2,600 and
  is natural. Jeremy selected option 1: keep the matrix and permit the two Roll 3
  rounded ties (natural pair 3s vs wild pair 4s = 52; natural pair 5s vs wild pair
  6s = 76). Old /1–/3 rules remain available. Manual bank, ranked label/Natty badge,
  full-width canonical dots, and Roll (1)/(2)/(3) use server projections.
  Felt copy is exactly “Early Bank Bonus”, “Roll 1 +30% · Roll 2 +10%”, and
  “Natty earns +20%”.

## Artwork

The three supplied final 1466×564 PNGs are used directly, including the larger
Voyage title/smaller captain, gold 1 and two ivory 6s, and seven-pip 7♣. The clean
trackside/deck PNGs are static backgrounds with live controls. Shared ArcadeTile
adds the same thin muted gold outline only to Originals; its Rules control remains
a separate sibling of the game link. Regular Arcade artwork/CSS/layout are retained.

`public/arcade/approved-v1/` contains the three `*-final.png`,
`horses-blitz-trackside.png`, `ship-cap-voyage-deck.png`,
`chucky-showdown-clean.png`, and `crib-lab-clean.png`.
The latter two were made with ImageGen edit mode from existing
`chucky-showdown-a-960.webp` and `crib-lab-960.webp`. Edit instructions removed the
baked Original badge/ribbon and frame/info decorations for live shared overlays,
while retaining titles, characters/cards, colors and composition. They were
visually inspected before copying. No standard Arcade images were regenerated.

## Verification

All automated browser runs use desktop Edge with touch/phone viewport emulation,
real application components and disposable PostgreSQL authority. They are **not
physical iPhone tests**. Gameplay fixtures are local; hosted proofs roll back.

| Path | Evidence |
|---|---|
| Words both perspectives, label/score landing, history/pass | Component tests; Async browser restores CAT after opponent presentation |
| Async create → accept → handoff → banks → reload/rejoin | `dev/ptown-polish/words-browser.mjs`; each bank adds exactly 180,000 ms; observer cannot start clock; zero-client timeout passes |
| Speaker first/double tap, cross-placement remount | Shared button/AudioManager tests |
| Cold auth/access stalls, Retry, retained match query, late result, suspended account | AccountAccessGate tests; physical push launch pending |
| Drop all three rounds, zero Jacks and qualifying 500, 2-second hold, final route, reload/one receipt, carries and timeout | `drop-browser.mjs`; six layouts, audio order, local SQL receipts |
| Voyage all 9 banks, 9 qualification arrivals, 3 bells, manual openings, automatic rounds, final/reload/mute | `voyage-browser.mjs`; five playing/final viewport sizes |
| Voyage changed offers, mid-count bank, 3/2/1 warnings/reduced motion | Same runner with `--offers` |
| Horses exact offers 33/99/119/312 and five ones 4056 | Direct SQL rules proof, all rank/meld precedence checks with approved rounded ties |
| Horses 180-second duration, full-width dots, exact copy, square dice, next-roll labels, manual bank3, rising/falling offers, current Rules | `horses-browser.mjs`; 320/375/390-wide layouts |
| Earlier Chucky rabbit and last-fold continuity | `chucky-browser.mjs` |
| Lobby banner aspect ratios, 44px Rules hit targets, independent navigation, gold outlines and unchanged regular tiles | Browser screenshots, shared tile tests and scoped source/art review |

151 focused tests pass. TypeScript and the production Vite build pass. The full
unit run found 14 pre-existing failures and three uncaught mock errors in five
unchanged files; the same failures reproduce on base main. Five change-affected
Words assertions were updated and pass. Full-suite green is not claimed.

Nine complete hosted candidate rollback proofs passed, then migration
`20261108172927_ptown_polish_complete_versioned_rules` was installed with new
admission disabled. The same nine installed rollback proofs pass: new rules,
old Horses /3, Drop /1–/4, immutable receipts, duplicate/late replay, ownership,
recovery/continuation/terminal and nonfinancial isolation, plus existing Async
Words real/play-money winner/tie settlement/clock proofs. Existing receipt/result
constraints were inspected. No production history or balances were changed by
qualification. Supabase CLI was unavailable; the installed MCP migration API
created the migration version, which was then mirrored locally.

A single read-only Terra Medium review found no material defects. Local evidence
is under `qualification.local/ptown-polish`, `drop357/browser-partial`,
`ship-cap-voyage/browser`, `horses-blitz/polish-browser`, and `chucky-v2/browser`.

## Release and reversal

`ptown-polish-complete-2026-11-08` records the release commit.
The corresponding `-verified` annotated tag records deployment, public manifest,
release signal and rules admission evidence. `supabase/ptown-polish/activate.sql`
requires that exact publication SHA, qualified Horses authority/config and healthy
recovery before activating Drop /5 and Horses /4. Old runs remain pinned and old
leaderboards separate. To reverse admission, select Drop /4 and enable Horses /3;
retain all new functions for in-progress /5 and /4 runs.

## Physical iPhone acceptance — all pending

No path was verified on a physical iPhone in this task. Jeremy's acceptance pass:

1. Cold/open-from-background async push. Delay account verification beyond ten
   seconds, Retry, and confirm the intended match opens without another push tap.
   Check normal account suspension/pending behavior as well.
2. Words from both players: old Last label clears only for scorer, +points lands,
   then total/Last changes. Reopen; pass/exchange. New Async invitation, acceptance,
   handoff, two banks and reload; compare a frozen old match.
3. Double-tap speaker across lobby/game placements; first tap changes Sounds and
   icon immediately, second within one second has no effect.
4. Drop: zero-score Jacks board versus three scoring rows; hear/see 0→500, hold,
   then tally. Finish round3, wait, Back to Leaderboard, reopen the saved result.
5. Voyage: inspect deck pre-roll/qualification/cargo, multiple qualifiers in order,
   each landing ding, all three bank confirmations, and next-round manual opening.
6. Horses: read the exact notes on a narrow iPhone, full dice-width three-minute
   dots, exact sample offers, Roll sequence and manually bank the held third roll.
7. Lobby: all three final banners, seven club pips, no Original badges, consistent
   thin outline, independent Rules/entry taps, standard Arcade unchanged.
