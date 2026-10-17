# TriTowers shared presentation — October 17, 2026

Approved scope: both TriTowers modes, plus explicitly selected Cartoon fronts in
both Run21 modes. HI-RUN belongs above the tableau; lower controls are upcard,
CURRENT RUN, stock. Illustrated court portraits and persistent clear badges were
approved. Jeremy's production smoke remains the acceptance gate.

## Ownership and preservation

`TriTowersBoard.tsx` is the common composition: original castle tower artwork,
cards, current/round-high streak, clear-order badges and dotted clock. Both existing
mode adapters pass the same authoritative timing/state. The 24 dots consume the
existing deadline and retain the 10%/5% warning thresholds. No timer controls
progression. The existing result hold keeps clear badges visible, without delay.
Badges look up frozen `peakBonuses` using authoritative removal order; they never
award points. Identity changes retire their animation state; reconnect is static.

PlayingCard selects `frontStyle="cartoon"` only for TriTowers/Run21. It retains
canonical validation, backs, color preferences and highlights. The ordinary front
is unchanged. Rank/suit SVG remains live and readable independently of original
court artwork. Run21 overlap exposes the Cartoon rank band without changing cards
or gameplay geometry. Assets are original imagegen illustrations, compressed to
WebP with their transparency and original dimensions preserved.

## Database projection

Migration `20261017140055_tri_towers_cartoon_presentation` adds the private Arcade
HI-RUN reader and `(run_id, revision)` receipt index. It adds an opt-in multiplayer
`tri_towers_present` envelope that delegates actions/authentication to the existing
owners. Older multiplayer clients retain their original snapshot contract. Arcade
HI-RUN is top-level metadata, leaving its existing view equality guard intact.

Multiplayer uses the maximum recorded streak for exact dealer/round/player/stage
and revision. Arcade counts only committed removal receipts between draws for
the exact round, bounded by revision. Start receipts are excluded before parsing.
No gameplay reducer, ruleset, deal, scoring, deadline, recovery worker, leaderboard,
financial writer, history row or existing game state is changed/backfilled.

## Qualification

Candidate rollback proofs cover streak/draw/reconnect/bonus reset, duplicate
requests, authorization, existing Arcade authority/isolation, winner/tie outcomes,
actual canonical chips/ledger/results, atomic failure, late replay, continuation
and terminal state. The installed Arcade/projection proof passes inside rollback.
The first installed fixture attempt rolled back on the production auto-profile
trigger; the fixture now handles its generated profile explicitly.

Only `private.arcade_tri_projection` changes among existing local baseline
functions. Installed projection hashes are recorded with the release evidence.
The full application/harness suite passes (2,308 + 241 tests), as do TypeScript
and the production build. Browser evidence is in
`qualification.local/tri-towers/cartoon-ui`; the harness uses loopback SQL/SSE,
not production transport. No automated result is owner smoke acceptance.

## Jeremy's production smoke

1. In Arcade and multiplayer, verify the crown above the tableau and the lower
   upcard / CURRENT RUN / stock order in phone portrait and landscape.
2. Build a streak, draw, then refresh: CURRENT RUN is zero, HI-RUN retains the
   prior best. Both reset at the next round, including an earned bonus round.
3. Clear towers in a non-left-to-right order. Check +5k/+10k/+15k on the actual
   cleared towers, retained through results, with no duplicate points.
4. Verify Ready, first-action full clock, dots, timeout and normal result holds.
5. Check Cartoon court/rank readability in Run21 Arcade and multiplayer, including
   stacked cards; confirm other poker fronts and selected backs remain familiar.
6. Abandon a Solo game and check Game Over/unranked. Finish multiplayer and check
   ordinary settlement, continuation and Session Ended behavior.
