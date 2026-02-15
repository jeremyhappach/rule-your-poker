/**
 * Generates a session-specific bot alias (Bot 1, Bot 2, etc.)
 * based on the order bots were added to the game session.
 */
export function getBotAlias(
  players: Array<{ user_id: string; is_bot?: boolean; created_at?: string; profiles?: { username?: string } }>,
  botUserId: string
): string {
  // First, try to use the bot's profile username directly (e.g., "Bot 3")
  // This preserves the original numbering even after bots are removed and re-added
  const bot = players.find(b => b.user_id === botUserId && b.is_bot);
  if (bot?.profiles?.username) {
    const match = /^Bot\s+\d+/i.exec(bot.profiles.username);
    if (match) return match[0];
  }

  // Fallback: index-based (includes ALL bots, even left ones, sorted by creation time)
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
