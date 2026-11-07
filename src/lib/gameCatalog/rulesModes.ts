import type {ChildSummary} from '@/lib/delayed/client';
import type {GameDescriptor,RulesMode} from './types';

// Exhaustive against the Async client's supported game contract. This describes
// help, never admission: the server's capabilities still govern invitations.
export const ASYNC_RULES_GAMES = {
 'ptown-words':true,run21:true,'tri-towers':true,quintzee:true,boxdrop:true,'mega-card-golf':true,'take-two':true,'crib-lab':true,'chucky-showdown':true,
} satisfies Record<ChildSummary['game'],true>;
export const RULES_MODE_LABELS:Record<RulesMode,string>={multiplayer:'Live multiplayer',arcade:'Arcade',async:'Async'};
export function rulesModes(game:GameDescriptor):RulesMode[]{
 return [...game.modes,...(Object.prototype.hasOwnProperty.call(ASYNC_RULES_GAMES,game.id)?['async' as const]:[])];
}
