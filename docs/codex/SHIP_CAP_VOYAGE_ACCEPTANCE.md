# Ship Cap Voyage — test plan and release gate

## Mandatory gameplay tests (automate when possible)

1. **Manual first roll**: entering Arcade from lobby creates Round 1 and shows unrolled dice with `Roll (1)` enabled. No RNG call, dice animation, roll decrement, or audio until the user taps.
2. **Manual round starts**: after Round 1 and Round 2 score results, `Continue` starts the next round with the shared bell intro; no first roll fired until tap. The third round uses identical treatment.
3. **Correct qualification order**: `5,4,3,2,1` initially locks nothing; `6,5,4,2,3` on one roll locks 6,5,4, exposing cargo total 5; partial locks reduce subsequent dice count from 5 to 4 to 3 to 2.
4. **No double use**: one physical die can satisfy only one qualifying role; if qualifying dice are all found on the same roll, the remaining **exactly two** dice are cargo.
5. **Locked dice invariant**: qualifying dice cannot change during a round; after qualification, only the 2 cargo dice reroll; no individual cargo die hold mechanic.
6. **Bank eligibility**: 2 has disabled bank; 3 is valid. A pending 2 at the 12th roll prevents the remaining bank and wipes the round score to 0.
7. **Roll budget**: exactly 12 possible roll actions, shared by qualification and cargo; bank action consumes 0 rolls; no 13th roll.
8. **Manual next cargo**: after banking cargo #1 and #2, no automatic reroll. Next cargo candidate appears only after explicit Roll tap. Prevent re-banking the same roll result into multiple slots.
9. **All-or-nothing**: if only 1 or 2 banks exist at expiration, round score is 0 and no provisional score is committed. All 3 banks earn full totals even if 0 rolls remain after the third cargo roll.
10. **Scoring**: for (11 at 8 rolls left), (8 at 5 rolls left), (9 at 2 rolls left), bank scores must be 770, 325, 310 and round total exactly 1,405. The bonus is calculated when Bank is tapped, not when Roll is tapped.
11. **Score count-up**: after the third bank, present all 3 banks, highlight/count them up with the existing sound sequence, and land on the exact round score. Do not skip to the next round or Arcade. Bust count-up lands on 0.
12. **Final results**: after Round 3, animate the grand score, then hold visible full 3-round scoreboard until Play Again or Back to Arcade is chosen. No lobby auto-redirect and no transient scoreboard that disappears before inspection.
13. **Sound/animation**: synchronized cup-shake dice roll and multiple-dice landing SFX; audible as permitted by global Sounds. The dice visually roll/tumble, not just numerically change. Supported haptics/rumble occur with roll/landing and respect settings.
14. **iPhone PWA**: fresh open, screen lock/resume, route changes and background/foreground do not trigger an extra roll or leave sound context suspended after the next authorized gesture. Verify muted and unmuted operation.
15. **Bank UI**: active cargo total, base, remaining-roll bonus, bank value and 3 manifest slots are prominent at phone width; zero duplicate round-number labels or numeric timers; minimal helper copy; bottom controls not clipped.
16. **Info affordance**: lower-right gold info visual opens current game rules on tap/click and has suitable touch target; no second duplicated info icon.
17. **Naming/placement**: Arcade lobby tile says `Ship Cap Voyage`, falls into the existing Originals section if sectioning is implemented, but tile art itself has no Originals badge; top-right gameplay affordance says `Abandon` exactly.
18. **Leaderboard**: store only completed-game scores exactly once; show timestamp and existing 30-day/all-time views; no leaderboard submission when abandoning and no duplicate submissions on resumed result.
19. **Mobile responsive**: iPhone portrait baseline and Android portrait; validate 2-column Arcade tile and landscape art crop, safe areas, no overflow or cut-off of the info icon.
20. **Real-money protection**: no modifications to current active live/async real-money flows, session lifecycle, balances, or notification systems to ship this Arcade-only game.

## Edge-case matrix

| Input/state | Required result |
|---|---|
| First roll has 5 and 4 but no 6 | Neither locks |
| First roll has 6+5+4 | Locks all 3 in order, remaining 2 form first cargo |
| Qualification reached on roll 11 | Only 1 roll remains, so impossible to complete all 3 banks; show legitimate failure behavior; no phantom banks |
| Cargo dice = 1+1 and >=1 roll left | Bank disabled; next player-controlled roll allowed |
| Cargo dice = 1+1 and no roll left | Round busts (zero) unless all 3 had already been banked |
| Third eligible cargo on roll 12 | Bank enabled with +0 unused-roll bonus; completes round |
| Bank#2 with 0 rolls left and bank#3 empty | Round eventually scores 0; no automated dice roll |
| User double taps Roll during animation | Consume 1 roll and apply 1 RNG result only |
| User double taps Bank | Create 1 bank only; single score transition |
| User backgrounds app while score counting | Restore to consistent result; avoid duplicate sound/score submission |
| User abandons | Match shared abandon/confirm routing; no `Abandon Run` text |
| Player mutes before opening | No audio, gameplay unaffected, compatible haptics setting |

## Release criteria

Do not merge or publish until all gameplay tests pass, real-device iPhone/Android checks are reported, and the user approves a production-safe release window. Deliver branch/commit, preview, portrait screenshots of each stage, test evidence, and known limitations. Existing live games and balances must remain untouched.
