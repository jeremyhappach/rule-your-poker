import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Run21RoundIntro} from '@/components/run21/Run21RoundIntro';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {DEFAULT_CONFIG} from '@/lib/run21/model';
import {RUN21_RULES} from '@/lib/run21/rulesets';
import {act,fixtureMatch,PLAYERS} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
const mocks=vi.hoisted(()=>({upload:vi.fn(),remove:vi.fn(),single:vi.fn(),update:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 storage:{from:()=>({upload:mocks.upload,remove:mocks.remove})},
 from:()=>({update:(value:unknown)=>{mocks.update(value);const q={eq:()=>q,is:()=>q,select:()=>q,single:mocks.single};return q;}})
}}));
import {replaceArtwork,validateArtwork} from './artwork';

describe('Arcade presentation isolation',()=>{
 it('omits turn language only for solo without changing intro admission',()=>{
  const view=project(act(fixtureMatch({...DEFAULT_CONFIG,firstPlacementSeconds:30,roundIntroMs:2500}),PLAYERS[0].id,{type:'ready'},1000),PLAYERS[0].id);
  expect(renderToStaticMarkup(<Run21RoundIntro view={view} now={1000}/>)).toContain('YOUR TURN');
  const solo=renderToStaticMarkup(<Run21RoundIntro view={view} now={1000} solo/>);
  expect(solo).toContain('ROUND 1');expect(solo).not.toContain('YOUR TURN');
  expect(renderToStaticMarkup(<Run21RoundIntro view={view} now={3500} solo/>)).toBe('');
 });
 it('shows actual current and legacy frozen rules, including custom multipliers',()=>{
  const current=renderToStaticMarkup(<Run21ScoringReference config={RUN21_RULES} solo/>);
  expect(current).toContain('106.8');expect(current).toContain('when the round introduction ends');
  expect(current).toContain('0.42');expect(current).toContain('0.9');expect(current).not.toMatch(/pause|first-placement/);
  const legacy=renderToStaticMarkup(<Run21ScoringReference config={{...DEFAULT_CONFIG,firstPlacementSeconds:17,multipliers:{99:123}}} solo/>);
  expect(legacy).toContain('when you place your first card');expect(legacy).toContain('17 seconds');expect(legacy).toContain('123×');expect(legacy).not.toContain('1,000×');
  expect(renderToStaticMarkup(<Run21ScoringReference/>)).toContain('real-money sessions pause');
 });
});
describe('artwork replacement failures',()=>{
 const file={size:10,type:'image/png'} as File;
 beforeEach(()=>{vi.clearAllMocks();mocks.upload.mockResolvedValue({error:null});mocks.single.mockResolvedValue({data:{game:'run21',object_path:'run21/new.png'},error:null});mocks.remove.mockResolvedValue({error:null});});
 it('rejects unsupported, empty and oversized files before upload',async()=>{
  for(const bad of [{size:10,type:'image/svg+xml'},{size:0,type:'image/png'},{size:2097153,type:'image/webp'}])expect(()=>validateArtwork(bad)).toThrow();
  await expect(replaceArtwork('run21',{size:3e6,type:'image/png'} as File,null)).rejects.toThrow();
  expect(mocks.upload).not.toHaveBeenCalled();
 });
 it('never changes metadata or removes the old image after an upload failure',async()=>{
  mocks.upload.mockResolvedValue({error:Error('denied')});
  await expect(replaceArtwork('run21',file,'run21/old.png')).rejects.toThrow('previous artwork is unchanged');
  expect(mocks.update).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('retains both files after a conflict or ambiguous metadata outcome',async()=>{
  mocks.single.mockResolvedValue({data:null,error:Error('conflict')});
  await expect(replaceArtwork('run21',file,'run21/old.png')).rejects.toThrow('not confirmed');
  expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('publishes before cleanup and ignores cleanup transport failure',async()=>{
  mocks.remove.mockRejectedValue(Error('offline'));
  expect(await replaceArtwork('run21',file,'run21/old.png')).toMatchObject({game:'run21'});
  expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
 });
});
