import type { ArtifactDescriptor } from '../wave4LayoutResolver/types';
import type { ArtifactPresentationEntry } from '../geometryLab/artifactRegistry';
import { registerDomain } from '../geometryLab/defaultsRegistry';
import {DRAW_HELP} from './safeFelt';

export const RUN21_GEOMETRY_KEY = 'run21.geometry';
export interface Run21Geometry { boardWidth: number; boardY: number; boardHeight: number; controlsY: number }
export const RUN21_GEOMETRY_DEFAULTS: Run21Geometry = {boardWidth: 0.96, boardY: 0.53, boardHeight: 0.88, controlsY: 0.88};
export function sanitizeGeometry(raw: unknown): Run21Geometry {
  const input = raw && typeof raw === 'object' ? raw as Partial<Run21Geometry> : {};
  const n = (key: keyof Run21Geometry, min: number, max: number) => typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(min, Math.min(max, input[key]!)) : RUN21_GEOMETRY_DEFAULTS[key];
  return {boardWidth:n('boardWidth',0.80,0.98),boardY:n('boardY',0.53,0.54),boardHeight:n('boardHeight',0.82,0.88),controlsY:n('controlsY',0.87,0.88)};
}
/** Explicit registration only; importing game code never registers or writes shared defaults. */
export function registerRun21Geometry() {
  registerDomain({key:RUN21_GEOMETRY_KEY,defaults:RUN21_GEOMETRY_DEFAULTS,sanitize:sanitizeGeometry});
}
function rect(id: string, x: number, y: number, w: number, h: number): ArtifactDescriptor {
  const zero = {value:0,unit:'px' as const};
  return {id:`run21.${id}`,owner:'Run21Felt',composeMode:'anchored',preferredSize:{width:zero,height:zero},minimumSize:{width:zero,height:zero},
    priority:90,collapsePriority:'never',anchorX:x,anchorY:y,anchorOrigin:'center',widthPct:w,heightPct:h};
}
export function getRun21ArtifactDescriptors(geometry: Run21Geometry = RUN21_GEOMETRY_DEFAULTS): ArtifactDescriptor[] {
  const g=sanitizeGeometry(geometry);
  return [rect('board',0.5,g.boardY,g.boardWidth,g.boardHeight),rect('deck',0.23,0.5,0.46,1),
    rect('currentCard',0.77,0.5,0.46,1),
    rect('help',DRAW_HELP.x,DRAW_HELP.y,DRAW_HELP.width,DRAW_HELP.height),
    rect('resultOverlay',0.50,0.35,0.86,0.14)];
}
export const RUN21_ARTIFACTS: ArtifactPresentationEntry[] = [
  ['board','Five columns'],['deck','Deck'],['currentCard','Current card'],
  ['help','Scoring help'],['resultOverlay','Round result'],
].map(([id,label],sortOrder)=>({artifactId:`run21.${id}`,label,sortOrder,category:id==='resultOverlay'?'overlay':'central'}));
export const RUN21_PREVIEWS = ['active','remote','column-counts','maximum-depth','pass-used','collect-available','collect-unavailable','bust','time-expired','round-reveal'] as const;
export type Run21Preview = typeof RUN21_PREVIEWS[number];
