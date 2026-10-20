# Classic two-player hand bound

For canasta-classic-two/1 the maximum retained, actionable hand is **71**
immediately after an atomic qualified pile pickup, and **70** after the turn's
discard. This excludes red threes awaiting automatic exposure and cards already
committed to melds. It is not a new rules cap.

## Attaining sequence

Expose all four red threes at setup and replace them. Both playable hands contain
15 cards. A keeps two aces; B keeps a third. The initial upcard sequence is all
twelve wilds (eight twos, four Jokers), followed by an ordinary card. Initial pile
13, usable stock 61. B plays first.

Neither player melds or picks up during 31 alternating stock turns. B takes 16
turns, including the final one-card draw; A takes 15. Each discards one and keeps
the reserved aces until B's final discard, which is the reserved ace.

Now A has 30, B has 30, pile 44, stock zero. At score zero, A qualifies the frozen
pile with two natural aces and the top ace: 60 meets the 50 opening minimum.
The qualifying meld commits before the remainder joins the hand:
30 - 2 + 43 = 71. A may discard an ordinary card, retaining 70. No going-out
requirement is invoked and the optional exhausted-stock pickup is legal.

The setup order can place the initial wild sequence before red-three replacement
cards: neither dealing order nor automatic red exposure prevents this arrangement.

## Upper bound

There are 104 non-red-three cards. Setup leaves 30 in hands. Only twelve wilds can
extend the initial pile's non-red count before its stopping card, so usable stock
starts at N >= 61. Red-three covers add no retained-hand cards.

Consider A immediately after a pickup. Let:

- a, b be A's and B's completed stock draws;
- p >= 1 be A's pickups including this one;
- q be B's pickups; s be remaining usable stock;
- X be the sum of (pile size minus one), counting non-red cards, over B's pickups.

A's committed melds contain at least p+2 cards: first pickup needs three and
every later pickup commits at least its top. B owns at least 15+b-1+X cards in
hand plus melds. The subtraction allows the single partial final stock draw.
No meld or going-out operation transfers B's owned cards to A.

Alternation implies X >= max(0,a-b). A B-pickup following an A-stock-turn takes
at least two non-red cards, hence contributes at least one. Only B's possible
first turn or a preceding A-pickup can avoid that contribution. Counting those
exceptions gives the stated inequality for either starting player.

Thus cards outside A's hand number at least:

  16+p+max(a,b)+s >= 17+ceil((61-s)/4)+s >= 33.

The stock relation used here is 2(a+b) >= N-s. It remains valid for partial
draws, exposed reds and stock exhaustion. Therefore A's hand is at most 71.

For an A stock draw after a previous pickup, B cannot already have taken a partial
stock draw (that would have exhausted stock). The current A turn has not yet
been followed by B, so X >= max(0,a-b-1). At least one non-red card remains in
the pile. Writing T=a+b gives outside-hand count at least:

  19+ceil((T-1)/2)+s >= 34, where T >= ceil((61-s)/2).

This bounds that acquisition phase by 70. Without any A pickup, at most 37
stock draws can increase A's initial hand, giving the loose bound 53. Melding
and discarding only reduce the hand. These cases cover all ways it can grow.

## Executable evidence and boundary

src/lib/canasta/maximumHand.fixture.ts uses the version-dispatched initialPile,
stockDraw, turnPlan and pickupError predicates. It checks 108 distinct IDs after
every move and produces the actual 71 cards used in the rendered fixture.
maximumHand.test.ts checks the sequence, conservation, invalid pair, insufficient
opening threshold, all remaining-stock count bounds and final discard.

The complete authoritative match reducer does not exist at this checkpoint.
Atomic server commands, secure dealing, exhaustion orchestration and recovery
still require their later integration tests. This fixture does not claim those
gates passed and does not implement a competing game engine.

Baseline: https://www.pagat.com/rummy/canasta.html (Classic and two-player sections).
The separate 104-card scene is an impossible-hand rendering stress fixture only.
