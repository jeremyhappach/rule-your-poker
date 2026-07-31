import { supabase } from "@/integrations/supabase/client";

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

/**
 * Durable, session-lifetime bot ordinal allocation.
 *
 * Bot player rows are physically DELETED when a bot stands up, so the
 * set of existing rows cannot provide historical maximum truth and any
 * count/index-derived numbering reuses retired aliases. The authoritative
 * source is the session-scoped counter `games.bot_alias_seq`, incremented
 * atomically (single-row UPDATE ... RETURNING, so concurrent Add Bot
 * requests serialize and can never collide) by
 * `allocate_bot_alias_number`. The allocator also seeds itself from the
 * highest existing "Bot N" in the session, so sessions created before the
 * counter existed continue monotonically.
 */
export async function allocateBotAliasNumber(gameId: string): Promise<number> {
  const { data, error } = await supabase.rpc('allocate_bot_alias_number', {
    _game_id: gameId,
  });

  if (error) {
    throw new Error(`Failed to allocate bot name: ${error.message}`);
  }

  const next = Number(data);
  if (!Number.isFinite(next) || next < 1) {
    throw new Error('Failed to allocate bot name: no ordinal returned');
  }

  return next;
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
