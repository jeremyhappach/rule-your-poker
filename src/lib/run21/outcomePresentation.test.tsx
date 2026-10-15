import {expect,it,vi} from 'vitest';
vi.mock('react',async original=>{const r=await original<typeof import('react')>();return {...r,useLayoutEffect:r.useEffect};});
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {renderToStaticMarkup} from 'react-dom/server';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21Timer} from '@/components/run21/Run21PlayerPane';
import {act,fixtureMatch,PLAYERS} from './fixtures';
import {project} from './engine';
import {DEFAULT_CONFIG,type Result} from './model';
import {outcomePresentation,qualificationThreshold} from './outcomePresentation';
import {run21Announcement} from './announcement';

it('uses the frozen scoring table rather than a second hardcoded threshold',()=>{
 expect(qualificationThreshold(DEFAULT_CONFIG)).toBe(97);
 expect(qualificationThreshold({...DEFAULT_CONFIG,multipliers:{90:50,91:100}})).toBe(90);
});
it('renders a qualified alternate-config total from actual accepted placements',()=>{
 let m=act(fixtureMatch({...DEFAULT_CONFIG,multipliers:{7:50}},[{rank:'7',suit:'clubs'}]),PLAYERS[0].id,{type:'ready'},0);
 m=act(m,PLAYERS[0].id,{type:'place',column:0},1);
 const view=project(m,PLAYERS[0].id);
 const html=renderToStaticMarkup(<Run21Felt layout="fullscreen" view={view} now={100} onIntent={()=>{}} pending/>);
 expect(html).toContain('Running total 7; qualify at 7');expect(html).toContain('data-qualified="true"');
 expect(html).toContain('data-run21-turn-state="active"');
});
it.each(['collect','bust','timeout','exhausted'] as const)('zero-point %s has failure narration and no multiplication',reason=>{
 const view=project(act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),PLAYERS[0].id);
 const result:Result={reason,at:100,aggregate:10,totals:[10,0,0,0,0],aceElevations:[0,0,0,0,0],multiplier:0,speed:249,score:0};
 view.boards[PLAYERS[0].id]!.result=result;
 view.scorePresentation={playerId:PLAYERS[0].id,startedAt:100,endsAt:5100,from:0,to:0};
 const html=renderToStaticMarkup(<Run21Felt layout="fullscreen" view={view} now={100}/>);
 expect(html).toContain(reason==='bust'?'Busted!':'No Qualify!');
 expect(html).not.toContain(' × ');expect(html).not.toContain('scored 10');
 expect(run21Announcement(view).title).toContain(reason==='bust'?'busted!':'did not qualify.');
});
it('preserves a genuine positive result even in a historical alternate ruleset',()=>{
 const result={reason:'exhausted',aggregate:100,score:50000} as Result;
 expect(outcomePresentation(result,'Winner').announcement).toBe('Winner scored 100!');
});
it.each([true,false])('distinguishes active and watching before first placement (%s)',self=>{
 const view=project(act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),self?PLAYERS[0].id:PLAYERS[1].id);
 view.boards[PLAYERS[0].id]!.firstPlacementDeadline=30000;
 const html=renderToStaticMarkup(<Run21Felt layout="fullscreen" view={view} now={100} onIntent={()=>{}}/>);
 expect(html).toContain(`data-run21-turn-state="${self?'active':'watching'}"`);
 expect(html).toContain('data-qualified="false"');
 expect(renderToStaticMarkup(<Run21Timer view={view} now={100}/>)).toContain(self?'Place your first card':'Watching · First placement');
});
