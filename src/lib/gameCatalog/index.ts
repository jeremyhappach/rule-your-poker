import quintzee from './games/quintzee';
import megaGolf from './games/mega-card-golf';
import golf from './games/six-card-golf';
import battle31 from './games/battle-31';
import canasta from './games/canasta';
import game0 from './games/holm';
import game1 from './games/3-5-7';
import game2 from './games/cribbage';
import game3 from './games/gin-rummy';
import game4 from './games/horses';
import game5 from './games/ship-captain-crew';
import game6 from './games/yahtzee';
import game7 from './games/farkle';
import game8 from './games/run21';
import game9 from './games/tri-towers';
import game10 from './games/eleven-up';
import game11 from './games/boxdrop';
import game12 from './games/trip-flip';
import game13 from './games/take-two';
import game14 from './games/royal-flash';
import racePoker from './games/race-poker';
import type {GameDescriptor, Category, Capability} from './types';
export type {GameDescriptor, Category, Capability} from './types';
export const GAME_CATALOG: readonly GameDescriptor[] = [game0,game1,game2,game3,game4,game5,game6,game7,game8,game9,game10,game11,game12,game13,game14,canasta,golf,racePoker,battle31,megaGolf,quintzee];
export const CATEGORIES: readonly Category[] = ['cards','dice','other'];
export const CATEGORY_LABELS: Record<Category,string> = {cards:'Cards',dice:'Dice',other:'Other'};
export function findGame(id: string | null | undefined) {
 const normalized = id==='holm'?'holm-game':id==='357'||id==='3-5-7-game'?'3-5-7':id;
 return GAME_CATALOG.find(game=>game.id===normalized);
}
export const ARCADE_GAMES = GAME_CATALOG.filter(game=>game.modes.includes('arcade'));
export type Availability = Partial<Record<Capability,boolean>>;
export interface Roster {players:number;humans:number;realMoney?:boolean}
export function isDiscovered(game:GameDescriptor, access:Availability) {
 return game.availability==='existing-setup'||access[game.availability]===true;
}
/** Presentation only: the setup RPC still validates the exact active roster and consent. */
export function eligibility(game:GameDescriptor, roster:Roster, access:Availability): string | null {
 if(!isDiscovered(game,access)) return 'Currently unavailable';
 if(!game.modes.includes('multiplayer')) return 'Arcade only';
 if(game.moneyModes&&!game.moneyModes.includes(roster.realMoney===false?'fake':'real')) return 'Fake money only';
 if(roster.humans<1||roster.humans>roster.players) return 'A human player is required';
 if(roster.players<game.players.min||roster.players>game.players.max)
  return game.players.min===game.players.max?'Exactly '+game.players.min+' players':game.players.min+'–'+game.players.max+' players';
 if(game.bots==='unsupported'&&roster.humans!==roster.players) return 'Humans only';
 if(game.bots==='fake-money-only'&&roster.realMoney!==false&&roster.humans!==roster.players) return 'Bots require fake money';
 return null;
}
