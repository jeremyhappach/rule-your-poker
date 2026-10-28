// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {PlayingCard} from './PlayingCard';
import {CanonicalCardBack} from './canonicalShell/CanonicalCardBack';
const preferences=vi.hoisted(()=>({mode:'two_color'}));
vi.mock('@/hooks/useVisualPreferences',()=>({useVisualPreferences:()=>({getCardBackColors:()=>({color:'#174b38',darkColor:'#123'}),getCardBackId:()=>'',getEffectiveDeckColorMode:()=>preferences.mode}),FOUR_COLOR_SUITS:{'♥':{bg:'#be123c'}}}));
vi.mock('@/hooks/useDeviceSize',()=>({useDeviceSize:()=>({isTablet:false})}));
afterEach(()=>{cleanup();preferences.mode='two_color';});
it.each(['small','medium','large'] as const)('shares %s MegaTouch art behind the canonical resolved-face guard',tier=>{
 const {container,rerender}=render(<PlayingCard card={{rank:'10',suit:'♥'}} frontStyle="megatouch" tier={tier}/>);
 expect(container.querySelector('[data-megatouch-face]')?.getAttribute('data-megatouch-face')).toBe(tier);
 const rank=Number(container.querySelector('[data-megatouch-rank]')?.getAttribute('font-size')),suit=Number(container.querySelector('[data-megatouch-suit]')?.getAttribute('font-size'));
 expect(rank).toBeGreaterThan(suit);
 rerender(<PlayingCard card={{rank:'?',suit:'?'} as any} frontStyle="megatouch" tier={tier}/>);
 expect(container.querySelector('[data-megatouch-face]')).toBeNull();expect(container.querySelector('[data-canonical-card-back]')).not.toBeNull();
});
it('preserves canonical Small/Medium/Large and cartoon consumers unless explicitly opted in',()=>{
 const {container,rerender}=render(<PlayingCard card={{rank:'K',suit:'♠'}} tier="small"/>);
 for(const tier of ['small','medium','large'] as const){rerender(<PlayingCard card={{rank:'K',suit:'♠'}} tier={tier}/>);expect(container.querySelector('[data-megatouch-face]')).toBeNull();expect(container.textContent).toContain('K');}
 rerender(<PlayingCard card={{rank:'K',suit:'♠'}} frontStyle="cartoon" cartoonLayout="royal"/>);
 expect(container.querySelector('[data-cartoon-card-face]')).not.toBeNull();expect(container.querySelector('[data-megatouch-face]')).toBeNull();
});
it('keeps default card-back preferences while admitting explicit souvenir artwork',()=>{
 const {container,rerender}=render(<CanonicalCardBack widthPx={100}/>);
 expect(container.querySelector('[data-cb-accent]')?.getAttribute('data-cb-accent')).toBe('frame');
 rerender(<CanonicalCardBack widthPx={100} artwork={<svg data-souvenir=""/>}/>);
 expect(container.querySelector('[data-souvenir]')).not.toBeNull();
});
it('preserves four-color rank-only semantics for the opt-in face',()=>{
 preferences.mode='four_color';
 const {container}=render(<PlayingCard card={{rank:'A',suit:'♥'}} frontStyle="megatouch" tier="large"/>);
 expect(container.querySelector('[data-megatouch-suit]')).toBeNull();
 expect((container.querySelector('[data-megatouch-face]')!.parentElement as HTMLElement).style.color).toBe('white');
});
