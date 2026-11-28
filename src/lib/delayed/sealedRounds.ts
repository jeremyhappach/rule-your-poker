import type {ChildSummary,Home} from './client';
export const SEALED_POLICY='delayed/sealed/1';
export const simultaneousCard=(child:ChildSummary)=>child.flowVersion===SEALED_POLICY||child.game==='five-alive';
export const newSimultaneousCard=(child:ChildSummary,home:Home)=>home.policyVersion===SEALED_POLICY&&simultaneousCard(child);
