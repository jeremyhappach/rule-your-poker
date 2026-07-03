/**
 * Match chat tab persistence.
 *
 * Small, contained module-scope store that preserves the user-selected
 * shell tab across remounts of the gameplay surface (Cribbage /
 * GinRummy / Yahtzee tables). Prevents the "chat → cards bounce" the
 * user reported when shell hydration or gameplay state churn causes
 * the mobile table to remount with a fresh `useState('cards')`.
 *
 * Not persisted across full page reloads — that is intentional. This
 * only survives in-session remounts.
 */

import type { ShellTabId } from '@/lib/canonicalShell/ShellTabBar';

const store = new Map<string, ShellTabId>();

export function readPersistedMatchChatTab(
  gameId: string | null | undefined,
  fallback: ShellTabId = 'cards',
): ShellTabId {
  if (!gameId) return fallback;
  return store.get(gameId) ?? fallback;
}

export function writePersistedMatchChatTab(
  gameId: string | null | undefined,
  tab: ShellTabId,
): void {
  if (!gameId) return;
  store.set(gameId, tab);
}

export function clearPersistedMatchChatTab(gameId: string | null | undefined): void {
  if (!gameId) return;
  store.delete(gameId);
}
