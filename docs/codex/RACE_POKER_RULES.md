# Race Poker / 1 — approved Ptown adaptation

Jeremy approved implementation on 2026-10-20, including 30-second hands and no replacement after selection five. This is the Ptown contract, not a claim that unresolved historical Merit rules have been recovered.

Multiplayer only: exactly two admitted participants, at least one human, two horses. Canonical setup offers an editable integer stake; canonical participant consent precedes the frozen roster, rules, stake and money mode. Race points never substitute for canonical chips.

Each paired round gives each participant one hand. Initial starter is uniformly random; the starter alternates every paired round. Both start at zero. After both hands and their result intervals, finish if either total reaches 48,000, or after paired round 16. Highest cumulative score wins; overshoot remains in scores and horses visually clamp at the finish. First-actor target crossing announces Final hand, never a premature winner. Equal totals draw with no secondary tiebreaker and zero net stake transfer.

Each hand independently shuffles a fresh standard 52-card pack. Three choice slots draw from that one pack. Each selection irreversibly adds one card to the hand. Only selections one through four refill the chosen source; unchosen sources persist within that hand. Selection five scores atomically without reading or revealing another card. All cards are discarded at the hand boundary. No jokers, duplicate exact cards, five of a kind, undo, pass, discard or redraw.

One authoritative 30,000 ms deadline per hand; choices never extend it. The lock-time clock rejects new choices at or after the deadline. Prior accepted request identities return their immutable original receipt, including after completion. Incomplete expiry earns zero and discards the hand. Each hand is followed by exactly 2,000 ms of result time, with no hand clock. Authorized canonical pause preserves remaining time; help and disconnect do not pause. Database recovery advances deadlines, results, bots and terminal flow without browsers.

| Best category | Award |
|---|---:|
| High card | Maximum rank × 100 (J11/Q12/K13/A14) |
| Pair | 4,500 |
| Two pair | 6,700 |
| Three of a kind | 9,000 |
| Straight | 12,000 |
| Flush | 15,000 |
| Full house | 18,700 |
| Four of a kind | 22,500 |
| Straight flush | 28,500 |
| Royal flush | 37,500 |

Wheel and Broadway are valid; ranks never wrap. Fixed categories ignore kicker, rank and suit strength. Only the best category pays. No speed, time, streak, comeback, winner or finishing bonus. Duplicate-card hands are rejected.

Authority is `private.race_poker_execute`; humans, durable bots and recovery use its locking, revision and receipt contract. Only the public state projection reaches clients. Active cards, choices, scores, actor, clock and committed history are public; hidden deck order never is. The bot policy receives only current public hand and choices. `race-poker-bot/1` evaluates 48 hypothetical continuations per choice, independently of the real hidden deck; its strategy version is separate from gameplay rules. Work is persisted with a 750 ms minimum delay between choices.

Presentation uses the canonical fullscreen shell and interaction layer, two original horse/jockey drawings, accepted-card animation of 180 ms, one-second score/horse motion inside the two-second result interval, and original synthesized cues. Global audio preference and reduced-motion preference remain authoritative for presentation. Reconnect seeks current state rather than replaying accepted card arrivals.

Historical context: Merit Race Poker is the inspiration. The [recording](https://www.youtube.com/watch?v=10hQvT2SvmU) and original short operator description did not establish the exact original deck model or numeric finish threshold. The approved 48,000-point target, paired-round fairness, 16-round cap, fresh single-pack hands and 30-second deadline are deliberate Ptown adaptations.
