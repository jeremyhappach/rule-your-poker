# 357 Drop — P-Town Original
Build as a solo Arcade game. Reuse the shared Arcade tile, Rules dialog, start/leaderboard, gameplay sound toggle, and top-right Abandon affordance.

## Play
Shuffle one standard 52-card deck without replacement. Show one face-up card and a face-down stock. Tap an open lane to permanently place the card in its next slot, then reveal the next card. The 3, 5, and 7 lanes hold exactly 3, 5, and 7 cards. Matching ranks are wild only in their own lanes. A lane scores and locks when filled. No swaps, replacement, or undo. Three shared passes discard the current card and reveal a new one without placing it. Pass is legal on the last open slot. A finished board uses 15 placements and sees 15–18 cards.

## Scoring
Ranks are face value, J=11, Q=12, K=13, A=15. Only the wheel uses ace low, with straight high card 5. Scores are whole points.

3 lane: pair = 10 × pair rank + kicker. Trips = 150 + 30 × trip rank. Everything else = 0. Examples: 774 = 74 before natural, 2–3–3 = 210, 3–3–3 = 600. Straights and flushes do not score here.

5 lane scores all five cards. 7 lane scores its best five of seven. Use standard poker hand ordering and tie-break vectors with royal flush and five of a kind above straight flush. The approved v1 category bases below are spaced to preserve category order even with the 20% natural bonus.

| Hand | Points before natural bonus |
| --- | --- |
| High card or one pair | 0 |
| Two pair | 200 + 16 × higher pair + lower pair |
| Trips | 550 + 10 × trip rank |
| Straight | 850 + 10 × high rank |
| Flush | 1200 + 10 × high rank |
| Full house | 1600 + 16 × trip rank + pair rank |
| Quads | 2250 + 10 × quad rank |
| Straight flush | 2900 + 10 × high rank |
| Royal flush | 3700 |
| Five of a kind | 4500 + 10 × rank |

Use remaining kickers and flush ranks to select the stronger hand within an equal-point rank band. Never encode fractional points. Evaluate wild assignments for the best poker hand first. Prefer a natural realization of an identical hand. A natural uses zero wild cards in the scoring set. A matching wild left outside the best five in the 7 lane does not disqualify the hand. Add round(0.20 × lane points) for a natural scoring hand. Zero-point hands earn no bonus. A–A–7 scores 188 natural, A–3–7 scores 157. A–A–K–9–5 in the 5 lane is trip aces with K–9 kickers. A–A–K–K–5 is wild-assisted aces over kings.

Add 200 if all three lanes score. Base is the sum of lane scores including naturals, plus that 200 when earned.

## Clock
Start 120 seconds when the first card becomes playable. On last placement lock the clock and award round(base × 0.20 × remaining seconds / 120). At timeout lock input and bank completed lanes only, with no time bonus. Show time bonus separately in the final tally. Use the existing Arcade timing and score submission patterns and validate legal actions and final scores through the existing authoritative path.

## Visual references
arcade-banner.png is the 1466 × 564 lobby asset. Use the shared Arcade banner crop and separate gold Rules button.
gameplay-concept.png is visual direction. The pictured score is illustrative and will differ under the matrix above. Use the existing Murray Baker Bridge artwork for faithful Peoria branding. Matte midnight navy, compact geometric typography, large ivory cards and teal, amber and violet lanes. Keep all 15 slots visible on mobile. Each open row is a tap target. Show only score, clock, stock, current card, PASS with remaining count, wild labels and lane results. Put instruction copy in Rules. Light the matching open row when the current card is wild there.

On a natural, sweep gold over the scoring cards and retain a small NATURAL +20% badge. Count the hand points and bonus in two quick beats. Use a subtle glint for pairs and a stronger edge accent for quads. Highlight only the selected five in the 7 lane. Presentation should never block the next placement. Respect reduced motion.

## Sound
Reuse existing cues. Soft Card Clip on reveal, Paper Slide B on placement, Run21 Pass on discard, TriTowers clear chimes by lane (3 low, 5 mid, 7 high), short chip count-up for naturals, soft Run21 give-up womp on a zero lane, identical short beeps on 3–2–1, and Winner A on the all-three-lanes tally. Sequence placement, lane result and final tally without piling them up. Respect global Sounds and verify first placement and pass on iPhone PWA.

## Build checks
Check wild scope, best-five selection, category boundaries after natural bonuses, zero-score cases, last-slot pass, filled-lane lock, timeout, timer rounding and one-time tally. Verify responsive tile and gameplay on narrow phones, and audio with sound on and muted.
