export const CHESS_BOT_DIFFICULTIES = ['easy', 'medium', 'expert'] as const;
export type ChessBotDifficulty = typeof CHESS_BOT_DIFFICULTIES[number];
export const CHESS_BOT_VERSION = 'ptown-chess-bot/1';
export function chessBotDifficulty(value: unknown): ChessBotDifficulty {
  if (value === undefined || value === null) return 'medium';
  if (!CHESS_BOT_DIFFICULTIES.includes(value as ChessBotDifficulty)) throw Error('chess:bot_difficulty');
  return value as ChessBotDifficulty;
}
