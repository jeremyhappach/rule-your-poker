/** Approved 2026-11-01 handoff. Catalog still owns eligibility, names and order. */
export const APPROVED_TILE_ARTWORK: Readonly<Record<string, {slug:string; infoBottom?:string;source?:string;width?:number;height?:number;embeddedInfo?:{right:string;bottom:string;width:string;height:string}}>> = {
  'river-city-run': {source:'/river-city-run/river-city-run.png',slug:'river-city-run',width:1466,height:564},
  'ship-cap-voyage': {source:'/arcade/approved-v1/ship-cap-voyage-final.png',slug:'ship-cap-voyage',width:1466,height:564},
  'horses-blitz': {source:"/arcade/approved-v1/horses-blitz-final.png",slug:"horses-blitz"},
  '357-drop': {slug:'357-drop',source:'/arcade/approved-v1/357-drop-final.png'},
  run21: {slug:'run21', infoBottom:'9.2cqi'},
  'tri-towers': {slug:'tri-towers'},
  'eleven-up': {slug:'eleven-up'},
  boxdrop: {slug:'boxdrop'},
  'trip-flip': {slug:'trip-flip'},
  'take-two': {slug:'take-two'},
  'royal-flash': {slug:'royal-flash'},
  'mega-card-golf': {slug:'mega-card-golf'},
  'chucky-showdown': {slug:'chucky-showdown-a',source:'/arcade/approved-v1/chucky-showdown-clean.png',infoBottom:'0cqi'},
  'crib-lab': {slug:'crib-lab',source:'/arcade/approved-v1/crib-lab-clean.png'},
  quintzee: {slug:'quintzee'},
};

// Supersede old uploads without rewriting Storage. Subsequent admin replacements
// retain the existing upload/refresh behavior and take precedence over this set.
export const APPROVED_TILE_ARTWORK_AT = '2026-11-01T18:30:00Z';
export function hasNewerTileArtwork(row?: {object_path:string|null; updated_at:string}) {
  return !!row?.object_path && Date.parse(row.updated_at) > Date.parse(APPROVED_TILE_ARTWORK_AT);
}
