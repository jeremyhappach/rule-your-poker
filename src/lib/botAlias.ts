/**
 * Generates a session-specific bot alias (Bot 1, Bot 2, etc.)
 * based on the order bots were added to the game session.
 */
export function getBotAlias(
  players: Array<{ user_id: string; is_bot: boolean; created_at?: string }>,
  botUserId: string
): string {
  // Filter to only bots and sort by creation time
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
  players: Array<{ user_id: string; is_bot: boolean; created_at?: string }>,
  player: { user_id: string; is_bot: boolean },
  actualUsername: string
): string {
  if (!player.is_bot) return actualUsername;
  return getBotAlias(players, player.user_id);
}
