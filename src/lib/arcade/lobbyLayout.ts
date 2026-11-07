import type {GameDescriptor} from '@/lib/gameCatalog/types';

export const ARCADE_SECTIONS = ['originals', 'other'] as const;
export type ArcadeSection = typeof ARCADE_SECTIONS[number];
export const ARCADE_SECTION_LABELS = {originals:'P-Town Originals', other:'Other Games'};
export type ArcadeLayout = Record<ArcadeSection, string[]>;
export type LobbyLayout = {layout:ArcadeLayout; revision:number};

export function parseLayout(value:unknown):ArcadeLayout {
  if (!value || typeof value !== 'object') throw Error('Invalid Arcade layout.');
  const layout = value as ArcadeLayout;
  if (Object.keys(layout).length !== 2 || !ARCADE_SECTIONS.every(section =>
    Array.isArray(layout[section]) && layout[section].every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id))))
    throw Error('Invalid Arcade layout.');
  const ids = [...layout.originals, ...layout.other];
  if (new Set(ids).size !== ids.length || ids.length > 500) throw Error('Invalid Arcade layout.');
  return {originals:[...layout.originals], other:[...layout.other]};
}

/** Placement never grants visibility. Callers supply the catalog's eligible list.
 * Retain unknown/hidden placements so an older admin client cannot erase them.
 * New games append deterministically, without disturbing saved positions.
 */
export function completeLayout(layout:ArcadeLayout, games:readonly Pick<GameDescriptor,'id'|'arcadeSection'>[]):ArcadeLayout {
  const next = {originals:[...layout.originals], other:[...layout.other]};
  const placed = new Set([...next.originals, ...next.other]);
  const additions = games.filter(game => !placed.has(game.id)).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const game of additions) next[game.arcadeSection ?? 'other'].push(game.id);
  return next;
}

export function visibleSections<T extends Pick<GameDescriptor,'id'|'arcadeSection'>>(layout:ArcadeLayout, games:readonly T[]) {
  const complete = completeLayout(layout, games);
  const byId = new Map(games.map(game => [game.id,game]));
  return ARCADE_SECTIONS.map(id => ({
    id, label:ARCADE_SECTION_LABELS[id],
    games:complete[id].flatMap(game => byId.has(game) ? [byId.get(game)!] : []),
  }));
}

/** beforeId is a visible neighbor; hidden entries keep their relative placement. */
export function moveGame(layout:ArcadeLayout, game:string, section:ArcadeSection, beforeId?:string):ArcadeLayout {
  if (game === beforeId) return layout;
  const next = {
    originals:layout.originals.filter(id => id !== game),
    other:layout.other.filter(id => id !== game),
  };
  const index = beforeId ? next[section].indexOf(beforeId) : -1;
  next[section].splice(index < 0 ? next[section].length : index, 0, game);
  return next;
}
