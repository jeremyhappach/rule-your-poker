import type {Board, BoardProjection, Card, Config, Result} from '../run21/model.js';
import type {BoardFeedbackEvent} from '../run21/exact21Feedback.js';
export type ArcadeIntent = {type:'place';column:number}|{type:'pass'|'collect'|'abandon'};
export type RunStatus = 'active'|'completed'|'expired'|'abandoned';
export interface ArcadeConfig extends Config {roundDurationMs:number;scorePresentationMs:number;silverCelebrationMs:number;goldCelebrationMs:number}
export interface SoloState {
 runId:string;userId:string;config:ArcadeConfig;round:number;roundId:string;board:Board;
 deck:Card[];score:number;results:Result[];status:RunStatus;updatedAt:number;
 presentation:{startedAt:number;endsAt:number;from:number;to:number}|null;
 lastPlacement?:{sequence:number;column:number;roundId:string};
}
export interface RunRecord {id:string;user_id:string;game:string;ruleset:string;config:ArcadeConfig;
 revision:number;state:SoloState|null;status:RunStatus;created_at:string;server_at:number}
export interface ArcadeSnapshot {id:string;game:string;ruleset:string;revision:number;status:RunStatus;
 serverAt:number;score:number;view:BoardProjection;dueAt:number|null;events:BoardFeedbackEvent[]}
export interface RankedPlayer {userId:string;name:string;score:number;rank:number;completedAt:string}
export interface Leaderboard {ruleset:string;rows:RankedPlayer[];self:RankedPlayer|null;personalBest:number|null;
 previousBests:{ruleset:string;score:number}[];activeRun:string|null;
 latestResult:{id:string;score:number;status:RunStatus}|null}

