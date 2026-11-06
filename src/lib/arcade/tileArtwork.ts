/** Approved 2026-11-01 handoff. Catalog still owns eligibility, names and order. */
export const APPROVED_TILE_ARTWORK: Readonly<Record<string, {slug:string; infoBottom?:string}>> = {
  run21: {slug:'run21', infoBottom:'9.2cqi'},
  'tri-towers': {slug:'tri-towers'},
  'eleven-up': {slug:'eleven-up'},
  boxdrop: {slug:'boxdrop'},
  'trip-flip': {slug:'trip-flip'},
  'take-two': {slug:'take-two'},
  'royal-flash': {slug:'royal-flash'},
  'mega-card-golf': {slug:'mega-card-golf'},
  'crib-lab': {slug:'crib-lab'},
  quintzee: {slug:'quintzee'},
};

// Supersede old uploads without rewriting Storage. Subsequent admin replacements
// retain the existing upload/refresh behavior and take precedence over this set.
export const APPROVED_TILE_ARTWORK_AT = '2026-11-01T18:30:00Z';
export function hasNewerTileArtwork(row?: {object_path:string|null; updated_at:string}) {
  return !!row?.object_path && Date.parse(row.updated_at) > Date.parse(APPROVED_TILE_ARTWORK_AT);
}
