// @vitest-environment jsdom
import {act,render,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {GameBackground} from './GameBackground';
import {GAME_BACKGROUNDS} from '@/lib/gameBackgrounds/catalog';
const {download}=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/lib/arcade/artwork',()=>({downloadArtwork:download}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();download.mockReset();});
describe('authoritative background presentation',()=>{
 it('never displays the previous game photo during an identity change',async()=>{
  const create=vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=vi.fn();});
  let finish:(blob:Blob)=>void=()=>{};
  download.mockResolvedValueOnce(new Blob()).mockImplementationOnce(()=>new Promise<Blob>(resolve=>{finish=resolve;}));
  const view=render(<GameBackground id={GAME_BACKGROUNDS[0].id}/>);
  await waitFor(()=>expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:first'));
  view.rerender(<GameBackground id={GAME_BACKGROUNDS[1].id}/>);
  expect(view.container.querySelector('img')).toBeNull();
  await act(async()=>finish(new Blob()));
  expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:second');
  view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
 });
 it('does not choose a random background or request arbitrary object paths',()=>{
  const view=render(<GameBackground id="unknown/photo.png"/>);
  expect(download).not.toHaveBeenCalled();expect(view.container.querySelector('img')).toBeNull();
  view.unmount();
 });
});
