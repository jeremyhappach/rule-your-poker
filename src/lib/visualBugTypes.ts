/**
 * Master list of visual bug types for in-app reporting.
 * Filtered by game category at runtime, then sorted alphabetically by label.
 */

export type GameCategory = 'card' | 'dice' | 'all';

export interface BugTypeEntry {
  label: string;
  value: string;
  categories: GameCategory[];
}

/** Master bug type list — single source of truth */
const MASTER_BUG_TYPES: BugTypeEntry[] = [
  { label: 'Dice Row Hopping', value: 'dice_row_hopping', categories: ['dice'] },
  { label: 'Dice Value Mismatch', value: 'dice_value_mismatch', categories: ['dice'] },
  { label: 'Duplicate Animation', value: 'duplicate_animation', categories: ['all'] },
  { label: 'Game Froze', value: 'game_froze', categories: ['all'] },
  { label: 'Input Not Working', value: 'input_not_working', categories: ['all'] },
  { label: 'Other', value: 'other', categories: ['all'] },
  { label: 'Re-Animation / Stutter', value: 'reanimation_stutter', categories: ['all'] },
  { label: 'Scoring Issue', value: 'scoring_issue', categories: ['all'] },
  { label: 'Stale Cards', value: 'stale_cards', categories: ['card'] },
  { label: 'Stale Score', value: 'stale_score', categories: ['all'] },
  { label: 'Wrong Player / Wrong Turn', value: 'wrong_turn', categories: ['all'] },
];

const DICE_GAME_TYPES = new Set(['horses', 'scc', 'yahtzee']);
const CARD_GAME_TYPES = new Set(['holm-game', '3-5-7', 'cribbage', 'gin-rummy']);

function getGameCategory(gameType: string | null | undefined): GameCategory {
  if (!gameType) return 'all';
  if (DICE_GAME_TYPES.has(gameType)) return 'dice';
  if (CARD_GAME_TYPES.has(gameType)) return 'card';
  return 'all';
}

/**
 * Returns bug types filtered for the current game type, sorted alphabetically.
 * "Other" is always sorted last.
 */
export function getBugTypesForGame(gameType: string | null | undefined): BugTypeEntry[] {
  const category = getGameCategory(gameType);

  return MASTER_BUG_TYPES
    .filter(bt =>
      bt.categories.includes('all') || bt.categories.includes(category)
    )
    .sort((a, b) => {
      // "Other" always last
      if (a.value === 'other') return 1;
      if (b.value === 'other') return -1;
      return a.label.localeCompare(b.label);
    });
}
