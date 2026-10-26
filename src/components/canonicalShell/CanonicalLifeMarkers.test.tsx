// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {CanonicalLifeMarkers,LIFE_LOSS_PRESENTATION_MS} from './CanonicalLifeMarkers';
afterEach(cleanup);
it('holds only the committed lost marker, then reveals Last Chance after it dissolves',()=>{
 const h=render(<CanonicalLifeMarkers losses={3} previous={2} dissolve elapsed={500}/>);
 expect(h.container.querySelectorAll('[data-life-dissolve]')).toHaveLength(1);expect(h.queryByText('Last Chance')).toBeNull();
 const marker=h.container.querySelector<HTMLElement>('[data-life-dissolve]')!;expect(marker.style.animationPlayState).toBe('paused');expect(marker.style.animationDelay).toBe('-500ms');
 h.rerender(<CanonicalLifeMarkers losses={3} previous={2} dissolve elapsed={LIFE_LOSS_PRESENTATION_MS}/>);
 expect(h.container.querySelector('[data-life-dissolve]')).toBeNull();expect(h.getByText('Last Chance')).toBeTruthy();
});
it('does not invent losses for ties or replay historical motion on reconnect',()=>{
 const h=render(<CanonicalLifeMarkers losses={1} previous={1} dissolve elapsed={500}/>);expect(h.container.querySelector('[data-life-dissolve]')).toBeNull();
 h.rerender(<CanonicalLifeMarkers losses={4} previous={3} elapsed={500}/>);expect(h.getByText('Eliminated')).toBeTruthy();expect(h.container.querySelector('[data-life-dissolve]')).toBeNull();
});
