export function getNextBotNumber(usernames: Array<string | null | undefined>): number {
  const numbers = usernames
    .map((u) => {
      const match = /^Bot\s+(\d+)(?:$|-)/i.exec((u ?? '').trim());
      if (!match) return null;
      const n = Number(match[1]);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => typeof n === 'number');

  const max = numbers.length ? Math.max(...numbers) : 0;
  return max + 1;
}

/**
 * Parse the durable session ordinal out of an authoritative bot
 * username ("Bot 7", "Bot 7-a1b2c3"). Returns null for anything that is
 * not a canonical bot name.
 */
export function parseBotOrdinal(username: string | null | undefined): number | null {
  const match = /^Bot\s+(\d+)(?:$|-)/i.exec((username ?? '').trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function makeBotUsername(args: {
  nextNumber: number;
  botId: string;
  forceUniqueSuffix?: boolean;
}): string {
  const suffix = args.botId.replace(/-/g, '').slice(0, 6);
  return args.forceUniqueSuffix
    ? `Bot ${args.nextNumber}-${suffix}`
    : `Bot ${args.nextNumber}`;
}
