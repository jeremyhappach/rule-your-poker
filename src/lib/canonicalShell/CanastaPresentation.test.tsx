// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {CanonicalFeltSurface} from './CanonicalFeltSurface';
import {CanonicalTableHeader} from './CanonicalTableHeader';
vi.mock('./feltDebugStore',()=>({recordFeltRenderDebug:vi.fn()}));
afterEach(cleanup);
describe('bounded Canasta presentation',()=>{
  it('shows fixed stake identity without poker No Limit or score-based payments',()=>{
    const {container}=render(<CanonicalFeltSurface gameKind="canasta" anteAmount={10}/>);
    expect(container.textContent).toContain('$10 CANASTA');
    expect(container.textContent).not.toContain('No Limit');
  });
  it('preserves the existing poker and Gin plate branches',()=>{
    const {container,rerender}=render(<CanonicalFeltSurface gameKind="holm-game" anteAmount={10}/>);
    expect(container.textContent).toContain('No Limit');
    rerender(<CanonicalFeltSurface gameKind="gin-rummy" anteAmount={10} pointsToWin={100}/>);
    expect(container.textContent).toContain('$10 GIN RUMMY');
    expect(container.textContent).toContain('100 pts to win');
  });
  it('retains route actions and title in the extracted normal header',()=>{
    const {getByRole,getByText}=render(<CanonicalTableHeader title="Canasta"><button>Options</button></CanonicalTableHeader>);
    expect(getByRole('button',{name:'Options'})).toBeTruthy();
    expect(getByText('PPL')).toBeTruthy();
    expect(getByText('Canasta')).toBeTruthy();
  });
});
