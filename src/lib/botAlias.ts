import { parseBotOrdinal } from './botNaming';

/**
 * Resolve a bot's session alias.
 *
 * The authoritative alias is the durable ordinal written into
 * `profiles.username` at creation time ("Bot 7"), allocated atomically
 * from the session-scoped counter. It must be used verbatim: deriving the
 * alias from the bot's index in the *current* roster renumbered surviving
 * bots (and reused retired numbers) every time a bot was removed.
 *
 * Index-based numbering remains only as a fallback for legacy rows whose
 * profile username is missing or non-canonical.
 */
export function getBotAlias(
  players: Array<{ user_id: string; is_bot?: boolean; created_at?: string; profiles?: { username?: string } }>,
  botUserId: string
): string {
  const self = players.find(p => p.user_id === botUserId);
  const durableOrdinal = parseBotOrdinal(self?.profiles?.username);
  if (durableOrdinal !== null) return `Bot ${durableOrdinal}`;

  const bots = players
    .filter(p => p.is_bot)
    .sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const index = bots.findIndex(b => b.user_id === botUserId);

  if (index === -1) return 'Bot';

  return `Bot ${index + 1}`;
}

/**
 * Returns display name - alias for bots, actual name for humans
 */
export function getDisplayName(
  players: Array<{ user_id: string; is_bot?: boolean; created_at?: string; profiles?: { username?: string } }>,
  player: { user_id: string; is_bot?: boolean },
  actualUsername: string
): string {
  if (!player.is_bot) return actualUsername;
  return getBotAlias(players, player.user_id);
}
