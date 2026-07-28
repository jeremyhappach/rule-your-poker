import { describe, it, expect } from "vitest";
import {
  buildAdvance357CardAssignments,
  seamForNextRound,
  cardsDealtForRound,
  newCardsPerPlayerForRound,
  type EligiblePlayer,
} from "./advanceRound";
import type { Card } from "../cardUtils";

const c = (rank: string, suit: string): Card => ({ rank: rank as Card["rank"], suit: suit as Card["suit"] });

function threeCards(a: string, b: string, cRank: string): Card[] {
  return [c(a, "♠"), c(b, "♥"), c(cRank, "♦")];
}
function fiveCards(): Card[] {
  return [c("2", "♠"), c("4", "♥"), c("6", "♦"), c("8", "♣"), c("10", "♠")];
}

/** Simple ordered deck used by tests — 20 unique cards from a synthetic pool. */
function testDeck(count: number): Card[] {
  const ranks: Card["rank"][] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const suits: Card["suit"][] = ["♠", "♥", "♦", "♣"];
  const out: Card[] = [];
  for (const s of suits) for (const r of ranks) out.push({ rank: r, suit: s });
  return out.slice(0, count);
}

const alice: EligiblePlayer = { id: "a", position: 0 };
const bob: EligiblePlayer = { id: "b", position: 1 };
const carol: EligiblePlayer = { id: "c", position: 2 };

describe("seamForNextRound / cardsDealtForRound / newCardsPerPlayer", () => {
  it("maps every seam correctly", () => {
    expect(seamForNextRound(1).kind).toBe("r3_to_next_hand_r1");
    expect(seamForNextRound(2).kind).toBe("r1_to_r2");
    expect(seamForNextRound(3).kind).toBe("r2_to_r3");
    expect(cardsDealtForRound(1)).toBe(3);
    expect(cardsDealtForRound(2)).toBe(5);
    expect(cardsDealtForRound(3)).toBe(7);
    expect(newCardsPerPlayerForRound(1)).toBe(3);
    expect(newCardsPerPlayerForRound(2)).toBe(2);
    expect(newCardsPerPlayerForRound(3)).toBe(2);
  });
});

describe("buildAdvance357CardAssignments — round-only fold semantics", () => {
  it("R1 folded player receives 5 total cards (3 carry + 2 new) and appears in R2 roster", () => {
    // Alice folded R1; Bob stayed. Both are eligible for R2.
    const prev = new Map<string, Card[]>([
      ["a", threeCards("3", "K", "9")],
      ["b", threeCards("2", "Q", "8")],
    ]);
    const out = buildAdvance357CardAssignments({
      nextRoundNumber: 2,
      eligiblePlayers: [alice, bob], // Alice's fold does NOT remove her from the destination roster.
      previousRoundCards: prev,
      deck: testDeck(20),
    });
    expect(out).toHaveLength(2);
    const aliceOut = out.find((x) => x.player_id === "a")!;
    const bobOut = out.find((x) => x.player_id === "b")!;
    expect(aliceOut.cards).toHaveLength(5);
    expect(aliceOut.cards.slice(0, 3)).toEqual(prev.get("a"));
    expect(bobOut.cards).toHaveLength(5);
    expect(bobOut.cards.slice(0, 3)).toEqual(prev.get("b"));
    // Newly dealt cards for Alice and Bob must be disjoint slices of the deck.
    expect(aliceOut.cards.slice(3)).not.toEqual(bobOut.cards.slice(3));
  });

  it("R2 folded player receives 7 total cards (5 carry + 2 new) and appears in R3 roster", () => {
    const prev = new Map<string, Card[]>([
      ["a", fiveCards()],
      ["b", [c("A", "♠"), c("K", "♠"), c("Q", "♠"), c("J", "♠"), c("10", "♠")]],
    ]);
    const out = buildAdvance357CardAssignments({
      nextRoundNumber: 3,
      eligiblePlayers: [alice, bob],
      previousRoundCards: prev,
      deck: testDeck(20),
    });
    const aliceOut = out.find((x) => x.player_id === "a")!;
    expect(aliceOut.cards).toHaveLength(7);
    expect(aliceOut.cards.slice(0, 5)).toEqual(prev.get("a"));
  });

  it("R3 folded player receives 3 fresh cards (0 carry) at the next-hand R1 seam", () => {
    // Prior-hand R3 carryforward MUST be discarded. Passing prior cards
    // in the map has no effect at this seam.
    const prev = new Map<string, Card[]>([
      ["a", Array(7).fill(c("2", "♣")) as Card[]],
      ["b", Array(7).fill(c("3", "♣")) as Card[]],
    ]);
    const out = buildAdvance357CardAssignments({
      nextRoundNumber: 1,
      eligiblePlayers: [alice, bob],
      previousRoundCards: prev,
      deck: testDeck(20),
    });
    expect(out).toHaveLength(2);
    for (const a of out) {
      expect(a.cards).toHaveLength(3);
      // None of the carryforward cards leaked into the new hand.
      expect(a.cards.every((card) => !(card.rank === "2" && card.suit === "♣") && !(card.rank === "3" && card.suit === "♣"))).toBe(true);
    }
  });

  it("all three eligible players receive their destination card counts even when the middle one folded", () => {
    // R1 → R2 with three players; Bob folded R1.
    const prev = new Map<string, Card[]>([
      ["a", threeCards("2", "3", "4")],
      ["b", threeCards("5", "6", "7")],
      ["c", threeCards("8", "9", "10")],
    ]);
    const out = buildAdvance357CardAssignments({
      nextRoundNumber: 2,
      eligiblePlayers: [alice, bob, carol],
      previousRoundCards: prev,
      deck: testDeck(20),
    });
    expect(out.map((x) => x.player_id).sort()).toEqual(["a", "b", "c"]);
    for (const a of out) {
      expect(a.cards).toHaveLength(5);
    }
  });

  it("rejects a missing carryforward for a R2 destination (defensive assertion)", () => {
    const prev = new Map<string, Card[]>([["a", threeCards("2", "3", "4")]]);
    expect(() =>
      buildAdvance357CardAssignments({
        nextRoundNumber: 2,
        eligiblePlayers: [alice, bob],
        previousRoundCards: prev,
        deck: testDeck(20),
      }),
    ).toThrow(/carryforward_length_mismatch/);
  });

  it("throws when deck cannot cover new cards for every eligible player", () => {
    expect(() =>
      buildAdvance357CardAssignments({
        nextRoundNumber: 1,
        eligiblePlayers: [alice, bob, carol],
        previousRoundCards: new Map(),
        deck: testDeck(5), // needs 9 (3 players × 3), only has 5
      }),
    ).toThrow(/deck_underflow/);
  });
});
