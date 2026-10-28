// server/canasta/authority.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/lib/canasta/config.ts
var turnBudget = (m) => m.config?.turnMs ?? 12e4;

// src/lib/cardGames/physicalCard.ts
function isResolvedJoker(value) {
  if (!value || typeof value !== "object") return false;
  const c = value;
  return c.kind === "joker" && (c.masked === void 0 || c.masked === false) && c.rank === void 0 && c.suit === void 0;
}

// src/lib/canasta/rules.ts
var VERSION = "canasta-classic-two/1";
var CONTRACT = Object.freeze({
  version: VERSION,
  participants: 2,
  deckSize: 108,
  handSize: 15,
  drawCount: 2,
  requiredCanastas: 2,
  target: 5e3,
  turnMs: 12e4
});
var ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var suits = ["\u2663", "\u2666", "\u2665", "\u2660"];
var standard = (c) => isResolvedJoker(c.face) ? null : c.face;
var wild = (c) => isResolvedJoker(c.face) || standard(c)?.rank === "2";
var redThree = (c) => standard(c)?.rank === "3" && ["\u2665", "\u2666"].includes(standard(c).suit);
var natural = (c) => !wild(c) && standard(c)?.rank !== "3";
var points = (c) => isResolvedJoker(c.face) ? 50 : ["A", "2"].includes(standard(c).rank) ? 20 : ["8", "9", "10", "J", "Q", "K"].includes(standard(c).rank) ? 10 : 5;
var openingMinimum = (score2) => score2 < 0 ? 15 : score2 < 1500 ? 50 : score2 < 3e3 ? 90 : 120;
function initialPile(deck) {
  const stock = [...deck], pile = [];
  while (stock.length) {
    const c = stock.shift();
    pile.push(c);
    if (!wild(c) && !redThree(c)) break;
  }
  return { stock, pile };
}
function stockDraw(deck) {
  const stock = [...deck], cards = [], reds = [];
  while (stock.length && cards.length < 2) {
    const c = stock.shift();
    (redThree(c) ? reds : cards).push(c);
  }
  return { stock, cards, reds, endsImmediately: cards.length === 0 };
}
function handScore(melds, hand, redCount, out) {
  const meldValue = melds.flatMap((m) => m.cards).reduce((n, c) => n + points(c), 0);
  const handValue = hand.reduce((n, c) => n + points(c), 0);
  const bonuses = melds.filter((m) => m.rank !== "3" && m.cards.length >= 7).reduce((n, m) => n + (m.cards.some(wild) ? 300 : 500), 0);
  const reds = (redCount === 4 ? 800 : redCount * 100) * (melds.length ? 1 : -1);
  return meldValue - handValue + bonuses + reds + (out === "concealed" ? 200 : out === "ordinary" ? 100 : 0);
}
function compareCards(a, b) {
  const x = standard(a), y = standard(b);
  return (x ? ranks.indexOf(x.rank) : 13) - (y ? ranks.indexOf(y.rank) : 13) || (x ? suits.indexOf(x.suit) : 4) - (y ? suits.indexOf(y.suit) : 4) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function fixtureDeck() {
  return [0, 1].flatMap((copy) => [
    ...suits.flatMap((suit) => ranks.map((rank) => ({ id: `fixture-${copy}-${suits.indexOf(suit)}-${rank}`, face: { rank, suit } }))),
    ...[0, 1].map((n) => ({ id: `fixture-joker-${copy}-${n}`, face: { kind: "joker" } }))
  ]);
}
function meldError(m, goingOut = false) {
  if (new Set(m.cards.map((c) => c.id)).size !== m.cards.length) return "A physical card was used twice.";
  if (m.rank === "3") return goingOut && [3, 4].includes(m.cards.length) && m.cards.every((c) => standard(c)?.rank === "3" && !redThree(c)) ? null : "Black threes meld only when going out.";
  if (m.rank === "2" || m.cards.length < 3) return "A meld needs at least three cards.";
  const naturals = m.cards.filter((c) => !wild(c));
  if (naturals.length < 2 || naturals.some((c) => standard(c)?.rank !== m.rank || redThree(c))) return "Use at least two matching natural cards.";
  if (m.cards.filter(wild).length > 3) return "At most three wild cards per meld.";
  return null;
}
var canastas = (melds) => melds.filter((m) => m.rank !== "3" && m.cards.length >= 7 && !meldError(m)).length;
function openingReport(melds, score2, goingOut = false) {
  const ids = melds.flatMap((m) => m.cards.map((c) => c.id));
  const error = new Set(ids).size !== ids.length ? "A card appears in more than one meld." : new Set(melds.map((m) => m.rank)).size !== melds.length ? "Combine melds of the same rank." : melds.map((m) => meldError(m, goingOut)).find(Boolean) ?? null;
  return { count: melds.flatMap((m) => m.cards).reduce((n, c) => n + points(c), 0), required: openingMinimum(score2), error };
}
function pileStatus(pile, opened) {
  const top = pile.at(-1);
  return {
    blocked: !top || !natural(top),
    globalFreeze: pile.some((c) => wild(c) || redThree(c)),
    personalFreeze: !opened
  };
}
function pickupError(input) {
  const { hand, pile, opened, score: score2, existing, qualifierIds, opening } = input;
  const status = pileStatus(pile, opened), top = pile.at(-1);
  if (status.blocked || !top) return "The top card blocks pickup.";
  if (hand.length === 1 && (input.pileCount ?? pile.length) === 1) return "A one-card hand cannot take a one-card pile.";
  if (new Set(qualifierIds).size !== qualifierIds.length) return "Select distinct physical cards.";
  const q = qualifierIds.map((id) => hand.find((c) => c.id === id));
  if (q.some((c) => !c)) return "Qualifier is not in your hand.";
  const rank = standard(top).rank;
  const matching = q.filter((c) => c && natural(c) && standard(c)?.rank === rank).length;
  const pair = q.length === 2 && matching === 2;
  const frozen = (input.pileFrozen ?? status.globalFreeze) || status.personalFreeze;
  if (frozen && !pair) return "Frozen pile: select two matching natural cards.";
  if (!frozen && !(pair || q.length === 2 && matching === 1 && q.some((c) => c && wild(c)) || q.length === 0 && existing.some((m) => m.rank === rank))) return "The top card must join a qualifying meld.";
  if (!opened) {
    const permitted = /* @__PURE__ */ new Set([...hand.map((c) => c.id), top.id]);
    if (opening.flatMap((m) => m.cards).some((c) => !permitted.has(c.id))) return "Buried cards cannot qualify an opening.";
    const topMeld = opening.find((m) => m.rank === rank);
    if (!topMeld || ![top.id, ...qualifierIds].every((id) => topMeld.cards.some((c) => c.id === id))) return "Include the top card and its pair in the opening.";
    const report = openingReport(opening, score2);
    if (report.error) return report.error;
    if (report.count < report.required) return `Opening needs ${report.required}; eligible count is ${report.count}.`;
  }
  return null;
}
function turnPlan(input) {
  const { hand, existing, drafts, discardId, opened, score: score2 } = input;
  const ids = drafts.flatMap((m) => m.cards.map((c) => c.id));
  const used = new Set(ids), owned = new Set(hand.map((c) => c.id));
  let error = null;
  if (ids.length !== used.size || ids.some((id) => !owned.has(id))) error = "Every submitted physical card must be owned and used once.";
  if (discardId && (!owned.has(discardId) || used.has(discardId))) error = "Choose one unmelded card as your discard.";
  if (discardId && hand.some((c) => c.id === discardId && redThree(c))) error = "Red threes cannot be discarded.";
  const melds = existing.map((m) => ({ ...m, cards: [...m.cards] }));
  for (const m of drafts) {
    const old = melds.find((x) => x.rank === m.rank);
    if (old) old.cards.push(...m.cards);
    else melds.push({ ...m, cards: [...m.cards] });
  }
  const remaining = hand.filter((c) => !used.has(c.id) && c.id !== discardId);
  const out = remaining.length === 0;
  error = error ?? melds.map((m) => meldError(m, out)).find(Boolean) ?? null;
  if (out && canastas(melds) < 2) error = "You need two canastas to go out. Keep a card after discarding.";
  if (!out && !discardId) error = "Choose a discard to finish the turn.";
  const report = openingReport(drafts, score2, out);
  const concealedStockOut = !opened && out && canastas(melds) >= 2 && input.drawSource === "stock";
  if (!opened && drafts.length && report.count < report.required && !concealedStockOut) error = `Opening needs ${report.required}; draft has ${report.count}.`;
  return { error, melds, remaining, out };
}
function mechanicalFinish(hand, melds) {
  const candidates = hand.filter((c) => !redThree(c)).sort(compareCards);
  if (hand.length > 1 || canastas(melds) >= 2) {
    if (candidates[0]) return { kind: "discard", cardId: candidates[0].id };
  }
  if (hand.length === 1) {
    for (const m of [...melds].sort((a, b) => ranks.indexOf(a.rank) - ranks.indexOf(b.rank))) {
      const next = { ...m, cards: [...m.cards, hand[0]] };
      if (!meldError(next, true) && canastas(melds.map((old) => old === m ? next : old)) >= 2)
        return { kind: "meld-out", cardId: hand[0].id, rank: m.rank };
    }
  }
  return { kind: "pause-recovery" };
}
function rulesFor(version) {
  if (version !== VERSION) throw new Error(`Unsupported Canasta rules: ${version}`);
  return { contract: CONTRACT, initialPile, stockDraw, handScore, openingReport, pickupError, turnPlan, mechanicalFinish };
}

// src/lib/canasta/bot.ts
function chooseBotAction(view) {
  const h = view.hand;
  if (!h || view.pause || view.winner || h.phase === "complete" || h.active !== view.viewer) return null;
  const p = h.players[h.active], hand = p.cards;
  if (!hand) return null;
  const top = h.pile.at(-1);
  if (h.phase === "draw") {
    if (top && natural(top)) {
      const rank = standard(top).rank, pair = hand.filter((c) => natural(c) && standard(c)?.rank === rank).slice(0, 2);
      const qualifiers = p.opened && !h.pileFrozen && p.melds.some((g) => g.rank === rank) ? [] : pair.map((c) => c.id);
      const opening = p.opened ? [] : [{ rank, cards: [...pair, top] }];
      if (!p.opened) for (const r of ["A", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
        if (r === rank) continue;
        const cards = hand.filter((c) => natural(c) && standard(c)?.rank === r);
        if (cards.length >= 3) opening.push({ rank: r, cards });
      }
      if (!pickupError({ hand, pile: h.pile, pileCount: h.pileCount, pileFrozen: h.pileFrozen, opened: p.opened, score: p.openingScore, existing: p.melds, qualifierIds: qualifiers, opening }))
        return { type: "pickup", qualifiers, opening: opening.map((g) => ({ rank: g.rank, ids: g.cards.map((c) => c.id) })) };
    }
    return h.stockCount ? { type: "draw" } : { type: "end-exhausted" };
  }
  const drafts = [];
  let wilds = hand.filter(wild).sort(compareCards);
  for (const rank of ["A", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
    const old = p.melds.find((g) => g.rank === rank), cards = hand.filter((c) => natural(c) && standard(c)?.rank === rank);
    if (old || cards.length >= 2) {
      const need = Math.max(0, (old ? 7 : 3) - (old?.cards.length ?? 0) - cards.length);
      const take = Math.min(need, 3 - (old?.cards.filter(wild).length ?? 0), wilds.length);
      if (old || cards.length + take >= 3) {
        cards.push(...wilds.splice(0, take));
        if (cards.length) drafts.push({ rank, cards });
      }
    }
  }
  const plans = [drafts, []];
  for (const groups of plans) {
    const operands = groups.map((g) => ({ rank: g.rank, ids: g.cards.map((c) => c.id) }));
    for (const discard of [null, ...[...hand].sort((a, b) => points(b) - points(a) || compareCards(a, b)).map((c) => c.id)]) {
      if (!turnPlan({ hand, existing: p.melds, drafts: groups, discardId: discard, opened: p.opened, score: p.openingScore, drawSource: h.source ?? void 0 }).error)
        return { type: "finish", groups: operands, discard };
    }
  }
  return null;
}

// src/lib/canasta/engine.ts
var uuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function requireThat(ok, message) {
  if (!ok) throw Error(`canasta:${message}`);
}
function tick(m, at) {
  requireThat(Number.isSafeInteger(at) && at >= m.updatedAt, "clock");
  m.updatedAt = at;
}
function advance(m, at) {
  tick(m, at);
  m.revision++;
  assertConservation(m);
  return m;
}
var faceKey = (c) => standard(c) ? `${standard(c).rank}${standard(c).suit}` : "joker";
function validateDeck(cards) {
  const expected = fixtureDeck().map(faceKey).sort();
  requireThat(cards.length === 108 && new Set(cards.map((c) => c.id)).size === 108 && cards.every((c) => typeof c.id === "string" && c.id.length > 0) && JSON.stringify(cards.map(faceKey).sort()) === JSON.stringify(expected), "deck");
}
function startHand(input, id, deck, at) {
  rulesFor(input.version);
  requireThat(uuid(id) && !input.winner && !input.pause && (!input.hand || input.hand.phase === "complete"), "hand_boundary");
  requireThat(!input.completed.some((h) => h.id === id), "hand_identity");
  validateDeck(deck);
  const m = structuredClone(input), number = m.completed.length + 1, dealer = (number - 1) % 2, stock = structuredClone(deck);
  const players = Object.fromEntries(m.seats.map((s) => [s.id, { cards: [], reds: [], melds: [], opened: false, openingScore: m.totals[s.id] }]));
  for (let n = 0; n < 15; n++) for (let offset = 1; offset <= 2; offset++) players[m.seats[(dealer + offset) % 2].id].cards.push(stock.shift());
  for (let offset = 1; offset <= 2; offset++) {
    const p = players[m.seats[(dealer + offset) % 2].id];
    p.reds = p.cards.filter(redThree);
    p.cards = p.cards.filter((c) => !redThree(c));
    while (p.cards.length < 15 && stock.length) {
      const c = stock.shift();
      (redThree(c) ? p.reds : p.cards).push(c);
    }
  }
  const initial = rulesFor(m.version).initialPile(stock), active = m.seats[(dealer + 1) % 2].id;
  m.hand = {
    id,
    number,
    dealer,
    ...initial,
    players,
    active,
    turn: 1,
    phase: "draw",
    source: null,
    openedAtTurnStart: false,
    deadline: at + turnBudget(m),
    generation: 1,
    result: null
  };
  return advance(m, at);
}
function assertConservation(m) {
  if (!m.hand) return;
  const h = m.hand;
  validateDeck([...h.stock, ...h.pile, ...Object.values(h.players).flatMap((p) => [...p.cards, ...p.reds, ...p.melds.flatMap((g) => g.cards)])]);
}
function groupsFrom(groups, available) {
  requireThat(Array.isArray(groups) && groups.length <= 13 && new Set(groups.map((g) => g.rank)).size === groups.length, "groups");
  const ids = groups.flatMap((g) => g.ids);
  requireThat(ids.length === new Set(ids).size, "duplicate_card");
  return groups.map((g) => ({ rank: g.rank, cards: g.ids.map((id) => {
    const c = available.find((c2) => c2.id === id);
    requireThat(c, "unowned_card");
    return c;
  }) }));
}
function score(m, out) {
  const h = m.hand;
  requireThat(!h.result, "already_scored");
  const concealed = out !== null && !h.openedAtTurnStart;
  const scores = Object.fromEntries(m.seats.map((s) => {
    const p = h.players[s.id];
    return [s.id, rulesFor(m.version).handScore(
      p.melds,
      p.cards,
      p.reds.length,
      s.id === out ? concealed ? "concealed" : "ordinary" : "none"
    )];
  }));
  h.result = { scores, out, concealed };
  h.phase = "complete";
  for (const s of m.seats) m.totals[s.id] += scores[s.id];
  m.completed.push({ id: h.id, number: h.number, scores });
  const [a, b] = m.seats.map((s) => s.id);
  if (Math.max(m.totals[a], m.totals[b]) >= CONTRACT.target && m.totals[a] !== m.totals[b]) m.winner = m.totals[a] > m.totals[b] ? a : b;
}
function mandatoryPickup(m) {
  const h = m.hand, p = h.players[h.active], top = h.pile.at(-1), status = pileStatus(h.pile, p.opened);
  return h.stock.length === 0 && !!top && !status.blocked && !status.globalFreeze && !status.personalFreeze && p.melds.some((g) => g.rank === standard(top)?.rank) && !(p.cards.length === 1 && h.pile.length === 1);
}
function applyAction(m, action, at) {
  const h = m.hand, p = h.players[h.active], rules = rulesFor(m.version);
  requireThat(h.phase !== "complete", "hand_complete");
  if (action.type === "draw") {
    requireThat(h.phase === "draw" && h.stock.length > 0, "draw_phase");
    const draw = rules.stockDraw(h.stock);
    h.stock = draw.stock;
    p.cards.push(...draw.cards);
    p.reds.push(...draw.reds);
    h.source = "stock";
    if (draw.endsImmediately) score(m, null);
    else h.phase = "meld";
    return;
  }
  if (action.type === "end-exhausted") {
    requireThat(h.phase === "draw" && h.stock.length === 0 && !mandatoryPickup(m), "mandatory_pickup");
    score(m, null);
    return;
  }
  if (action.type === "pickup") {
    requireThat(h.phase === "draw", "draw_phase");
    const top = h.pile.at(-1);
    requireThat(top, "empty_pile");
    const opening = groupsFrom(action.opening, [...p.cards, top]);
    const error = rules.pickupError({ hand: p.cards, pile: h.pile, opened: p.opened, score: p.openingScore, existing: p.melds, qualifierIds: action.qualifiers, opening });
    requireThat(!error, error ?? "pickup");
    requireThat(!p.opened || opening.length === 0, "unexpected_opening");
    const additions = p.opened ? [{ rank: standard(top).rank, cards: [...action.qualifiers.map((id) => p.cards.find((c) => c.id === id)), top] }] : opening;
    const next = structuredClone(p.melds);
    for (const g of additions) {
      const old = next.find((x) => x.rank === g.rank);
      if (old) old.cards.push(...g.cards);
      else next.push(g);
    }
    requireThat(next.every((g) => !meldError(g)), "pickup_meld");
    const removed = new Set(additions.flatMap((g) => g.cards.map((c) => c.id))), buried = h.pile.slice(0, -1);
    p.cards = [...p.cards.filter((c) => !removed.has(c.id)), ...buried.filter((c) => !redThree(c))];
    p.reds.push(...buried.filter(redThree));
    p.melds = next;
    p.opened = true;
    h.pile = [];
    h.phase = "meld";
    h.source = "pile";
    if (!p.cards.length) {
      requireThat(canastas(p.melds) >= 2, "two_canastas");
      score(m, h.active);
    }
    return;
  }
  requireThat(h.phase === "meld", "draw_required");
  const drafts = groupsFrom(action.groups, p.cards);
  if (action.type === "meld") {
    const next = structuredClone(p.melds), used = new Set(drafts.flatMap((g) => g.cards.map((c) => c.id)));
    for (const g of drafts) {
      const old = next.find((x) => x.rank === g.rank);
      if (old) old.cards.push(...g.cards);
      else next.push(g);
    }
    requireThat(used.size > 0 && used.size < p.cards.length && next.every((g) => !meldError(g)), "meld_commit");
    if (!p.opened) {
      const report = openingReport(drafts, p.openingScore);
      requireThat(!report.error && report.count >= report.required, "opening");
    }
    p.cards = p.cards.filter((c) => !used.has(c.id));
    p.melds = next;
    p.opened = true;
    return;
  }
  requireThat(action.type === "finish", "action");
  const plan = rules.turnPlan({ hand: p.cards, existing: p.melds, drafts, discardId: action.discard, opened: p.opened, score: p.openingScore, drawSource: h.source ?? void 0 });
  requireThat(!plan.error, plan.error ?? "finish");
  const discard = p.cards.find((c) => c.id === action.discard);
  if (discard) h.pile.push(discard);
  p.cards = plan.remaining;
  p.melds = plan.melds;
  if (drafts.length) p.opened = true;
  if (plan.out) {
    score(m, h.active);
    return;
  }
  h.active = m.seats.find((s) => s.id !== h.active).id;
  h.turn++;
  h.phase = "draw";
  h.source = null;
  h.openedAtTurnStart = h.players[h.active].opened;
  h.deadline = at + turnBudget(m);
  h.generation++;
}
function execute(input, command, principal, at) {
  rulesFor(input.version);
  const seat = input.seats.find((s) => s.id === command.playerId);
  requireThat(seat && (principal.kind === "service" || seat.kind === "human" && seat.userId === principal.userId), "unauthorized");
  requireThat(uuid(command.requestId) && command.matchId === input.id, "command_identity");
  const signature = JSON.stringify(command), receipt = input.receipts[command.requestId];
  if (receipt) {
    requireThat(receipt.signature === signature, "receipt_conflict");
    return { state: input, duplicate: true };
  }
  requireThat(principal.kind === "service" || !input.automatic.includes(command.playerId), "automatic_control");
  const h = input.hand;
  requireThat(h && !input.winner && !input.pause && command.handId === h.id && command.turn === h.turn && command.generation === h.generation && command.revision === input.revision && command.playerId === h.active, "stale_command");
  requireThat(at < h.deadline, "deadline");
  const m = structuredClone(input);
  tick(m, at);
  applyAction(m, command.action, at);
  advance(m, at);
  m.receipts[command.requestId] = { signature, revision: m.revision };
  return { state: m, duplicate: false };
}
function pause(input, at, reason) {
  if (input.pause || !input.hand || input.hand.phase === "complete" || input.winner) return input;
  const m = structuredClone(input);
  m.pauseEpisode++;
  m.pause = { at, remaining: Math.max(0, m.hand.deadline - at), expired: at >= m.hand.deadline, episode: m.pauseEpisode, reason };
  return advance(m, at);
}
function expire(input, at, activeHumans) {
  const h = input.hand;
  if (!h || input.pause || input.winner || h.phase === "complete" || at < h.deadline) return input;
  if (input.realMoney) return pause(input, at, "inactivity");
  const m = structuredClone(input);
  if (m.seats.find((s) => s.id === h.active)?.kind === "human" && !m.automatic.includes(h.active)) m.automatic.push(h.active);
  return autoplayCompletion(m, at);
}
function automaticTurn(input, at, activeHumans) {
  const h = input.hand;
  requireThat(h && input.automatic.includes(h.active) && !input.pause && !input.winner && h.phase !== "complete", "automatic_identity");
  if (input.realMoney) return pause(input, at, "inactivity");
  return autoplayCompletion(structuredClone(input), at);
}
function autoplayCompletion(input, at) {
  let m = input;
  const turn = m.hand.turn;
  for (let step = 0; step < 2 && m.hand.turn === turn && m.hand.phase !== "complete"; step++) {
    const action = chooseBotAction(project(m, m.hand.active));
    if (!action) return mechanicalCompletion(m, at);
    const next = structuredClone(m);
    try {
      applyAction(next, action, at);
    } catch {
      return mechanicalCompletion(m, at);
    }
    m = next;
  }
  return advance(m, at);
}
function mechanicalCompletion(m, at) {
  if (m.hand.phase === "draw") {
    if (m.hand.stock.length) applyAction(m, { type: "draw" }, at);
    else if (mandatoryPickup(m)) applyAction(m, { type: "pickup", qualifiers: [], opening: [] }, at);
    else applyAction(m, { type: "end-exhausted" }, at);
  }
  if (m.hand.phase === "meld") {
    const p = m.hand.players[m.hand.active], finish = rulesFor(m.version).mechanicalFinish(p.cards, p.melds);
    if (finish.kind === "pause-recovery") return pause(advance(m, at), at, "recovery");
    applyAction(m, { type: "finish", groups: finish.kind === "meld-out" ? [{ rank: finish.rank, ids: [finish.cardId] }] : [], discard: finish.kind === "discard" ? finish.cardId : null }, at);
  }
  return advance(m, at);
}
function takeControl(input, playerId, principal, at) {
  requireThat(input.seats.some((s) => s.id === playerId && s.kind === "human" && (principal.kind === "service" || s.userId === principal.userId)), "unauthorized");
  const m = structuredClone(input);
  m.automatic = m.automatic.filter((id) => id !== playerId);
  return advance(m, at);
}
function project(m, viewer) {
  requireThat(viewer === null || m.seats.some((s) => s.id === viewer), "viewer");
  const h = m.hand;
  return structuredClone({
    config: m.config,
    version: m.version,
    id: m.id,
    sessionId: m.sessionId,
    stake: m.stake,
    revision: m.revision,
    seats: m.seats.map(({ userId, ...s }) => s),
    totals: m.totals,
    winner: m.winner,
    automatic: m.automatic,
    pause: m.pause,
    viewer,
    hand: h ? {
      id: h.id,
      number: h.number,
      active: h.active,
      turn: h.turn,
      generation: h.generation,
      deadline: h.deadline,
      phase: h.phase,
      source: h.source,
      stockCount: h.stock.length,
      pile: h.pile.slice(-1),
      pileCount: h.pile.length,
      pileFrozen: pileStatus(h.pile, true).globalFreeze,
      freezeIndicator: h.pile.find(wild) ?? null,
      result: h.result,
      players: Object.fromEntries(Object.entries(h.players).map(([id, p]) => [
        id,
        { cards: id === viewer ? p.cards : null, count: p.cards.length, reds: p.reds, melds: p.melds, opened: p.opened, openingScore: p.openingScore }
      ]))
    } : null
  });
}

// server/canasta/shuffle.ts
import { randomInt, randomUUID } from "node:crypto";
function secureDeck() {
  const cards = fixtureDeck().map((c) => ({ id: randomUUID(), face: c.face }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// server/canasta/authority.ts
var CanastaAuthority = class {
  constructor(store, deck = secureDeck) {
    this.store = store;
    this.deck = deck;
  }
  async action(id, userId, command) {
    const row = await this.store.load(id, userId);
    const result = execute(row.state, command, { kind: "human", userId }, row.serverAt);
    const committed = await this.store.commit(row, result.state, { kind: "command", command, userId });
    return this.visible(committed, userId);
  }
  async read(id, userId) {
    return this.visible(await this.store.load(id, userId), userId);
  }
  visible(row, userId) {
    const seat = row.state.seats.find((s) => s.kind === "human" && s.userId === userId);
    return { state: project(row.state, seat?.id ?? null), firstRoundId: row.firstRoundId, serverAt: row.serverAt, settlement: row.settlement, finished: row.finished };
  }
  /** Invoked by durable server scheduling; all transition identities remain in the store. */
  async recover(id) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await this.store.load(id);
      let state = row.state;
      const at = row.serverAt, h = state.hand;
      if (row.finished) return row;
      if (row.settlement) {
        await this.store.finish(id);
        return this.store.load(id);
      }
      if (state.pause) return row;
      if (!h || h.phase === "complete") {
        if (!state.winner) state = startHand(state, h ? randomUUID2() : row.firstRoundId, this.deck(), at);
      } else if (at >= h.deadline) state = expire(state, at, row.activeHumans);
      else if (state.automatic.includes(h.active) && row.botDue !== null && at >= row.botDue) state = automaticTurn(state, at, row.activeHumans);
      else if (state.seats.find((s) => s.id === h.active)?.kind === "bot" && row.botDue !== null && at >= row.botDue) {
        const action = chooseBotAction(project(state, h.active));
        if (action) state = execute(state, {
          matchId: state.id,
          handId: h.id,
          turn: h.turn,
          generation: h.generation,
          revision: state.revision,
          requestId: randomUUID2(),
          playerId: h.active,
          action
        }, { kind: "service" }, at).state;
        else state = pause(state, at, "recovery");
      }
      if (state === row.state) return row;
      try {
        return await this.store.commit(row, state, { kind: "recover" });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "canasta:conflict" || attempt === 2) throw error;
      }
    }
    throw Error("canasta:conflict");
  }
  /** Pause/resume remains on the existing host-authorized set_game_paused RPC. */
  async takeControl(id, userId) {
    const row = await this.store.load(id, userId), seat = row.state.seats.find((s) => s.kind === "human" && s.userId === userId);
    if (!seat) throw Error("canasta:unauthorized");
    const state = takeControl(row.state, seat.id, { kind: "human", userId }, row.serverAt);
    return this.visible(await this.store.commit(row, state, { kind: "control", userId }), userId);
  }
};

// server/canasta/recovery.ts
async function recoverCanasta(rpc, token) {
  const claim = await rpc("canasta_recovery_claim", { p_token: token });
  if (!claim.accepted) throw Error("canasta:recovery_token_denied");
  const authority = new CanastaAuthority({
    load: (id) => rpc("canasta_recovery_load", { p_token: token, p_match: id }),
    commit: (prior, state, context) => rpc("canasta_server_commit", { p_match: prior.state.id, p_revision: prior.state.revision, p_state: state, p_context: context }),
    finish: async (id) => {
      await rpc("canasta_server_finish", { p_match: id });
    }
  });
  const failures = [];
  let processed = 0;
  const started = Date.now();
  for (const id of claim.matches ?? []) {
    if (Date.now() - started > 15e3) {
      failures.push("canasta:recovery_budget");
      break;
    }
    try {
      await authority.recover(id);
      processed++;
    } catch {
      failures.push("canasta:recovery_failed");
    }
  }
  await rpc("canasta_recovery_complete", { p_token: token, p_failure: failures[0] ?? null });
  return { processed, failures };
}

// supabase/functions/canasta-recovery/index.ts
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const token = request.headers.get("x-canasta-dispatch");
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) return new Response(null, { status: 403 });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(null, { status: 503 });
  try {
    const result = await recoverCanasta(async (name, args) => {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(1e4) });
      if (!response.ok) throw Error("canasta:recovery_database_rejected");
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    }, token);
    return Response.json(result, { status: result.failures.length ? 503 : 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
});
