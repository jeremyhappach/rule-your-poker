/** Presentation only. This map never grants async availability or admission. */
export interface AsyncGameBrand {
  theme:string;
  logo?:string;
  motif?:string;
  letterTiles?:boolean;
}
const artwork=(id:string,theme:string):AsyncGameBrand=>({
  theme,logo:`/game-branding/async-v1/${id}-logo.webp`,motif:`/game-branding/async-v1/${id}-motif.webp`,
});
export const ASYNC_GAME_BRANDING:Readonly<Record<string,AsyncGameBrand>>={
  'ptown-words':{theme:'#123f58',letterTiles:true},
  run21:artwork('run21','#123c2b'),
  'tri-towers':artwork('tri-towers','#30204d'),
  quintzee:artwork('quintzee','#173b62'),
  boxdrop:artwork('boxdrop','#19455b'),
  'take-two':artwork('take-two','#322544'),
  'royal-flash':artwork('royal-flash','#30234d'),
  'mega-card-golf':artwork('mega-card-golf','#20482d'),
  'trip-flip':artwork('trip-flip','#173f60'),
  'eleven-up':artwork('eleven-up','#154138'),
};
