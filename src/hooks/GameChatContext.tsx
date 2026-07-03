import { createContext, useContext, type ReactNode } from 'react';
import type { useGameChat } from './useGameChat';

/**
 * Single canonical chat context for a game. There is exactly ONE
 * `useGameChat(gameId, players, currentUserId)` invocation per game
 * — it lives at the persistent game shell boundary (Game.tsx) —
 * and every downstream consumer (game-variant tables, chat panel,
 * unread/indicator selectors, chat bubbles) reads from this
 * context.
 *
 * No child component may call `useGameChat` again. No child
 * component may keep its own message array, hydration snapshot,
 * or realtime subscription. That guarantees canonical projection
 * updates propagate synchronously to every consumer via the same
 * value reference.
 */
export type GameChatContextValue = ReturnType<typeof useGameChat>;

const GameChatContext = createContext<GameChatContextValue | null>(null);

export function GameChatContextProvider({
  value,
  children,
}: {
  value: GameChatContextValue;
  children: ReactNode;
}) {
  return <GameChatContext.Provider value={value}>{children}</GameChatContext.Provider>;
}

export function useGameChatContext(): GameChatContextValue {
  const ctx = useContext(GameChatContext);
  if (!ctx) {
    throw new Error(
      'useGameChatContext must be used inside <GameChatContextProvider>. ' +
        'The single canonical chat store lives at the Game.tsx shell boundary.',
    );
  }
  return ctx;
}
