import {describe,expect,it,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {getRun21ArtifactDescriptors,RUN21_ARTIFACTS,RUN21_GEOMETRY_DEFAULTS,sanitizeGeometry} from './geometry';
import {RUN21_DISCOVERY,run21Setup} from './discovery';
import {uuid} from './fixtures';
import {drawPairRect} from './safeFelt';
import {enumerateAnchoredArtifacts,findCanonicalDescriptor,GAME_KEYS} from '../geometryLab/descriptorIndex';

describe('Run21 additive registration contracts',()=>{
  it('uses the shared Geometry Lab discovery with the live descriptor factory',()=>{
    expect(GAME_KEYS).toContain('run21');
    expect(enumerateAnchoredArtifacts('run21')).toEqual(getRun21ArtifactDescriptors());
    for(const item of RUN21_ARTIFACTS) expect(findCanonicalDescriptor(item.artifactId)?.game).toBe('run21');
    for(const game of GAME_KEYS.filter(g=>g!=='run21')) expect(enumerateAnchoredArtifacts(game).length).toBeGreaterThan(0);
  });
  it('keeps every artifact under run21 and inside the felt container',()=>{
    const descriptors=getRun21ArtifactDescriptors();
    expect(new Set(descriptors.map(d=>d.id)).size).toBe(RUN21_ARTIFACTS.length);
    expect(descriptors.map(d=>d.id)).toEqual(RUN21_ARTIFACTS.map(d=>d.artifactId));
    const draw=drawPairRect([],1.09);
    for(const d of descriptors){
      expect(d.id.startsWith('run21.')).toBe(true);
      const parent=['run21.deck','run21.currentCard','run21.pass','run21.help'].includes(d.id)?draw:{x:0,y:0,width:1,height:1};
      expect(parent.x+(d.anchorX!-d.widthPct!/2)*parent.width).toBeGreaterThanOrEqual(0);
      expect(parent.x+(d.anchorX!+d.widthPct!/2)*parent.width).toBeLessThanOrEqual(1);
      expect(parent.y+(d.anchorY!-d.heightPct!/2)*parent.height).toBeGreaterThanOrEqual(0);
      expect(parent.y+(d.anchorY!+d.heightPct!/2)*parent.height).toBeLessThanOrEqual(1);
    }
  });
  it('sanitizes drafts without mutating the defaults',()=>{
    expect(sanitizeGeometry(null)).toEqual(RUN21_GEOMETRY_DEFAULTS);
    expect(sanitizeGeometry({boardWidth:99,boardY:NaN,boardHeight:-1})).toMatchObject({boardWidth:.98,boardY:.53,boardHeight:.82});
    const before=JSON.stringify(RUN21_GEOMETRY_DEFAULTS);getRun21ArtifactDescriptors({boardWidth:.7,boardY:.3,boardHeight:.3,controlsY:.8});
    expect(JSON.stringify(RUN21_GEOMETRY_DEFAULTS)).toBe(before);
  });
  it('classifies Run21 under Other with one two-player match stake',()=>{
    expect(RUN21_DISCOVERY).toMatchObject({family:'Other',players:2,stakeMode:'match',roundWager:false});
    expect(run21Setup(10,[uuid(1),uuid(2)]).stake).toBe(10);
    expect(()=>run21Setup(10,[uuid(1),uuid(1)])).toThrow();
    expect(()=>run21Setup(-1,[uuid(1),uuid(2)])).toThrow();
  });
});
