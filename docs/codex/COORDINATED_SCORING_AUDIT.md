# Coordinated scoring audit — November 9, 2026

Frozen versions: `horses-blitz/5` and `357-drop/6`. Gameplay orchestration, RNG, holds, carries, animations and audio retain their existing owners. This document records qualification; production identity belongs in the release record.

## Horses Blitz

Exact finite-horizon dynamic programming covers all 7,776 ordered outcomes, compressed to 252 permutation-equivalent states. Every legal hold is represented by one of 462 hold multisets. Transition weights are exact integers; the largest arithmetic stays below JavaScript’s exact integer limit. Bank values round once after both multipliers. Every Roll 1 and Roll 2 decision optimizes subsequent rolls and banking. Roll 3 is the terminal offer. All 756 state/roll offers match PostgreSQL.

| Base | 2s | 3s | 4s | 5s | 6s |
|---|---:|---:|---:|---:|---:|
| High card | 25 | 25 | 25 | 25 | 25 |
| Pair | 35 | 43 | 52 | 63 | 76 |
| Trips | 506 | 538 | 562 | 563 | 566 |
| Quads | 605 | 662 | 666 | 668 | 669 |
| Five | 803 | 855 | 865 | 868 | 880 |

Bonuses remain as proposed: Roll 1 +25%, Roll 2 +10%, natural +20%, five actual ones base 1,600, completed-round time 15 points per whole second. The supplied table has up to **+67.50%** chase advantage for strong hands (wild-assisted three 2s on Roll 1). Flattening the rank ladder and reducing the upper five-kind payouts closes rank-switching exploits, including keeping wilds and switching ranks.

Across 1020 strong-hand decisions over zero-time and both whole-second phases of a 1.5-second roll, the final deviation is **-9.60% to +9.81%**. 633/1020 are within ±5%; all are within ±10%. These are equally counted decision states, not empirical play frequencies.

The required supplied-table reference is verified exactly: natural four 6s on Roll 2 banks 950 and rolling averages 933.5 before time. Under the adjusted table, bank is **883**, chase **858** before time (−2.83%), or 828/843 after losing two/one whole seconds. Five 6s pay 1,056 natural or 880 wild-assisted; remaining natural four 6s pay 803.

Timing is exact for the final hand and the marginal clock value conditional on completing an earlier round. The existing 1.5-second animation and whole-second flooring are included. Near deadline, banking is deliberately favored; the one-second-left and three-second-latency sensitivity cases are retained in the JSON and excluded from the neutrality target. This is not a model of a player’s full ten-hand motor time or an assurance of neutrality during network stalls. No gameplay timing changed.

| Roll | Meld | Natural | Rank | v4 zero-time chase range | Proposed range | v5 zero-time range | v5 1.5s range |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | Trips | Yes | 2 | 181.46…304.67% | 16.00…44.89% | -4.27…-4.27% | -8.37…-6.39% |
| 1 | Trips | Yes | 3 | 170.52…232.24% | -1.85…22.60% | -3.16…-3.16% | -6.90…-5.04% |
| 1 | Trips | Yes | 4 | 169.80…173.67% | -3.85…3.94% | -5.21…-5.21% | -8.77…-6.99% |
| 1 | Trips | Yes | 5 | 166.59…166.59% | -3.71…-3.71% | -5.21…-5.21% | -8.76…-6.99% |
| 1 | Trips | Yes | 6 | 162.46…162.46% | -3.65…-3.65% | -5.13…-5.13% | -8.75…-6.98% |
| 1 | Trips | Wild | 2 | 349.79…383.68% | 57.73…67.50% | 8.86…8.86% | 2.37…3.26% |
| 1 | Trips | Wild | 3 | 268.20…295.94% | 33.49…41.76% | 5.42…5.42% | -0.03…1.28% |
| 1 | Trips | Wild | 4 | 205.36…316.43% | 13.29…28.70% | 2.00…9.81% | -3.21…4.94% |
| 1 | Trips | Wild | 5 | 198.16…239.41% | 5.03…11.62% | 2.12…9.65% | -3.09…4.79% |
| 1 | Trips | Wild | 6 | 192.84…198.36% | 4.31…4.79% | 2.20…9.03% | -3.19…4.20% |
| 1 | Quads | Yes | 2 | 43.41…43.41% | -4.30…2.01% | -5.67…-5.67% | -8.98…-7.32% |
| 1 | Quads | Yes | 3 | 43.33…43.33% | -5.04…-5.04% | -6.58…-6.58% | -9.60…-8.09% |
| 1 | Quads | Yes | 4 | 42.38…42.38% | -4.91…-4.91% | -6.41…-6.41% | -9.41…-7.91% |
| 1 | Quads | Yes | 5 | 41.63…41.63% | -4.98…-4.98% | -6.37…-6.37% | -9.36…-7.87% |
| 1 | Quads | Yes | 6 | 41.56…41.56% | -4.94…-4.94% | -6.01…-6.01% | -9.00…-7.50% |
| 1 | Quads | Wild | 2 | 60.25…135.55% | 30.28…56.46% | -1.90…2.11% | -6.31…-2.42% |
| 1 | Quads | Wild | 3 | 53.34…151.58% | 10.78…47.41% | -3.50…9.80% | -7.13…4.97% |
| 1 | Quads | Wild | 4 | 52.29…106.65% | -0.68…25.98% | -3.24…9.14% | -6.84…4.34% |
| 1 | Quads | Wild | 5 | 51.43…70.18% | -0.67…9.16% | -3.19…8.88% | -6.79…4.09% |
| 1 | Quads | Wild | 6 | 51.30…51.30% | -0.63…-0.63% | -2.45…8.75% | -6.30…3.97% |
| 2 | Trips | Yes | 2 | 110.36…151.63% | -0.33…22.28% | -1.31…-1.31% | -5.80…-3.56% |
| 2 | Trips | Yes | 3 | 108.28…108.28% | -0.61…3.52% | 0.06…0.06% | -4.17…-2.05% |
| 2 | Trips | Yes | 4 | 108.63…108.63% | -0.97…-0.97% | -2.15…-2.15% | -6.20…-4.17% |
| 2 | Trips | Yes | 5 | 106.95…106.95% | -0.94…-0.94% | -1.97…-1.97% | -6.00…-3.99% |
| 2 | Trips | Yes | 6 | 104.10…104.10% | -0.79…-0.79% | -2.07…-2.07% | -6.08…-4.08% |
| 2 | Trips | Wild | 2 | 184.54…205.65% | 39.15…50.74% | 5.69…5.69% | 0.30…3.00% |
| 2 | Trips | Wild | 3 | 132.95…150.23% | 17.74…27.55% | 6.50…6.50% | 1.43…3.96% |
| 2 | Trips | Wild | 4 | 129.10…212.67% | 6.23…22.18% | 3.89…8.61% | -0.97…6.18% |
| 2 | Trips | Wild | 5 | 125.26…154.77% | 5.54…8.11% | 3.98…8.44% | -0.87…6.01% |
| 2 | Trips | Wild | 6 | 122.22…129.63% | 3.85…5.30% | 3.80…7.74% | -1.02…5.33% |
| 2 | Quads | Yes | 2 | 33.60…33.60% | -1.89…-1.89% | -2.57…-2.57% | -6.32…-4.44% |
| 2 | Quads | Yes | 3 | 33.72…33.72% | -1.80…-1.80% | -3.57…-3.57% | -7.00…-5.28% |
| 2 | Quads | Yes | 4 | 33.06…33.06% | -1.77…-1.77% | -3.32…-3.32% | -6.73…-5.02% |
| 2 | Quads | Yes | 5 | 32.44…32.44% | -1.75…-1.75% | -3.29…-3.29% | -6.69…-4.99% |
| 2 | Quads | Yes | 6 | 32.47…32.47% | -1.74…-1.74% | -2.83…-2.83% | -6.23…-4.53% |
| 2 | Quads | Wild | 2 | 40.35…81.29% | 14.80…55.78% | 0.75…0.78% | -3.75…-1.47% |
| 2 | Quads | Wild | 3 | 40.32…117.23% | 1.55…39.13% | -0.23…7.15% | -4.35…5.09% |
| 2 | Quads | Wild | 4 | 39.61…78.44% | 1.65…18.89% | -0.09…6.42% | -4.18…4.37% |
| 2 | Quads | Wild | 5 | 39.04…46.95% | 1.57…3.60% | -0.05…6.13% | -4.13…4.09% |
| 2 | Quads | Wild | 6 | 38.95…38.95% | 1.64…1.64% | 0.45…5.98% | -3.62…3.94% |

## 357 Drop

The supplied matrix is retained without adjustments. Pair base plus twice the kicker (ace rank 15); trips base; natural +20%, rounded once. All 22,100 unordered three-card hands match SQL. Minimum trips = **800**, maximum pair after bonuses = **775**. All six requested examples pass exactly. Other rows and bonuses are unchanged.

The final audit uses **100,000 complete rounds per policy per version (600,000 rounds)**, paired deterministic shuffled decks for v5/v6, actual 52-card no-replacement dealing, 12 fresh placements, up to three passes and one/two-card inheritance. Decision functions receive only the board, current card and remaining passes, never the undealt deck. Carry selection waits until visible destination fresh cards are available, which the current rules permit. Selection maximizes the destination score among legal carries. This is reproducible policy evidence, not a proof of globally optimal strategy.

Policies: sequential fills 3/5/7 in order without passing; balanced reserves rank 3/5/7 wilds for their matching open row, builds high 3s pairs/trips while considering matching ranks elsewhere, and otherwise uses public rank/suit affinities; aggressive reserves the 3s slots for a high opener, matching/wild pair and trips, using passes on late misses. Full functions and seed are committed with the audit.

Timing scenario: 2 seconds per placement/pass, 2 seconds per carry and two 4-second presentation beats, with the existing continuous proportional time bonus. These are explicit simulation assumptions, not measured user speed. Row shares below include the full round score in the denominator, including ALL FILLED and time.

| Policy | Version | 3s avg / share | 5s avg / share | 7s avg / share | Round avg | ALL FILLED frequency / avg | Pair / trips / none |
|---|---:|---:|---:|---:|---:|---:|---|
| sequential | 5 | 49.7 / 2.33% | 326.2 / 15.26% | 1440.8 / 67.42% | 2137.1 | 11.59% / 58.0 | 33.54% / 2.79% / 63.67% |
| sequential | 6 | 165.9 / 7.31% | 326.2 / 14.37% | 1440.8 / 63.48% | 2269.5 | 11.59% / 58.0 | 33.54% / 2.79% / 63.67% |
| aggressive3 | 5 | 357.2 / 11.80% | 443.4 / 14.64% | 1684.6 / 55.63% | 3028.1 | 36.37% / 181.8 | 28.62% / 62.95% / 8.42% |
| aggressive3 | 6 | 1296.1 / 31.64% | 443.4 / 10.83% | 1684.6 / 41.13% | 4096.0 | 36.37% / 181.8 | 28.62% / 62.95% / 8.42% |
| balanced | 5 | 304.4 / 9.89% | 484.9 / 15.76% | 1712.6 / 55.67% | 3076.4 | 40.42% / 202.1 | 43.70% / 48.41% / 7.89% |
| balanced | 6 | 1052.6 / 26.73% | 488.5 / 12.41% | 1712.6 / 43.50% | 3937.2 | 40.79% / 203.9 | 47.05% / 45.06% / 7.89% |

| Policy | Inflation vs v5 | Minimum | P10 | Median | P90 | P99 | Maximum | SD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sequential | 6.20% | 0 | 620 | 2107 | 4056 | 6099 | 10898 | 1337.1 |
| aggressive3 | 35.27% | 0 | 2128 | 4031 | 6195 | 8475 | 13131 | 1644.5 |
| balanced | 27.98% | 0 | 1853 | 3842 | 6145 | 8553 | 13131 | 1696.0 |

Aggressive 3s contributes **31.64%**, not the previously suggested 28.5%. The 7s row still contributes **41.13%** and is the largest source of points. Balanced averages 3937.2, only 4.03% below aggressive (4096.0). Balanced has the higher ALL FILLED frequency (40.79% versus 36.37%). These provide a competitive alternative to a sole 3s chase strategy.

| Policy v6 | 7s no score | 7s natural | Carry includes a 7 | 7s avg change vs v5 |
|---|---:|---:|---:|---:|
| sequential | 6.26% | 41.53% | 26.08% | 0.00 |
| aggressive3 | 3.95% | 33.56% | 11.96% | 0.00 |
| balanced | 3.95% | 32.18% | 5.38% | 0.06 |

The JSON includes complete seven-row category counts, time-bonus averages, passes and distributions for both versions. Reproduce with `node dev/coordinated-score-release/drop-simulation.mjs` and `node dev/coordinated-score-release/report.mjs`. The local and hosted database proofs cover historical versions, exact receipts, replay, tampering, active-version pinning, ownership, recovery, terminal completion, tie ranking and no financial/multiplayer writes.
