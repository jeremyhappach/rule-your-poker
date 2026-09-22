import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('react',async original=>{const r=await original<typeof import('react')>();return {...r,useLayoutEffect:r.useEffect};});
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
const preference=vi.hoisted(()=>({mode:'two_color',back:'hawks'}));
vi.mock('@/hooks/useVisualPreferences',async original=>{
  const actual=await original<typeof import('@/hooks/useVisualPreferences')>();
  return {...actual,useVisualPreferences:()=>({...actual.useVisualPreferences(),getEffectiveDeckColorMode:()=>preference.mode,getCardBackId:()=>preference.back})};
});
import {PlayingCard} from '@/components/PlayingCard';
import {Run21Card,Run21Felt} from '@/components/run21/Run21Felt';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {standardDeck} from './rules';
import {fixtureMatch,PLAYERS,act} from './fixtures';
import {project} from './engine';
import type {Suit} from '@/lib/cardUtils';
import {CanonicalFeltSurface,type CanonicalFeltGameKind} from '@/lib/canonicalShell/CanonicalFeltSurface';
const suits={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠'};
describe('Run21 canonical renderer parity',()=>{
  it.each([
    ['run21','RUN 21'],['holm-game','Holm'],['three-five-seven','3-5-7'],['horses','HORSES'],
    ['ship-captain-crew','SHIP'],['yahtzee','YAHTZEE'],['gin-rummy','GIN RUMMY'],['cribbage','CRIBBAGE'],
  ])('keeps %s registered in the existing canonical plate', (kind,label)=>{
    const html=renderToStaticMarkup(<CanonicalFeltSurface gameKind={kind as CanonicalFeltGameKind} anteAmount={10} feltPlateMode="GAME"/>);
    expect(html).toContain(`data-canonical-felt-rendered-game="${label}"`);
    expect(html).toContain('data-canonical-felt-rendered-stakes="$10"');
    if(kind==='run21')expect(html).toContain('$10 RUN 21');
  });
  it.each(['two_color','four_color'])('matches production PlayingCard markup for all 52 %s faces',mode=>{
    preference.mode=mode;
    for(const card of standardDeck()){
      const canonical=renderToStaticMarkup(<PlayingCard card={{rank:card.rank,suit:suits[card.suit] as Suit}} size="sm" faceFillPx={24} style={{width:24,height:36}}/>);
      expect(renderToStaticMarkup(<Run21Card card={card}/>)).toContain(canonical);
    }
  });
  it.each(['hawks','bulls','bears','cubs','blue'])('inherits the same canonical %s back preference and asset',back=>{
    preference.back=back;
    const canonical=renderToStaticMarkup(<PlayingCard isHidden size="sm" faceFillPx={24} style={{width:24,height:36}}/>);
    const html=renderToStaticMarkup(<Run21Card card={null}/>);
    expect(html).toContain(canonical);expect(html).toContain(`data-cb-pref-id="${back}"`);
  });
  it('replaces the strip with help and provides all requested scoring rules',()=>{
    const id=PLAYERS[0].id,m=act(fixtureMatch(),id,{type:'ready'},0);
    const html=renderToStaticMarkup(<Run21Felt view={project(m,id)} now={0} drawRect={{x:.35,y:.75,width:.3,height:.22}}/>);
    expect(html).toContain('Run21 scoring help');expect(html).not.toContain('run21.multipliers');
    const help=renderToStaticMarkup(<Run21ScoringReference/>);
    for(const score of ['97','98','99','100','101','102','103','104','105','50×','100×','150×','200×','250×','300×','400×','500×','1,000×'])expect(help).toContain(score);
    expect(help).toContain('total 97+');expect(help).toContain('One Pass per round');
    expect(help).toContain('Any bust or timer expiration scores 0');
    expect(help).not.toContain('payout');
  });
});
