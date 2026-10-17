vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {expect,it,vi} from 'vitest';
vi.mock('react',async original=>{const r=await original<typeof import('react')>();return {...r,useLayoutEffect:r.useEffect};});
import {renderToStaticMarkup} from 'react-dom/server';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {act,fixtureMatch,PLAYERS,uuid} from './fixtures';
import {project} from './engine';
import {pendingPlacement,type PendingRun21Action} from './actionPresentation';
it('shows only the known pending card while totals, clock and current authority remain unchanged',()=>{
 const view=project(act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),PLAYERS[0].id);
 const board=view.boards[PLAYERS[0].id]!,command:PendingRun21Action={roundId:view.roundId!,playerId:PLAYERS[0].id,revision:board.revision,requestId:uuid(500),intent:{type:'place',column:0}};
 const html=renderToStaticMarkup(<Run21Felt layout="fullscreen" view={view} now={0} placement={command} pending onIntent={()=>{}}/>);
 expect(html).toContain('data-pending="true"');expect(html).toContain('Running total 0');expect(html).toContain('Confirming');
 expect(board.columns[0]).toHaveLength(0);expect(board.current).not.toBeNull();expect(board.deadline).toBeNull();
 const confirmed=project(act(act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),PLAYERS[0].id,{type:'place',column:0},10),PLAYERS[0].id);
 expect(pendingPlacement(confirmed,command)).toBe(confirmed);
 expect(pendingPlacement({...view,roundId:'different'},command).roundId).toBe('different');
 expect(pendingPlacement({...view,viewerId:PLAYERS[1].id},command).boards).toBe(view.boards);
});
