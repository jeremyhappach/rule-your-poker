export interface OptionalBonus {actor:string;choice:'pending'|'play'|'skip'|'expired'}
export type BonusIntent={type:'bonus_play'|'bonus_skip'};
export const isBonusIntent=(intent:{type:string}):intent is BonusIntent=>intent.type==='bonus_play'||intent.type==='bonus_skip';
export const bonusArguments=(game:string,id:string,command:{requestId:string;revision:number;intent:BonusIntent})=>({
 p_game:game,p_dealer_game_id:id,p_request_id:command.requestId,p_revision:command.revision,p_choice:command.intent.type==='bonus_play'?'play':'skip',
});
