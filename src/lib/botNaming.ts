export function getNextBotNumber(usernames: Array<string | null | undefined>): number {
  const numbers = usernames
    .map((u) => {
      const match = /^Bot\s+(\d+)/i.exec((u ?? '').trim());
      if (!match) return null;
      const n = Number(match[1]);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => typeof n === 'number');

  const max = numbers.length ? Math.max(...numbers) : 0;
  return max + 1;
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
