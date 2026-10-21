# Canasta / 1 — approved contract, October 20, 2026

Authority: Jeremy's attached implementation approval in the Canasta workstream,
including the legality correction. This freezes the launch specification, not
production activation. Jeremy subsequently accepted the rendered appearance and
authorized local authority integration, preserving closed admission and no release.
See `CANASTA_AUTHORITY_CHECKPOINT.md` for progress and remaining gates.

## Version and rules

`canasta-classic-two/1`: exactly two UUID participants, human/human or human/bot,
multiplayer only. Two 52-card decks plus four Jokers, unique opaque physical IDs.
Fifteen-card hands; draw two, optionally meld, discard one. Two canastas to go out;
both may be completed in the final turn. Going out by melding everything without
a discard is allowed. Rotate dealer between hands. No partnerships or variants.

Controlling source: [Pagat Classic and two-player amendments](https://www.pagat.com/rummy/canasta.html).
Supplement: [Bicycle](https://bicyclecards.com/how-to-play/canasta)'s one-card
hand/one-card pile prohibition. Conflicts resolved in the approved addendum:
black threes block only, initial black-three upcard stays, frozen natural pair
may merge into own existing rank. Do not import Bicycle's persistent black-three
freeze or covering all initial threes, nor
[Winning Moves](https://winning-moves.com/images/Canasta_rules_2023.pdf)' natural-majority restriction.

Ordinary melds: rank 4 through A, at least three cards, at least two matching
naturals, at most three wild cards. Twos and Jokers are wild. One meld per rank
per player, merged when extended. No all-wild meld. Seven or more is a canasta;
extension is allowed; adding a wild changes a natural canasta to mixed.
Committed wild allocations cannot be rearranged. Three or four black threes,
without wilds, may be melded only as part of legally going out.

Opening thresholds from signed cumulative score frozen at hand admission:
negative 15; [0,1500) 50; [1500,3000) 90; >=3000 120.
Combine multiple valid opening groups. Only cards from hand and the qualifying
top discard count; no buried cards, red-three bonus, or canasta bonus.
Going out concealed after stock draw waives the opening threshold, still
requires two canastas, and requires the whole initial meld in that turn.
Concealed exit using a pickup must meet the opening threshold.
Exposed red threes alone do not count as a prior meld.

Scoring: Joker 50; A/2 20; 8–K 10; 4–7/black three 5.
Melded values minus remaining-hand values; natural canasta 500, mixed 300.
Going out 100, concealed going out 200 total. Red threes 100 each or 800 for
all four, credited if any valid meld was made, otherwise debited.
Hand and cumulative totals are signed. Evaluate 5,000 only at the completed
hand boundary; higher qualifying total wins. Equal qualifying totals create
exactly one successor hand under the existing roster/config/stake.

## Pile and exhaustion

- Global freeze: any buried/visible wild, or initial red three. Cleared only
  when the entire pile is taken. Later discards never erase it.
- Personal freeze: until valid initial meld. Opening removes only that
  player's personal restriction.
- Top wild or any three blocks all pickup. Black three has no effect once
  covered, except an independent pre-existing freeze.
- At setup cover wild/red-three upcards until neither; black three may remain.
- Red threes from deal/stock are exposed and replaced while stock permits.
  Red threes acquired in the pile are exposed without replacement.
- Frozen/unopened pickup: two matching natural physical cards from hand plus
  natural top. Unopened additionally meets opening threshold.
- Opened/unfrozen pickup: natural pair; matching natural + wild; or add top
  directly to own existing rank. Qualifying meld commits with whole-pile transfer.
- One-card hand cannot take a one-card pile.
- Exhausted stock: mandatory legal pickup when unfrozen top matches own meld.
  Otherwise player can decline an optional pickup and end/score without out bonus.
- One ordinary final stock card is a completed draw. Final pair with one
  ordinary and one red three is also a completed draw; expose the red three.
  Lone final red three or final two red threes ends immediately, no meld/discard.

## Clock, inactivity, legality correction

120 seconds from server-owned actionable turn admission to final submission.
No selection/draw/pickup/meld/sort reset. Server lock then fresh timestamp:
new command before deadline only, equality expires. Completed duplicate receipt
returns even late. Same turn/hand/deadline-generation identity fences recovery.

Real-money human timeout pauses through canonical inactivity controls.
Fake-money automatic completion only while another human remains active.
All-human inactivity guard runs first; human/bot therefore pauses on human expiry.
Normal pause retains remaining budget. Authorized return/resume after expiry
rearms 120 seconds once per pause episode, recorded durably.
Automatic mode uses canonical indicators/Take Back Control; next-match sit-out
never removes a participant between internal hands. No timeout forfeits/payouts.

Mechanical completion ignores all unsubmitted drafts and preserves committed
draw/pickup/melds. Before draw, stock draw normally; after draw/pickup, no redraw.
At exhausted stock take only mandatory legal pickup, otherwise end exhausted hand.
Sort legal discard candidates by A,2,3,...,K,Joker; then clubs,diamonds,hearts,spades;
then physical ID bytewise. Never evaluate strategy or invoke the strategic bot.
If no discard, only the sole remaining card may join an existing meld to legally
complete going out; choose lowest destination rank when ambiguous.
Otherwise preserve the state and pause for recovery.

**Legality is independent of timeout completeness.** Never reject a historically
legal pickup because the mechanical completion policy cannot finish it. The
checkpoint's pickup predicate proves qualification only; full legal continuation
and stock-state reachability require the subsequent authority work. An unresolved
historical rule conflict must be reported, not silently changed.

## Authority and financial envelope after mobile acceptance

Single version-dispatched pure rule module consumed by server authority; UI
advice is nonbinding and never a second engine. Server authenticates UUID roster,
private hand, command identity, frozen version/config and expected revision.
Secure shuffle and opaque IDs remain server-only; no hidden stock/opponent
information in projections or strategic bot inputs.

Fixed positive accepted match stake S. Exactly +S winner / -S loser through
canonical financial transfer/journal owners, in the same transaction as
settlement receipt, immutable result, balance snapshots and terminal disposition.
No per-hand financial writes, per-point formula or separate wallet. Ties have
no payout. Preserve Ante Up and fresh Run Back consent.

After approval of interaction: private state/RPC adapters; authoritative complete
rules and secure deal; bounded strategic bots; canonical timers/pause/rejoin and
zero-client worker; exact-once financial integration and rollback proofs;
terminal hold → Session Ended, fresh ended reconnect → lobby. Production-first
validation only after full automated gates; admission remains closed until qualified.
