# Resolved card face contract

Jeremy's requirement, 2026-09-05: NEVER show a player an unresolved card face.

A face requires a real rank (2–10, J, Q, K, A), a recognized suit and no masking
flag. Hidden/private cards remain canonical backs. Missing, malformed or masked
values must never render as question marks, blank fronts or invented suits.
Face resolution does not grant visibility: the existing privacy, hand identity,
deal landing and reveal admission rules still apply. A back cannot count as a
completed face reveal.

`src/lib/cardGames/resolvedCardFace.ts` owns validation and transport conversion.
`PlayingCard` owns ordinary faces; the compact hand-history and flying transport
renderers apply the same contract. Gin/Cribbage adapters preserve mask metadata.

## Four-game sweep

| Game / surface | Finding and correction |
| --- | --- |
| Holm community | Confirmed production failure path: `approvedCommunityCards` retained two masked opening slots while the reveal count advanced. `useHolmCommunityFaces` promotes resolved slots only within the exact presented hand; known faces cannot regress or be combined with a conflicting row. |
| Holm community / Chucky flips | Object presence formerly admitted an unresolved face and could acknowledge completion. Admission/completion now require resolved faces. |
| Holm lone-player fan | An additional direct face renderer bypassed PlayingCard. It now rejects unresolved faces and waits for actual faces before reporting the tabled hand landed. |
| Gin opponent showdown | Retains the earlier `isGinOpponentRevealReady` gate; its face check now rejects all malformed/missing ranks and suits, as well as masks. |
| Gin active hand / melds / deadwood / piles / draw/discard animation | Shared PlayingCard/CribbagePlayingCard boundary rejects unresolved faces. Display adapters preserve masking metadata. Existing private-read reconciliation and draw placeholders remain. |
| Cribbage hand / cut / crib / pegging / counting | All faces route through PlayingCard/CribbagePlayingCard. Cut flip cannot consume an unresolved card as completed. Existing phase/privacy gates remain. |
| 3-5-7 hand / opponent showdown / proof transport | Faces route through PlayingCard. Opening/subsequent deal metadata now validates rank as well as suit. Wave/round identity and settlement ownership remain. |
| Four-game canonical deal transport | All four orchestrators use the same validator. Holm/Gin no longer substitute spades for an unknown suit. The flying renderer independently shows a back for an unresolved face. |
| Four-game hand history | MiniPlayingCard previously rendered rank/suit directly. It now uses the same validator and a canonical back while unresolved. |

Only the Holm cache path was tied to this production report. The other entries
are defensive gaps found in the source sweep, not claims of reproduced failures.
The developer hand-evaluation page generates real cards locally; the card-design
preview and sweep celebration use fixed literal faces.

## Required verification

- Parent cache → community row: masked opening, completed multiplayer snapshot,
  sequential real faces, one completion, stale snapshot cannot re-mask faces.
- Reveal-before-data and reconnect: backs until resolved, no premature completion.
- Exact hand change and conflicting row: no cross-hand card merge.
- Shared rendering boundaries: masked, missing and invalid data never paint faces;
  all 52 cards and both word/symbol suit representations resolve correctly.
- Source inventory check requires review for new direct rank/suit renderers and
  protects the four deal adapters and Holm cache wiring. This supplements DOM
  tests; it is not a substitute for runtime smoke.
- Production smoke: two connected players complete Holm showdown; verify cards
  3/4, next hand, Rabbit Hunt, solo Chucky, terminal and reconnect. Exercise Gin
  draw/knock/layoff, Cribbage cut/counting and 3-5-7 reveal with both deck modes.

Server cards, RPCs, financial settlement and historical data are unchanged.
