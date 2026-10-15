# TriTowers: selected rules and release contract

TriTowers is a sequential competition: each seated human finishes their entire
two-stage game (including an earned bonus stage) before the next human starts.
Order is clockwise: next lower occupied seat after the dealer, wrapping; dealer
last. Each stage receives a new independent, server-shuffled 52-card deck.

## Primary evidence

- [Merit Game Descriptions, 2010](https://www.meritgames.com/Support_Center/GAMEDESCRIPTIONS.PDF): clear three towers by removing cards one rank above or below the waste; draw when a run ends. Face-up play is an optional variant.
- [Merit Tournament Megatouch, PM8804-0B, 1996, page 1](https://www.meritgames.com/Support_Center/manuals/TOURNAMENT.pdf): standard Tri-Towers has **two rounds**; the tournament product has four. We select the standard length.
- [Merit XL 6000, PM0189-06, 1999, page 5](https://www.meritgames.com/Support_Center/Mega%20XL/manuals/pm0189-06_Megatouch%20XL%206000%20Manual.pdf): bonus qualification is 80,000 points normally or 64,000 in Easy Mode. The separate 125,000-point *free replay* threshold is not a bonus-stage threshold.
- [Merit Blue Maxx operator manual](https://www.betsonparts.com/media/hbi/service-manuals/95/megatouch_blue_maxx.pdf): face-up selection and continuous bonus rounds are operator options. We do not enable either.

The available original manuals do **not** establish the complete numerical
score table, exact timer, ace wrapping, stock penalties, or continuous-bonus
formula. Contemporary lookalikes conflict and are not treated as original
authority. This is an explicitly versioned PTown adaptation, not a claim of
ROM-exact reproduction. Phase 3B enables production fake-money acceptance for
active approved accounts. The assumptions below still need hands-on acceptance;
real-money activation remains closed.

## `ptown-tritowers/1` configuration

| Rule | Selection | Evidence status |
|---|---|---|
| Tableau | 28 cards in rows 3 / 6 / 9 / 10; each covered card requires its two children removed | Task requirement and classic structure |
| Visibility | Bottom ten initially face up; expose parents only after both children removed | Task privacy requirement |
| Stock | One initial waste, 23 draws, no recycling | Explicit adaptation assumption |
| Adjacency | One rank higher/lower, suits irrelevant; A wraps to K and 2 | Wrapping is an explicit assumption |
| Run score | nth consecutive removal earns `1,000 × n`; drawing resets n to zero | Explicit assumption, isolated in config |
| Peaks | First/second/third peak removed add 5,000 / 10,000 / 15,000 | Explicit assumption |
| Clock | 120 seconds per stage; clear bonus `100 × whole seconds remaining` | Explicit assumption; server clock only |
| Stages | Two standard stages, regardless of clearing the previous one | Two-round count verified; continuation policy assumption |
| Bonus | One third stage if cumulative score after stage two is at least 80,000 | Threshold verified; one-stage cap selected |
| End stage | All cards removed, or stock empty and no legal exposed move | Explicit selected rule |
| Abandonment | 30-second Ready deadline; timeout or Give up ends that player's entire turn, retaining earned score | PTown multiplayer policy |
| Interstage | Five-second result hold; active player may Continue sooner | Presentation/continuation policy |
| Undo / wildcards | None | No unverified extra mechanics |

The server persists each completed player's score once. No chips move for an
individual stage or player. After everyone finishes, all highest scorers share
the losing players' stakes; whole-chip remainder follows the existing clockwise
split helper. An all-player tie transfers nothing. This is the PTown multiplayer
wager policy, not an original arcade rule. Existing signed session chip accounting,
transfer journal, game results and final snapshots are reused; no separate wallet.

Hidden tableaux and undealt stock never appear in snapshots or public events,
even for the active player. Spectators receive the same visible board but cannot
act. History contains only exposed snapshots/events. Reconnect reloads authority;
request UUID + exact dealer-game/revision reject duplicates, stale and concurrent
actions. A game-specific database recovery function owns abandoned deadlines.

Production fake-money admission is enabled by Phase 3B, with a `tri-towers`
catalog entry and server-side approved-account checks. Real-money setup is
rejected. Rules and multiplayer acceptance remain pending; see
`TRITOWERS_ACTIVATION.md` for installation evidence and owner steps.
