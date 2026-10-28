import type {Dictionary, DictionaryRef} from './dictionary.ts';
import {dictionaryForMatch} from './dictionary.ts';

export interface BoardTile { readonly letter: string; readonly blank: boolean }
export interface Placement extends BoardTile { readonly row: number; readonly column: number }
export interface FormedWord { readonly text: string; readonly row: number; readonly column: number; readonly direction: 'across' | 'down' }

/** Lexical foundation only, not a complete move/rack/turn/scoring authority.
 * The future server reducer supplies its own stored board and owned placements.
 * Enumerate every maximal word touched by a new tile, including perpendiculars.
 */
export function wordsForPlacement(board: readonly (BoardTile | null)[], placements: readonly Placement[]): readonly FormedWord[] {
  if (board.length !== 225 || board.some(tile => tile !== null && (!tile || !/^[A-Z]$/.test(tile.letter) || typeof tile.blank !== 'boolean'))) {
    throw new Error('ptown_words:invalid_board');
  }
  if (placements.length < 1 || placements.length > 7) throw new Error('ptown_words:invalid_placement_count');
  const merged = board.slice();
  for (const tile of placements) {
    if (!Number.isInteger(tile.row) || !Number.isInteger(tile.column) || tile.row < 0 || tile.row > 14 || tile.column < 0 || tile.column > 14 || !/^[A-Z]$/.test(tile.letter) || typeof tile.blank !== 'boolean') {
      throw new Error('ptown_words:invalid_placement');
    }
    const at = tile.row * 15 + tile.column;
    if (merged[at]) throw new Error('ptown_words:occupied_square');
    merged[at] = {letter: tile.letter, blank: tile.blank};
  }
  const words = new Map<string, FormedWord>();
  const at = (r: number, c: number) => r >= 0 && r < 15 && c >= 0 && c < 15 ? merged[r * 15 + c] : null;
  for (const tile of placements) for (const direction of ['across', 'down'] as const) {
    const dr = direction === 'down' ? 1 : 0, dc = direction === 'across' ? 1 : 0;
    let r = tile.row, c = tile.column;
    while (at(r - dr, c - dc)) {r -= dr; c -= dc;}
    const row = r, column = c;
    let text = '';
    while (at(r, c)) {text += at(r, c)!.letter; r += dr; c += dc;}
    if (text.length > 1) words.set(`${row}:${column}:${direction}`, {text, row, column, direction});
  }
  return Object.freeze([...words.values()].sort((a, b) => a.row - b.row || a.column - b.column || (a.direction < b.direction ? -1 : a.direction > b.direction ? 1 : 0)).map(word => Object.freeze(word)));
}

/** No primary-word-only shortcut; every server-derived word must belong to the frozen list. */
export function validatePlacementWords(ref: DictionaryRef, board: readonly (BoardTile | null)[], placements: readonly Placement[]) {
  const dictionary: Dictionary = dictionaryForMatch(ref);
  const words = wordsForPlacement(board, placements);
  return {words, ...dictionary.validateWords(words.map(word => word.text))};
}
