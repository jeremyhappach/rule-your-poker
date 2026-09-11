import type { PresentationScope, TransitionSample } from './transitionPresentation';
import { assertCompletionEvidence } from './transitionPresentation';

export type WinnerPayoutExpectation = PresentationScope & {
  startedAt: number; announcementId: string; simultaneousAnnouncement?: boolean;
  requireCelebration?: boolean; transferIds: string[];
  payoutKind?: 'payout' | 'pot';
  openingBalances: Record<string, string>; closingBalances: Record<string, string>;
};

// The local HUD omits '$'; remote seat labels include it. Compare amounts,
// while rejecting malformed text and disagreements between visible copies.
function sameDisplayedBalance(actual: string, expected: string): boolean {
  const amount = (text: string) => /^\$?-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text.trim())
    ? Number(text.trim().replace(/[$,]/g, '')) : NaN;
  const value = amount(actual);
  return Number.isFinite(value) && value === amount(expected);
}

/** Exact visible winner/transport proof for player and pot payouts. */
export function assertWinnerPayoutPresentation(samples: readonly TransitionSample[], expected: WinnerPayoutExpectation) {
  const fail = (why: string): never => { throw new Error(`Winner presentation ${expected.roundId}: ${why}`); };
  const rows = samples.filter(row => row.at >= expected.startedAt);
  assertCompletionEvidence(rows, expected);
  const eventId = expected.announcementId;
  const same = (scope: PresentationScope | null) => scope?.gameId === expected.gameId
    && scope.dealerGameId === expected.dealerGameId && scope.roundId === expected.roundId
    && scope.handNumber === expected.handNumber;
  if (!rows.length || rows.some(row => !row.documentVisible)) fail('incomplete or hidden observation');
  const announcement = rows.find(row => row.matchWin?.id === eventId && row.matchWin.text.length > 0);
  if (!announcement || !same(announcement.scope)) fail('missing exact winner announcement');
  if (expected.requireCelebration && !rows.some(row => row.celebration === eventId && same(row.scope))) fail('missing skunk celebration');
  const flights = new Map<string, { start: number; end: number | null }>();
  let previous = new Set<string>();
  for (const row of rows) {
    const current = new Set<string>();
    for (const stage of row.stages.filter(stage => stage.kind === (expected.payoutKind ?? 'payout'))) {
      if (!same(row.scope) || !expected.transferIds.includes(stage.id)) fail('stale or unrelated payout');
      current.add(stage.id);
      const entry = flights.get(stage.id);
      if (entry && !previous.has(stage.id)) fail('duplicate payout');
      const flight = entry ?? { start: row.at, end: null };
      if (stage.finished && flight.end === null) flight.end = row.at;
      flights.set(stage.id, flight);
    }
    previous = current;
  }
  if (!expected.transferIds.length || flights.size !== expected.transferIds.length) fail('missing payout flight');
  for (const flight of flights.values()) {
    if (flight.start < announcement!.at || (!expected.simultaneousAnnouncement && flight.start === announcement!.at)
      || flight.end === null) fail('payout preceded winner announcement or never finished');
    if (!rows.some(row => row.at >= announcement!.at && (expected.simultaneousAnnouncement ? row.at <= flight.start : row.at < flight.start)
      && row.matchWin?.id === eventId && !row.celebration)) fail('winner plate never visible before payout');
  }
  const payoutStart = Math.min(...[...flights.values()].map(flight => flight.start));
  const payoutEnd = Math.max(...[...flights.values()].map(flight => flight.end!));
  const setup = rows.find(row => row.setup);
  if (!setup || setup.at < payoutEnd) fail('missing setup or setup before payout completion');
  for (const [player, opening] of Object.entries(expected.openingBalances)) {
    if (rows.some(row => row.at >= announcement!.at && row.at < payoutStart && row.balances[player] != null && !sameDisplayedBalance(row.balances[player], opening))) fail('balance changed before payout');
  }
  for (const [player, closing] of Object.entries(expected.closingBalances)) {
    if (!rows.some(row => row.at >= payoutEnd && row.balances[player] != null && sameDisplayedBalance(row.balances[player], closing))) fail('missing final balance');
  }
  return { announcementAt: announcement!.at, payoutStart, payoutEnd, setupAt: setup.at };
}
