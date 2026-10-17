import type {Board, BoardProjection, Card, Config, Result} from '../run21/model.js';
import type {BoardFeedbackEvent} from '../run21/exact21Feedback.js';
export type ArcadeIntent = {type:'place';column:number}|{type:'pass'|'collect'|'abandon'};
export type ArcadeRunIntent = ArcadeIntent|{type:'remove';index:number}|{type:'draw'|'take_score'};
export type RunStatus = 'active'|'completed'|'expired'|'abandoned';
export interface ArcadeConfig extends Config {roundDurationMs:number;scorePresentationMs:number;silverCelebrationMs:number;goldCelebrationMs:number}
export interface SoloState {
 runId:string;userId:string;config:ArcadeConfig;round:number;roundId:string;board:Board;
 deck:Card[];score:number;results:Result[];status:RunStatus;updatedAt:number;
 presentation:{startedAt:number;endsAt:number;from:number;to:number}|null;
 lastPlacement?:{sequence:number;column:number;roundId:string};
}
export interface CompletionRecord {priorBest:number|null;kind:"first"|"broken"|"matched"|"lower"}
export interface RunRecord {completion?:CompletionRecord|null;id:string;user_id:string;game:string;ruleset:string;config:ArcadeConfig;
 revision:number;state:SoloState|null;status:RunStatus;created_at:string;server_at:number}
export interface ArcadeSnapshot {completion?:CompletionRecord|null;id:string;game:string;ruleset:string;revision:number;status:RunStatus;
 serverAt:number;score:number;view:BoardProjection;dueAt:number|null;events:BoardFeedbackEvent[]}
export interface TriArcadeView extends Pick<import('../triTowers/model').Projection,'rules'|'phase'|'cards'|'removed'|'waste'|'run'|'score'|'deadline'|'event'|'stockRemaining'> {
 roundId:string;round:number;result:(Omit<import('../triTowers/model').StageResult,'playerId'> & {id:string;scoreBefore:number;stageScore:number;timeBonus:number})|null;
 scorePresentation:{startedAt:number;endsAt:number;from:number;to:number}|null;
}
export interface TriArcadeSnapshot extends Omit<ArcadeSnapshot,'view'|'game'> {game:'tri-towers';view:TriArcadeView;highRun?:number}
export type ArcadeRunSnapshot=ArcadeSnapshot|TriArcadeSnapshot;
export interface RankedPlayer {runId:string;userId:string;name:string;score:number;rank:number;completedAt:string}
export interface Leaderboard {ruleset:string;rows:RankedPlayer[];self:RankedPlayer|null;personalBest:number|null;
 compatibleRulesets?:string[];availableRulesets?:string[];currentRuleset?:string;
 previousBests:{ruleset:string;score:number}[];activeRun:string|null;
 latestResult:{rank?:number|null;id:string;score:number;status:RunStatus;ruleset?:string}|null}

